
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

// Optimized Parameters
const PARAMS: { [key: number]: any } = {
    1: { lambda: 0.3, weights: { xg: 0.02, xa: 0.61, cs: 0.17, saves: 0.00, xgc_inv: 0.29, minutes_rel: 0.76 } },
    2: { lambda: 0.5, weights: { xg: 0.26, xa: 0.13, cs: 0.06, saves: 0.82, xgc_inv: 0.12, minutes_rel: 0.80 } },
    3: { lambda: 0.1, weights: { xg: 0.99, xa: 0.95, cs: 0.09, saves: 0.46, xgc_inv: 0.05, minutes_rel: 0.45 } },
    4: { lambda: 0.3, weights: { xg: 0.21, xa: 0.99, cs: 0.34, saves: 0.82, xgc_inv: 0.00, minutes_rel: 0.36 } },
};

// Fix Absolute Round Logic: Summaries (Past) < Current Matches
function getAbsoluteRound(h: any): number {
    const isCurrent = !h.season_name || h.season_name === '2024/25' || h.season === '2024/25';
    if (isCurrent) {
        const r = h.round || 999;
        // Current season matches should be AFTER past summary.
        // Map to 100+ to leave space for past seasons.
        return 100 + r;
    }
    // Past seasons (Summary rows) -> 0
    return 0;
}

function calcEMA(values: number[], lambda: number): number {
    if (values.length === 0) return 0;
    let num = 0, den = 0;
    for (let i = 0; i < values.length; i++) {
        const val = values[i];
        const age = values.length - 1 - i;
        const weight = Math.exp(-lambda * age);
        num += val * weight;
        den += weight;
    }
    return den === 0 ? 0 : num / den;
}

