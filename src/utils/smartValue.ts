import type { UnifiedPlayer } from '../types/fpl';

// Optimized Parameters from Grid Search
const PARAMS: { [key: number]: any } = {
    1: { lambda: 0.3, weights: { xg: 0.02, xa: 0.61, cs: 0.17, saves: 0.00, xgc_inv: 0.29, minutes_rel: 0.76 } },
    2: { lambda: 0.5, weights: { xg: 0.26, xa: 0.13, cs: 0.06, saves: 0.82, xgc_inv: 0.12, minutes_rel: 0.80 } },
    3: { lambda: 0.1, weights: { xg: 0.99, xa: 0.95, cs: 0.09, saves: 0.46, xgc_inv: 0.05, minutes_rel: 0.45 } },
    4: { lambda: 0.3, weights: { xg: 0.21, xa: 0.99, cs: 0.34, saves: 0.82, xgc_inv: 0.00, minutes_rel: 0.36 } },
};

export interface ComputedStats {
    rawScore: number;
    finalValue: number;
}

// Helper: Calculate Exponential Moving Average
// Helper: Calculate Exponential Moving Average
function calculateEMA(values: number[], lambda: number): number {
    if (values.length === 0) return 0;
    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < values.length; i++) {
        const val = values[i];
        const age = values.length - 1 - i;
        const weight = Math.exp(-lambda * age);
        numerator += val * weight;
        denominator += weight;
    }
    return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Calculates Smart Value for a list of players.
 */
export function calculateSmartValues(players: UnifiedPlayer[]): UnifiedPlayer[] {
    console.log("🚀 calculateSmartValues (v3 Normalized) called with", players.length, "players");

    const scores = players.map(p => {
        if (!p.history || p.history.length === 0) return { p, raw: 0 };

        const type = p.element_type as 1 | 2 | 3 | 4;
        const config = PARAMS[type] || PARAMS[2];

        // 1. Filter out Summary Rows and Bad Data
        const cleanHistory = p.history.filter(h => {
            // Exclude rows with unrealistic minutes (>120 implies summary row)
            if (h.minutes > 120) return false;
            // Exclude rows with missing gameweek info unless clearly current
            // For safety in live calc, let's just use raw entries but capped minutes
            return true;
        });

        // 2. Sort Logic: Try to use kickoff_time, fallback to ID or round
        const history = [...cleanHistory].sort((a, b) => {
            const timeA = new Date(a.kickoff_time).getTime();
            const timeB = new Date(b.kickoff_time).getTime();
            if (!isNaN(timeA) && !isNaN(timeB)) return timeA - timeB;
            return (a.round || 0) - (b.round || 0);
        });

        // Extract Series with Normalization (Live Safety)
        const extractStat = (h: any, key: string, fallback: string | number = 0) => {
            let val = parseFloat(h[key] || (h.threat && key === 'expected_goals' ? (parseFloat(h.threat) / 100).toString() : '0') || fallback.toString());

            // Safety: If somehow a summary row slipped through (minutes > 120), normalize it
            if (h.minutes > 120) {
                const matches = Math.max(1, h.minutes / 90);
                val = val / matches;
            }
            return val;
        };

        const xg = history.map((h: any) => extractStat(h, 'expected_goals'));
        const xa = history.map((h: any) => extractStat(h, 'expected_assists'));
        const cs = history.map((h: any) => extractStat(h, 'clean_sheets'));
        const saves = history.map((h: any) => extractStat(h, 'saves'));
        const xgc = history.map((h: any) => extractStat(h, 'expected_goals_conceded'));
        const mins = history.map((h: any) => h.minutes > 120 ? 90 : h.minutes);

        // Calculate EMAs
        const sXG = calculateEMA(xg, config.lambda);
        const sXA = calculateEMA(xa, config.lambda);
        const sCS = calculateEMA(cs, config.lambda);
        const sSaves = calculateEMA(saves, config.lambda);
        const sXGC = calculateEMA(xgc, config.lambda);
        const sMin = calculateEMA(mins, config.lambda);

        // Transform Features
        const f_xg = sXG;
        const f_xa = sXA;
        const f_cs = sCS;
        const f_saves = sSaves;
        const f_xgc_inv = Math.max(0, 3 - sXGC);
        const f_min_rel = Math.pow(Math.min(1, sMin / 90), 0.5);

        // Weighted Sum
        const w = config.weights;
        let rawScore = (w.xg * f_xg) +
            (w.xa * f_xa) +
            (w.cs * f_cs) +
            (w.saves * f_saves) +
            (w.xgc_inv * f_xgc_inv) +
            (w.minutes_rel * f_min_rel);

        // Apply Multiplicative Reliability Factor
        const reliability = Math.min(1, sMin / 60);
        rawScore *= reliability;

        return { p, raw: rawScore };
    });

    // Use fixed constant for normalization to preserve absolute variance
    const FIXED_MAX = 4.0;

    return scores.map(({ p, raw }) => ({
        ...p,
        smart_value: Number(((raw / FIXED_MAX) * 100).toFixed(1)), // 0-100, 1 decimal
        smart_value_raw: raw
    }));
}
