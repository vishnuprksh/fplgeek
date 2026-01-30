
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

const ITERATIONS = 2000;
const LAMBDAS = [0.1, 0.3, 0.5, 0.8, 1.2];

// Features to optimize weights for
const FEATURES = ['xg', 'xa', 'cs', 'saves', 'xgc_inv', 'minutes_rel'];

// Position Names
const POS_NAMES: { [key: number]: string } = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };

function getAbsoluteRound(h: any): number {
    const round = h.round || 999;
    if (h.season_name === '2024/25' || h.season === '2024/25') return round;
    return 38 + round;
}

// EMA Helper
function calculateEMA(values: number[], lambda: number): number {
    if (values.length === 0) return 0;
    let num = 0, den = 0;
    for (let i = 0; i < values.length; i++) {
        const age = values.length - 1 - i;
        const w = Math.exp(-lambda * age);
        num += values[i] * w;
        den += w;
    }
    return den === 0 ? 0 : num / den;
}

// Calculate Pearson Correlation
function calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 2) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumX2 += x[i] * x[i];
        sumY2 += y[i] * y[i];
    }
    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return den === 0 ? 0 : num / den;
}

async function optimize() {
    console.log("🚀 Starting Smart Value Hyperparameter Optimization...");

    // 1. Load Data
    const players = db.prepare("SELECT data FROM players").all().map((r: any) => JSON.parse(r.data));
    const historyRows = db.prepare("SELECT player_id, data FROM player_history").all();
    const historyMap = historyRows.reduce((acc: any, r: any) => {
        if (!acc[r.player_id]) acc[r.player_id] = [];
        const h = JSON.parse(r.data);
        h._absRound = getAbsoluteRound(h);
        acc[r.player_id].push(h);
        return acc;
    }, {});

    // 2. Pre-process Feature Vectors per Lambda
    // Structure: data[pos][lambda] = [{ features: [], nextPoints: number }]
    const trainingData: any = {};

    console.log("Processing player history...");

    players.forEach((p: any) => {
        const rawHist = historyMap[p.id];
        if (!rawHist || rawHist.length < 2) return;

        // Filter and Sort correct chronological order (Oldest -> Newest)
        const hist = rawHist
            .filter((h: any) => h.minutes <= 120 && h.kickoff_time)
            .sort((a: any, b: any) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

        // Pre-calculate per-match series
        const series: any = {
            xg: hist.map((h: any) => parseFloat(h.expected_goals || h.threat && (parseFloat(h.threat) / 100).toString() || '0')),
            xa: hist.map((h: any) => parseFloat(h.expected_assists || h.creativity && (parseFloat(h.creativity) / 100).toString() || '0')),
            cs: hist.map((h: any) => h.clean_sheets || 0),
            saves: hist.map((h: any) => h.saves || 0),
            xgc: hist.map((h: any) => parseFloat(h.expected_goals_conceded || '0')),
            minutes: hist.map((h: any) => h.minutes || 0)
        };

        // Iterate through history to build training pairs
        for (let i = 0; i < hist.length - 1; i++) {
            const current = hist[i];
            const next = hist[i + 1];

            // Only train on cases where player played NEXT match (to predict performance)
            if (next.minutes === 0) continue;

            // Global Max (Simplified: Fixed logical maxes to speed up. Can refine layer)
            // Or assume max is roughly static.
            const globalMax = { min: 90, xg: 100, xa: 100, cs: 1, saves: 10, xgc: 3 };
            // Better to use cumulative max, but for optimizing correlation, constant scaling doesn't affect 'r'.
            // EXCEPT for 'minutes reliability' which is non-linear (pow).
            // Let's assume Mean Max roughly 90 mins.

            const sliceEnd = i + 1;
            const sliceStart = Math.max(0, sliceEnd - 10); // Lookback window optimization? No, rely on EMA.
            // Actually EMA looks at whole history.

            // For each Lambda, calculate EMA feature vector
            LAMBDAS.forEach(lambda => {
                const sXG = calculateEMA(series.xg.slice(0, sliceEnd), lambda);
                const sXA = calculateEMA(series.xa.slice(0, sliceEnd), lambda);
                const sCS = calculateEMA(series.cs.slice(0, sliceEnd), lambda);
                const sSaves = calculateEMA(series.saves.slice(0, sliceEnd), lambda);
                const sXGC = calculateEMA(series.xgc.slice(0, sliceEnd), lambda);
                const sMin = calculateEMA(series.minutes.slice(0, sliceEnd), lambda);

                // Features
                const f_xg = sXG; // / globalMax.xg; // constant scaling irrelevant for correlation
                const f_xa = sXA;
                const f_cs = sCS;
                const f_saves = sSaves;
                // Inverse XGC
                const f_xgc_inv = Math.max(0, 3 - sXGC); // Simple inversion

                // Minutes Reliability (Non-linear)
                // Let's optimize the POWER too? Or just include linear minutes as feature?
                // The formula uses reliability multiplier. Logically, we should prioritize regular starters.
                const f_min_rel = Math.pow(Math.min(1, sMin / 90), 0.5); // Fixed power for now

                const vector = [f_xg, f_xa, f_cs, f_saves, f_xgc_inv, f_min_rel];

                if (!trainingData[p.element_type]) trainingData[p.element_type] = {};
                if (!trainingData[p.element_type][lambda]) trainingData[p.element_type][lambda] = [];

                trainingData[p.element_type][lambda].push({
                    features: vector,
                    nextPoints: next.total_points
                });
            });
        }
    });

    // 3. Optimization Loop
    console.log("Searching for optimal weights...");

    const results: any = {};

    for (const posType of [1, 2, 3, 4]) {
        let bestR = -Infinity;
        let bestParams: any = {};

        // For each Lambda
        for (const lambda of LAMBDAS) {
            const data = trainingData[posType]?.[lambda];
            if (!data || data.length < 50) continue;

            const X = data.map((d: any) => d.features);
            const Y = data.map((d: any) => d.nextPoints);

            // Monte Carlo Search for weights
            for (let iter = 0; iter < ITERATIONS; iter++) {
                // Random weights [0, 1]
                const w = FEATURES.map(() => Math.random());

                // Normalize sum to 1? Not strictly needed for correlation, but good for interpretation.
                // Actually smart value formula is weighted sum.

                // Calculate Score Vector
                const scores = X.map((x: number[]) => {
                    return x.reduce((sum, val, idx) => sum + val * w[idx], 0);
                });

                const r = calculateCorrelation(scores, Y);

                if (r > bestR) {
                    bestR = r;
                    bestParams = {
                        lambda,
                        weights: w,
                        features: FEATURES
                    };
                }
            }
        }

        results[posType] = { r: bestR, params: bestParams };
        console.log(`\nPosition ${POS_NAMES[posType]} Best R: ${bestR.toFixed(4)} (Lambda: ${bestParams.lambda})`);
        console.log("Weights:", FEATURES.map((f, i) => `${f}: ${bestParams.weights[i].toFixed(2)}`).join(', '));
    }

    // Save/Print Final Config
    console.log("\n--- OPTIMIZED PARAMETERS JSON ---");
    const jsonOutput: any = {};
    for (const k in results) {
        const p = results[k].params;
        // Map array back to object
        const wObj: any = {};
        p.features.forEach((f: string, i: number) => wObj[f] = p.weights[i]);
        jsonOutput[k] = { lambda: p.lambda, weights: wObj };
    }
    console.log(JSON.stringify(jsonOutput, null, 2));
}

optimize();
