
import fs from 'fs';

// --- Linear Regression Engine (Matrix Math) ---
class Matrix {
    data: number[][];
    rows: number;
    cols: number;

    constructor(data: number[][]) {
        this.data = data;
        this.rows = data.length;
        this.cols = data[0].length;
    }

    static fromArray(arr: number[]): Matrix {
        return new Matrix(arr.map(x => [x]));
    }

    transpose(): Matrix {
        const newData = Array(this.cols).fill(0).map(() => Array(this.rows).fill(0));
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.cols; j++) {
                newData[j][i] = this.data[i][j];
            }
        }
        return new Matrix(newData);
    }

    multiply(other: Matrix): Matrix {
        if (this.cols !== other.rows) throw new Error("Matrix dimensions wrong for mult");
        const newData = Array(this.rows).fill(0).map(() => Array(other.cols).fill(0));
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < other.cols; j++) {
                let sum = 0;
                for (let k = 0; k < this.cols; k++) {
                    sum += this.data[i][k] * other.data[k][j];
                }
                newData[i][j] = sum;
            }
        }
        return new Matrix(newData);
    }

    inverse(): Matrix {
        // Simplified Gaussian elimination for inversion (only works closely for square matrices like Covariance)
        // For OLS: (X'X)^-1
        // Using a library-less adjugate method for small features is safer, or Gauss-Jordan.
        // Given we have few features (Intercept + SmartVal + Price + Home + Fixture = 5), Gauss-Jordan is fine.
        return Matrix.gaussJordanInverse(this);
    }

    static gaussJordanInverse(m: Matrix): Matrix {
        if (m.rows !== m.cols) throw new Error("Must be square");
        const n = m.rows;
        const aug = m.data.map(row => [...row, ...Array(n).fill(0).map((_, i) => i === m.data.indexOf(row) ? 1 : 0)]);

        for (let i = 0; i < n; i++) {
            let pivot = aug[i][i];
            if (Math.abs(pivot) < 1e-10) { /* simplified swap logic ommitted for brevity, prone to singular error */ }
            for (let j = 0; j < 2 * n; j++) aug[i][j] /= pivot;
            for (let k = 0; k < n; k++) {
                if (k !== i) {
                    const factor = aug[k][i];
                    for (let j = 0; j < 2 * n; j++) aug[k][j] -= factor * aug[i][j];
                }
            }
        }
        return new Matrix(aug.map(row => row.slice(n)));
    }
}

class LinearRegression {
    weights: number[] = [];

    fit(X: number[][], y: number[]) {
        // Beta = (X'X)^-1 X'y
        // Add bias column (1s) to X
        const X_b = X.map(row => [1, ...row]);
        const mX = new Matrix(X_b);
        const mY = Matrix.fromArray(y);

        const mXt = mX.transpose();
        const mXtX = mXt.multiply(mX);
        const mXtX_inv = mXtX.inverse();
        const mXtY = mXt.multiply(mY);
        const theta = mXtX_inv.multiply(mXtY);

        this.weights = theta.data.map(row => row[0]);
    }

    predict(X: number[][]): number[] {
        return X.map(row => {
            const r = [1, ...row];
            return r.reduce((sum, val, idx) => sum + val * this.weights[idx], 0);
        });
    }
}

// --- Data Fetching ---

