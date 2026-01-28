
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

// Connect to DB
const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

// Configuration
const POSITIONS = ["", "GKP", "DEF", "MID", "FWD"];

// Helper: Pearson Correlation
function pearsonCorrelation(x: number[], y: number[]) {
    if (x.length < 5) return 0;
    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - meanX;
        const dy = y[i] - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
    }
    return (denX === 0 || denY === 0) ? 0 : num / Math.sqrt(denX * denY);
}

// Helper: Exponential Moving Average
// If we have a series of values, we want the weighted average: sum(val[i] * w[i]) / sum(w[i])
// where w[i] = exp(-lambda * age)
function calculateExponentialAverage(values: number[], lambda: number): number {
    if (values.length === 0) return 0;
    let numerator = 0;
    let denominator = 0;

    // values[0] is most recent? No, usually arrays are chronological. 
    // Let's assume input array is sorted: [oldest, ..., newest]
    // Age of newest is 0. Age of oldest is length-1.

    for (let i = 0; i < values.length; i++) {
        const val = values[i];
        const age = values.length - 1 - i; // 0 for last element
        const weight = Math.exp(-lambda * age);
        numerator += val * weight;
        denominator += weight;
    }
    return denominator === 0 ? 0 : numerator / denominator;
}

async function optimizeSmartValue() {
    console.log("🚀 Starting Smart Value Optimization (Grid Search)");
    console.log("Criteria:");
    console.log("1. Exponential Weighting (Lambda)");
    console.log("2. Games Played Bonus (Tau)");
    console.log("3. Component Weights (Min, PPG, Stat, ICT)\n");

    // 1. Load Data
    const rawPlayers = db.prepare("SELECT data FROM players").all().map((r: any) => {
        const p = JSON.parse(r.data);
        return { id: p.id, element_type: p.element_type, now_cost: p.now_cost };
    });

    // Group history by player
    const historyRows = db.prepare("SELECT player_id, data FROM player_history").all();
    const rawHistory: Record<number, any[]> = {};
    historyRows.forEach((r: any) => {
        if (!rawHistory[r.player_id]) rawHistory[r.player_id] = [];
        rawHistory[r.player_id].push(JSON.parse(r.data));
    });

    // Sort history by round
    Object.keys(rawHistory).forEach(pid => {
        rawHistory[Number(pid)].sort((a, b) => a.round - b.round);
    });

    // 2. Define Grid Search Space
    const LAMBDAS = [0.1, 0.3, 0.5, 1.0]; // Decay factors. 0.1=slow decay, 1.0=fast decay
    const TAUS = [5, 10, 20]; // Games played required to reach ~63% of bonus (1 - e^-N/Tau)
    // Weights: We simplify to granular steps to avoid millions of combos
    // wMin, wPPG, wStat, wICT. Sum = 1.
    // We will generate weight combinations dynamically
    const WEIGHT_COMBOS: number[][] = [];
    for (let w1 = 1; w1 <= 6; w1++) {
        for (let w2 = 1; w2 <= 6; w2++) {
            for (let w3 = 1; w3 <= 6; w3++) {
                for (let w4 = 1; w4 <= 6; w4++) {
                    if (w1 + w2 + w3 + w4 === 10) { // Sum to 1.0
                        WEIGHT_COMBOS.push([w1 / 10, w2 / 10, w3 / 10, w4 / 10]);
                    }
                }
            }
        }
    }
    console.log(`Generated ${WEIGHT_COMBOS.length} weight combinations.`);

    // 3. Grid Search per Position
    for (let pos = 1; pos <= 4; pos++) {
        console.log(`\n🔍 Optimizing for ${POSITIONS[pos]}...`);
        const targetPlayers = rawPlayers.filter((p: any) => p.element_type === pos);

        let best = {
            r: -1,
            lambda: 0,
            tau: 0,
            weights: [0, 0, 0, 0]
        };

        // Pre-processing: We need to evaluate MANY combinations.
        // Doing the EMA calculation inside the loop for every combo is slow.
        // However, EMA depends on Lambda.
        // So we loop Loop Lambda -> Precompute EMAs -> Loop Weights/Tau.

        for (const lambda of LAMBDAS) {
            // Build dataset for this lambda
            // Data point: { targetPoints, emas: { min, ppg, stat, ict }, gamesPlayed }
            const dataset: any[] = [];

            for (const p of targetPlayers) {
                const history = rawHistory[p.id];
                if (!history || history.length < 5) continue;

                for (let i = 5; i < history.length - 1; i++) {
                    const match = history[i];
                    const nextMatch = history[i + 1]; // Predict next match

                    // Past matches (inclusive of current)
                    const past = history.slice(0, i + 1);

                    // Extract series
                    const mins = past.map(m => m.minutes);
                    const ppgs = past.map(m => m.total_points); // Actually use Points, then avg them? 
                    // PPG is typically TotalPoints / Games. BUT here we want weighted PPG.
                    // So we average the 'points' stream.

                    // Positional Stat
                    let stats: number[] = [];
                    // GKP: Saves
                    if (pos === 1) stats = past.map(m => m.saves);
                    // DEF: Influence
                    else if (pos === 2) stats = past.map(m => parseFloat(m.influence));
                    // MID: Influence (or Creativity? Script says Influence currently)
                    else if (pos === 3) stats = past.map(m => parseFloat(m.influence));
                    // FWD: Threat
                    else if (pos === 4) stats = past.map(m => parseFloat(m.threat));

                    // Economy (ICT / Price)
                    const icts = past.map(m => {
                        const cost = m.value; // cost is in 0.1m? DB value usually 10x used cost.
                        const ict = parseFloat(m.ict_index);
                        return cost > 0 ? (ict / (cost / 10)) : 0; // Normalize?
                        // Let's just track the raw metric series
                    });

                    // Compute Exponential Averages
                    const eMin = calculateExponentialAverage(mins, lambda);
                    const ePPG = calculateExponentialAverage(ppgs, lambda);
                    const eStat = calculateExponentialAverage(stats, lambda);
                    const eICT = calculateExponentialAverage(icts, lambda);

                    dataset.push({
                        target: nextMatch.total_points,
                        eMin, ePPG, eStat, eICT,
                        games: past.length // or past.filter(played).length
                    });
                }
            }

            // Now iterate Weights and Tau on this dataset
            // Normalize inputs? The current implementation uses Max Factors.
            // We should find maxes in this dataset to normalize.
            let maxMin = 1, maxPPG = 1, maxStat = 1, maxICT = 1;
            dataset.forEach(d => {
                if (d.eMin > maxMin) maxMin = d.eMin;
                if (d.ePPG > maxPPG) maxPPG = d.ePPG;
                if (d.eStat > maxStat) maxStat = d.eStat;
                if (d.eICT > maxICT) maxICT = d.eICT;
            });

            for (const tau of TAUS) {
                for (const weights of WEIGHT_COMBOS) {
                    const [wMin, wPPG, wStat, wICT] = weights;

                    const preds: number[] = [];
                    const actuals: number[] = [];

                    for (const row of dataset) {
                        const normMin = row.eMin / maxMin;
                        const normPPG = row.ePPG / maxPPG;
                        const normStat = row.eStat / maxStat;
                        const normICT = row.eICT / maxICT;

                        let val = (wMin * normMin) + (wPPG * normPPG) + (wStat * normStat) + (wICT * normICT);

                        // Apply Games Played Bonus
                        // f(N) = 1 - e^(-N / Tau)
                        // Or maybe user wants bonus = weight * log(N).
                        // "more games ... more weightage".
                        // Let's use the multiplier approach.
                        const bonus = 1 - Math.exp(-row.games / tau);
                        val *= bonus;

                        preds.push(val);
                        actuals.push(row.target);
                    }

                    const r = pearsonCorrelation(preds, actuals);
                    if (r > best.r) {
                        best = { r, lambda, tau, weights: [wMin, wPPG, wStat, wICT] };
                    }
                }
            }
        }

        console.log(`✅ Best Result for ${POSITIONS[pos]}:`);
        console.log(`   Lambda (Decay): ${best.lambda}`);
        console.log(`   Tau (Games):    ${best.tau}`);
        console.log(`   Weights:        Min=${best.weights[0].toFixed(1)}, PPG=${best.weights[1].toFixed(1)}, Stat=${best.weights[2].toFixed(1)}, ICT=${best.weights[3].toFixed(1)}`);
        console.log(`   Correlation:    ${best.r.toFixed(4)}`);
    }
}

optimizeSmartValue().catch(console.error);