async function runEnrichment() {
    console.log("🛠️ Starting Historical Smart Value Enrichment (Optimized v3 - Fix High SV)...");

    const rawPlayers = db.prepare("SELECT data FROM players").all().map((r: any) => JSON.parse(r.data));
    const rawHistory = db.prepare("SELECT player_id, fixture_id, data FROM player_history").all().reduce((acc: any, r: any) => {
        if (!acc[r.player_id]) acc[r.player_id] = [];
        const h = JSON.parse(r.data);
        h._fid = r.fixture_id;
        h._absRound = getAbsoluteRound(h);
        acc[r.player_id].push(h);
        return acc;
    }, {});

    const players = rawPlayers.map((p: any) => ({
        ...p,
        history: rawHistory[p.id] || []
    }));

    const maxAbsRound = Math.max(...players.flatMap((p: any) => p.history.map((h: any) => h._absRound)), 1);
    console.log(`Max Round: ${maxAbsRound}`);

    for (let week = 0; week <= maxAbsRound; week++) {
        const playersAtWeek: any[] = [];
        let maxRawScore = 0.001;

        // Calculate Scores for all players at this week
        players.forEach((p: any) => {
            const hUpToNow = p.history
                .filter((h: any) => h._absRound <= week && h.minutes !== undefined)
                .sort((a: any, b: any) => {
                    const tA = a.kickoff_time ? new Date(a.kickoff_time).getTime() : 0;
                    const tB = b.kickoff_time ? new Date(b.kickoff_time).getTime() : 0;
                    // summary rows (0) < past matches < current matches
                    if (tA !== tB) return tA - tB;
                    return a._absRound - b._absRound;
                });

            if (hUpToNow.length === 0) return;

            const type = p.element_type as 1 | 2 | 3 | 4;
            const config = PARAMS[type] || PARAMS[2];

            // Extract Series with Normalization for Summaries
            const extractStat = (h: any, key: string, fallback: string | number = 0) => {
                let val = parseFloat(h[key] || (h.threat && key === 'expected_goals' ? (parseFloat(h.threat) / 100).toString() : '0') || fallback.toString());

                // If this is a summary row (minutes > 120), normalize to per-90
                if (h.minutes > 120) {
                    const matches = Math.max(1, h.minutes / 90);
                    val = val / matches;
                }
                return val;
            };

            const xg = hUpToNow.map((h: any) => extractStat(h, 'expected_goals'));
            const xa = hUpToNow.map((h: any) => extractStat(h, 'expected_assists'));
            const cs = hUpToNow.map((h: any) => extractStat(h, 'clean_sheets'));
            const saves = hUpToNow.map((h: any) => extractStat(h, 'saves'));
            const xgc = hUpToNow.map((h: any) => extractStat(h, 'expected_goals_conceded'));

            // Minutes: If summary, cap at 90 for the EMA input
            const mins = hUpToNow.map((h: any) => h.minutes > 120 ? 90 : h.minutes);

            // EMA
            const sXG = calcEMA(xg, config.lambda);
            const sXA = calcEMA(xa, config.lambda);
            const sCS = calcEMA(cs, config.lambda);
            const sSaves = calcEMA(saves, config.lambda);
            const sXGC = calcEMA(xgc, config.lambda);
            const sMin = calcEMA(mins, config.lambda);

            // Features
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

            // Reliability Dampener
            const reliability = Math.min(1, sMin / 60);
            rawScore *= reliability;

            if (rawScore > maxRawScore) maxRawScore = rawScore;

            // Find ALL matches for this week (handling duplicates/summaries)
            const weekMatches = p.history.filter((h: any) => h._absRound === week);
            playersAtWeek.push({ p, rawScore, weekMatches });
        });

        // Assign Normalized Scores
        const FIXED_MAX = 4.0;

        playersAtWeek.forEach(({ p, rawScore, weekMatches }) => {
            if (!weekMatches || weekMatches.length === 0) return;
            const sv = (rawScore / FIXED_MAX) * 100;

            // Update ALL matching rows
            weekMatches.forEach((m: any) => {
                m.smart_value = Number(sv.toFixed(2));
                m.smart_score = rawScore;
            });
        });

        if (week % 50 === 0) console.log(`Processed Week ${week}`);
    }

    // Batch Update
    console.log("💾 Writing updates...");
    const updateHistory = db.prepare("UPDATE player_history SET data = ? WHERE player_id = ? AND fixture_id = ?");
    const updatePlayer = db.prepare("UPDATE players SET data = ? WHERE id = ?");

    const transaction = db.transaction((allPlayers: any[]) => {
        let count = 0;
        for (const p of allPlayers) {
            let latestSV = 0;
            let latestRound = -1;
            for (const h of p.history) {
                const fid = h._fid;
                delete h._fid;
                delete h._absRound;
                updateHistory.run(JSON.stringify(h), p.id, fid);
                count++;

                // Update Logic: Use normal rounds for Current Season Only?
                // Or use absolute round? 
                // The issue: "Summary Row" (Round 999) was getting picked up because 999 > 23.
                // But in 'getAbsoluteRound', we mapped Summary to 0.
                // However, h.round is still 999 in the data object.
                // We should EXPLICITLY ignore rows with undefined round or round > 38 for 'latestSV' logic.

                if (h.round && h.round <= 38 && h.smart_value !== undefined && h.season_name !== '2024/25') {
                    // Wait, season_name != 24/25 was excluding current matches? NO.
                    // The old logic was: `&& h.season_name !== '2024/25'`?
                    // Previous logic: `if (h.round > latestRound && h.smart_value !== undefined && h.season_name !== '2024/25')`
                    // Why exlude 24/25? 
                    // This was likely a bug in the old script? 
                    // Actually, ingested data for 24/25 usually has NO season_name (undefined).
                    // While 23/24 has '2023/24'.
                    // So `!== '2024/25'` was effectively a no-op if undefined? 

                    // Correct Logic:
                    // Only update player.smart_value from VALID MATCH ROUNDS (1-38).
                    // Not summary rows (999).
                    if (h.round > latestRound) {
                        latestRound = h.round;
                        latestSV = h.smart_value;
                    }
                }
            }
            const pData = JSON.parse(db.prepare("SELECT data FROM players WHERE id = ?").get(p.id).data);
            pData.smart_value = latestSV; // Store as 0-100 range for consistency
            updatePlayer.run(JSON.stringify(pData), p.id);
        }
        return count;
    });

    const c = transaction(players);
    console.log(`Updated ${c} records.`);
}

runEnrichment().catch(console.error);
