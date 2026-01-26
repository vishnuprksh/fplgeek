
import * as logger from "firebase-functions/logger";
import { db } from "./init";

// Define locally to avoid relative import issues in Cloud Functions
interface PlayerHistory {
    element: number;
    fixture: number;
    opponent_team: number;
    total_points: number;
    was_home: boolean;
    kickoff_time: string;
    team_h_score: number;
    team_a_score: number;
    round: number;
    minutes: number;
    goals_scored: number;
    assists: number;
    clean_sheets: number;
    goals_conceded: number;
    own_goals: number;
    penalties_saved: number;
    penalties_missed: number;
    yellow_cards: number;
    red_cards: number;
    saves: number;
    bonus: number;
    bps: number;
    influence: string;
    creativity: string;
    threat: string;
    ict_index: string;
    value: number;
    transfers_balance: number;
    selected: number;
    transfers_in: number;
    transfers_out: number;
    expected_goals_conceded?: string;
    season?: string;
}

interface UnifiedPlayer {
    id: number;
    history: PlayerHistory[];
    element_type: number;
    now_cost: number;
    web_name: string;
    // Add other fields if needed, but these are sufficient for smart value
}


export async function calculateSmartValues() {
    logger.info("Starting Smart Value V2 Calculation (Unified)...");

    // 1. Fetch Unified Players
    const playersSnap = await db.collection('master_players').get();
    // usage: Map<docId, player> or array of wrappers
    const players: { docId: string; data: UnifiedPlayer }[] = [];
    playersSnap.docs.forEach(doc => {
        players.push({ docId: doc.id, data: doc.data() as UnifiedPlayer });
    });

    logger.info(`Fetched ${players.length} unified players.`);

    const TARGET_SEASON = '2425';
    const ALPHA = 0.5; // Optimized from 0.7 to 0.5 for better correlation.

    // Track Global Maximas
    let globalMax = { min: 1, xg: 1, xa: 1, cs: 1, gp: 1, saves: 1, xgc: 1 };

    // Intermediate storage: Key is DOC ID (string)
    const calculatedData = new Map<string, { blended: any, type: number, cost: number }>();

    // 2. Calculate Stats & Global Maximas
    players.forEach(wrapper => {
        const p = wrapper.data;
        const docId = wrapper.docId;

        // Safe check for history
        if (!p.history || !Array.isArray(p.history)) return;

        const history2425 = p.history.filter((h: any) => h.season === TARGET_SEASON);
        if (history2425.length === 0) return;

        // Sort by round descending
        history2425.sort((a, b) => b.round - a.round);

        // Helper to calculate mean
        const calcMean = (stats: any[]) => {
            let sumMin = 0, sumXG = 0, sumXA = 0, sumCS = 0, sumGP = 0, sumSaves = 0, sumXGC = 0;
            const count = stats.length;
            if (count === 0) return { minutes: 0, xg: 0, xa: 0, clean_sheets: 0, goals_prevented: 0, saves: 0, xgc: 0 };

            stats.forEach(m => {
                sumMin += m.minutes || 0;
                sumXG += parseFloat(m.threat || '0');      // Proxy: Threat
                sumXA += parseFloat(m.creativity || '0');  // Proxy: Creativity
                sumCS += m.clean_sheets || 0;
                sumSaves += m.saves || 0;
                sumXGC += parseFloat(m.expected_goals_conceded || '0');
                sumGP += 0; // xGC not available yet
            });

            return {
                minutes: sumMin / count,
                xg: sumXG / count,
                xa: sumXA / count,
                clean_sheets: sumCS / count,
                goals_prevented: sumGP / count,
                saves: sumSaves / count,
                xgc: sumXGC / count
            };
        };

        const season = calcMean(history2425);
        const formMatches = history2425.slice(0, 5);
        const form = calcMean(formMatches);

        const blended = {
            minutes: (1 - ALPHA) * season.minutes + ALPHA * form.minutes,
            xg: (1 - ALPHA) * season.xg + ALPHA * form.xg,
            xa: (1 - ALPHA) * season.xa + ALPHA * form.xa,
            clean_sheets: (1 - ALPHA) * season.clean_sheets + ALPHA * form.clean_sheets,
            goals_prevented: (1 - ALPHA) * season.goals_prevented + ALPHA * form.goals_prevented,
            saves: (1 - ALPHA) * season.saves + ALPHA * form.saves,
            xgc: (1 - ALPHA) * season.xgc + ALPHA * form.xgc
        };

        if (blended.minutes > globalMax.min) globalMax.min = blended.minutes;
        if (blended.xg > globalMax.xg) globalMax.xg = blended.xg;
        if (blended.xa > globalMax.xa) globalMax.xa = blended.xa;
        if (blended.clean_sheets > globalMax.cs) globalMax.cs = blended.clean_sheets;
        if (blended.goals_prevented > globalMax.gp) globalMax.gp = blended.goals_prevented;
        if (blended.saves > globalMax.saves) globalMax.saves = blended.saves;
        if (blended.xgc > globalMax.xgc) globalMax.xgc = blended.xgc;

        calculatedData.set(docId, { blended, type: p.element_type, cost: p.now_cost });
    });

    logger.info("Global Maximas:", globalMax);

    // 3. Normalize and Update
    let batch = db.batch();
    let count = 0;
    let totalUpdated = 0;

    for (const [docId, data] of calculatedData.entries()) {
        const b = data.blended;

        // Normalized Stats
        const nXG = globalMax.xg ? b.xg / globalMax.xg : 0;
        const nXA = globalMax.xa ? b.xa / globalMax.xa : 0;
        const nCS = globalMax.cs ? b.clean_sheets / globalMax.cs : 0;
        const nSaves = globalMax.saves ? b.saves / globalMax.saves : 0;
        // Inverted xGC (lower goals conceded is better). Cap at 3.0 typical max.
        const nInvXGC = Math.max(0, 1 - (b.xgc / 3.0));

        // Optimized Power: 0.3 for overall best correlation.
        // But we use position specific adjustments found in Grid Search.
        let power = 0.3;
        if (data.type === 1 || data.type === 2) power = 0.7; // GKP/DEF favor stability

        const reliability = globalMax.min ? Math.pow(b.minutes / globalMax.min, power) : 0;

        // Position Specific Scoring
        let rawScore = 0;
        switch (data.type) {
            case 1: // GKP: cs + saves
                rawScore = (0.35 * nCS) + (0.35 * nSaves); // Simplified (no GP)
                break;
            case 2: // DEF: Optimized (xGC + xG + xA)
                // Weights found in grid search: xGC(0.30), xG(0.50), xA(0.20)
                rawScore = (0.30 * nInvXGC) + (0.50 * nXG) + (0.20 * nXA);
                break;
            case 3: // MID: goals + assists
                rawScore = (0.50 * nXG) + (0.40 * nXA) + (0.10 * nCS);
                break;
            case 4: // FWD: goals + assists
                rawScore = (0.60 * nXG) + (0.40 * nXA);
                break;
        }

        const weightedScore = rawScore * reliability;
        const price = data.cost > 0 ? (data.cost / 10) : 4.0;
        const smartValue = (weightedScore * 1000) / price;

        const ref = db.collection('master_players').doc(docId);
        batch.update(ref, {
            smart_value: Number(smartValue.toFixed(2)),
            smart_score: Number(weightedScore.toFixed(4)),
            updated_at: new Date().toISOString()
        });

        count++;
        if (count >= 400) {
            await batch.commit();
            totalUpdated += count;
            batch = db.batch();
            count = 0;
        }
    }

    if (count > 0) {
        await batch.commit();
        totalUpdated += count;
    }

    logger.info(`Updated Smart Values (V2) for ${totalUpdated} players.`);
}
