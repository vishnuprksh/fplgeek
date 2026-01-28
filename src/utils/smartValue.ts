import type { UnifiedPlayer } from '../types/fpl';

// Optimized Parameters from Grid Search
const PARAMS = {
    1: { lambda: 1.0, tau: 20, wMin: 0.3, wPPG: 0.5, wStat: 0.1, wICT: 0.1 }, // GKP
    2: { lambda: 1.0, tau: 10, wMin: 0.6, wPPG: 0.2, wStat: 0.1, wICT: 0.1 }, // DEF
    3: { lambda: 1.0, tau: 10, wMin: 0.2, wPPG: 0.6, wStat: 0.1, wICT: 0.1 }, // MID
    4: { lambda: 1.0, tau: 10, wMin: 0.2, wPPG: 0.6, wStat: 0.1, wICT: 0.1 }, // FWD
};

export interface ComputedStats {
    emaMin: number;
    emaPPG: number;
    emaStat: number; // Saves/Inf/Thr depending on pos
    emaICT: number;
}

// Helper: Calculate Exponential Moving Average
// values: [oldest, ..., newest]
function calculateEMA(values: number[], lambda: number): number {
    if (values.length === 0) return 0;
    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < values.length; i++) {
        const val = values[i];
        const age = values.length - 1 - i; // 0 for most recent
        const weight = Math.exp(-lambda * age);
        numerator += val * weight;
        denominator += weight;
    }
    return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Calculates Smart Value for a list of players.
 * Returns a new array of players with the 'smart_value' field populated.
 */
export function calculateSmartValues(players: UnifiedPlayer[]): UnifiedPlayer[] {
    console.log("🚀 calculateSmartValues called with", players.length, "players");
    // 1. Calculate Raw EMAs for every player
    const playerStats = new Map<number, ComputedStats>();
    const maxStats = {
        min: 1,
        ppg: 1,
        stat: 1,
        ict: 1
    };

    players.forEach(p => {
        if (!p.history || p.history.length === 0) {
            playerStats.set(p.id, { emaMin: 0, emaPPG: 0, emaStat: 0, emaICT: 0 });
            return;
        }

        const type = p.element_type as 1 | 2 | 3 | 4;
        const config = PARAMS[type] || PARAMS[2]; // Default to DEF if unknown

        // Filter valid history (minutes > 0 or decent points? No, take all games played)
        // Sort history by round/kickoff
        const history = [...p.history].sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

        // Extract series
        const mins = history.map(h => h.minutes);
        const ppgs = history.map(h => h.total_points);

        let stats: number[] = [];
        if (type === 1) stats = history.map(h => h.saves);
        else if (type === 2) stats = history.map(h => parseFloat(h.influence));
        else if (type === 3) stats = history.map(h => parseFloat(h.influence));
        else if (type === 4) stats = history.map(h => parseFloat(h.threat));

        const icts = history.map(h => {
            const cost = h.value;
            const ict = parseFloat(h.ict_index);
            // Economy: ICT per Cost. (Cost is in 0.1m, e.g. 50 = 5.0m)
            return cost > 0 ? (ict / (cost / 10)) : 0;
        });

        const emaMin = calculateEMA(mins, config.lambda);
        const emaPPG = calculateEMA(ppgs, config.lambda);
        const emaStat = calculateEMA(stats, config.lambda);
        const emaICT = calculateEMA(icts, config.lambda);

        // Update Maxes (Global or per position? Usually helps to normalize globally for comparison, 
        // but Smart Value is position-relative typically. Let's normalize globally to keep it simple first, 
        // or effectively per-pos since we apply usage weights. Let's track global max to map to 0-1 range cleanly)
        if (emaMin > maxStats.min) maxStats.min = emaMin;
        if (emaPPG > maxStats.ppg) maxStats.ppg = emaPPG;
        if (emaStat > maxStats.stat) maxStats.stat = emaStat;
        if (emaICT > maxStats.ict) maxStats.ict = emaICT;

        playerStats.set(p.id, { emaMin, emaPPG, emaStat, emaICT });
    });

    // 2. Compute Final Score
    return players.map(p => {
        const stats = playerStats.get(p.id);
        if (!stats) return { ...p, smart_value: 0 };

        const type = p.element_type as 1 | 2 | 3 | 4;
        const config = PARAMS[type] || PARAMS[2];

        const normMin = stats.emaMin / maxStats.min;
        const normPPG = stats.emaPPG / maxStats.ppg;
        const normStat = stats.emaStat / maxStats.stat;
        const normICT = stats.emaICT / maxStats.ict;

        let score = (config.wMin * normMin) +
            (config.wPPG * normPPG) +
            (config.wStat * normStat) +
            (config.wICT * normICT);

        // Games Played Bonus
        // Bonus Factor = 1 - e^(-N / Tau)
        const gamesPlayed = p.history ? p.history.length : 0;
        const bonus = 1 - Math.exp(-gamesPlayed / config.tau);

        score *= bonus;

        // Scale to 0-100 for display
        // Since score is roughly 0-1 (if maxes are hit), multiply by 100.
        // However, since we multiply by bonus (0-1), it naturally scales down.
        // We might want to normalize the final scores against the BEST player to fill the 0-100 gauge.

        return {
            ...p,
            smart_value_raw: score // Store raw for normalization step if needed later?
        };
    }).map((p) => {
        // Optional: Normalize final scores so top player is 100?
        // Or just return raw * 100. Let's do raw * 100 but maybe boost a bit if they are low.
        // If the best player has score 0.6, they should be 100.
        // Let's find max raw score.
        // Actually, let's just do * 100 first.
        // But finding max score in the array is safer.
        return p;
    }).map((p, _, arr) => {
        // Normalize to 0-100 based on Max Score in the dataset
        // This ensures the best player is 100 (or close to it).
        const maxScore = arr.reduce((max, curr) => Math.max(max, (curr as any).smart_value_raw || 0), 0.1);
        const raw = (p as any).smart_value_raw || 0;
        const final = (raw / maxScore) * 100;

        return { ...p, smart_value: final };
    });
}