const BASE_URL = 'https://fantasy.premierleague.com/api';
async function fetchJson(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Fetch failed');
    return await response.json();
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// --- Analysis Logic ---

async function main() {
    console.log("Fetching Data...");
    const staticData = await fetchJson(`${BASE_URL}/bootstrap-static/`);
    const elements = staticData.elements;

    // We need standard max values for Smart Value normalization
    // Approximating maxes purely for the sake of scaling (doesn't need to be perfect dynamic max)
    const MAX_MIN = 90;
    const MAX_INF = 60;
    const MAX_THR = 60;
    const MAX_ICT_VAL = 2.0; // approx

    const dataset: { features: number[], target: number, gw: number, name: string }[] = [];

    let processed = 0;
    // Process top 150 players by points to save time/requests? No, lets do more to get good data.
    // Let's filter to players who have played at least some minutes.
    const relevantPlayers = elements.filter((p: any) => parseFloat(p.form) > 0.5 || p.total_points > 20);

    for (const player of relevantPlayers) {
        try {
            const summary = await fetchJson(`${BASE_URL}/element-summary/${player.id}/`);
            const history = summary.history;

            const historyWindow: any[] = [];

            for (const match of history) {
                const gw = match.round;
                if (gw > 21) continue;

                const targetPoints = match.total_points;
                const price_raw = match.value;
                const targetValue = price_raw > 0 ? (targetPoints / (price_raw / 10)) : 0;

                // Feature Engineering based on PAST historyWindow
                if (historyWindow.length >= 3) { // Need 3 games history
                    // 1. Calculate History Stats (Last 5)
                    const last5 = historyWindow.slice(-5);
                    const avgMin = last5.reduce((a: number, b: any) => a + b.minutes, 0) / last5.length;
                    const avgInf = last5.reduce((a: number, b: any) => a + parseFloat(b.influence), 0) / last5.length;
                    const avgThr = last5.reduce((a: number, b: any) => a + parseFloat(b.threat), 0) / last5.length;
                    const avgIct = last5.reduce((a: number, b: any) => a + parseFloat(b.ict_index), 0) / last5.length;

                    // 2. Calculate Smart Value (Lagged)
                    let smartValue = 0;
                    const normMin = Math.min(avgMin / MAX_MIN, 1);
                    const normInf = Math.min(avgInf / MAX_INF, 1);
                    const normThr = Math.min(avgThr / MAX_THR, 1);
                    const price = last5[last5.length - 1].value;
                    const ictVal = price > 0 ? (avgIct / price) : 0;
                    const normIctVal = Math.min(ictVal / MAX_ICT_VAL, 1);

                    if (player.element_type === 2) { // DEF
                        smartValue = (0.5 * normMin) + (0.3 * normInf) + (0.2 * normIctVal);
                    } else if (player.element_type === 3) { // MID
                        smartValue = (0.4 * normMin) + (0.3 * normInf) + (0.3 * normIctVal);
                    } else if (player.element_type === 4) { // FWD
                        smartValue = (0.4 * normMin) + (0.4 * normThr) + (0.2 * normIctVal);
                    } else { // GKP usually treated like DEF
                        smartValue = (0.5 * normMin) + (0.3 * normInf) + (0.2 * normIctVal);
                    }

                    // 3. Other Features
                    const wasHome = match.was_home ? 1 : 0;
                    // Mock fixture difficulty (using simplistic opponent strength proxy if available, else random noise/omit)
                    // Since fetching fixture details is complex and blocked by rate limits, let's use Price as a proxy for Quality.
                    // And 'was_home'.

                    // Feature Vector: [SmartValue, Price, WasHome]
                    // Avoiding collinearity (Min, Inf, etc are inside SmartValue)
                    dataset.push({
                        features: [smartValue, price, wasHome],
                        target: targetValue,
                        gw: gw,
                        name: player.web_name
                    });
                }
                historyWindow.push(match);
            }

            processed++;
            if (processed % 20 === 0) process.stdout.write('.');
            await sleep(10);
        } catch (e) { }
    }

    console.log(`\nTotal Data Points: ${dataset.length}`);

    // --- Split ---
    const train = dataset.filter(d => d.gw <= 15);
    const test = dataset.filter(d => d.gw > 15 && d.gw <= 21);

    console.log(`Training Set (GW 1-15): ${train.length}`);
    console.log(`Testing Set (GW 16-21): ${test.length}`);

    // --- Train ---
    const X_train = train.map(d => d.features);
    const y_train = train.map(d => d.target);

    const model = new LinearRegression();

    try {
        model.fit(X_train, y_train);

        console.log("\n--- Model Trained ---");
        console.log("Coefficients:");
        console.log(`Intercept: ${model.weights[0].toFixed(4)}`);
        console.log(`Smart Value: ${model.weights[1].toFixed(4)}`);
        console.log(`Price: ${model.weights[2].toFixed(4)}`);
        console.log(`Home Advantage: ${model.weights[3].toFixed(4)}`);

        // --- Evaluate ---
        const X_test = test.map(d => d.features);
        const y_test = test.map(d => d.target);
        const y_pred = model.predict(X_test);

        // Metrics
        let mae = 0;
        let mse = 0;
        let y_mean = y_test.reduce((a, b) => a + b, 0) / y_test.length;
        let ss_tot = 0;
        let ss_res = 0;

        for (let i = 0; i < y_test.length; i++) {
            const err = y_test[i] - y_pred[i];
            mae += Math.abs(err);
            mse += err * err;
            ss_res += err * err;
            ss_tot += (y_test[i] - y_mean) ** 2;
        }
        mae /= y_test.length;
        mse /= y_test.length;
        const rmse = Math.sqrt(mse);
        const r2 = 1 - (ss_res / ss_tot);

        console.log("\n--- Evaluation Results (GW 16-21) ---");
        console.log(`MAE (Mean Absolute Error): ${mae.toFixed(4)}`);
        console.log(`RMSE (Root Mean Sq Error): ${rmse.toFixed(4)}`);
        console.log(`R² Score: ${r2.toFixed(4)}`);

        console.log("\n--- Sample Predictions ---");
        for (let i = 0; i < 10; i++) {
            // Pick random 
            const idx = Math.floor(Math.random() * test.length);
            const t = test[idx];
            const p = y_pred[idx];
            console.log(`${t.name} (GW${t.gw}): Actual=${t.target.toFixed(2)}, Pred=${p.toFixed(2)}, Err=${Math.abs(t.target - p).toFixed(2)}`);
        }

    } catch (e) {
        console.error("Model Training Failed (likely singular matrix or math error):", e);
    }
}

main().catch(console.error);
