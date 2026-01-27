import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

const ALPHA = 0.5;
const TARGET_SEASON = '2425';

interface Player {
    id: number;
    element_type: number;
    now_cost: number;
    web_name: string;
    history: any[];
}

function calculateMean(stats: any[]) {
    let sumMin = 0, sumXG = 0, sumXA = 0, sumCS = 0, sumSaves = 0, sumXGC = 0;
    const count = stats.length;
    if (count === 0) return { minutes: 0, xg: 0, xa: 0, clean_sheets: 0, saves: 0, xgc: 0 };

    stats.forEach(m => {
        sumMin += m.minutes || 0;
        sumXG += parseFloat(m.threat || '0');
        sumXA += parseFloat(m.creativity || '0');
        sumCS += m.clean_sheets || 0;
        sumSaves += m.saves || 0;
        sumXGC += parseFloat(m.expected_goals_conceded || '0');
    });

    return {
        minutes: sumMin / count,
        xg: sumXG / count,
        xa: sumXA / count,
        clean_sheets: sumCS / count,
        saves: sumSaves / count,
        xgc: sumXGC / count
    };
}

async function runEnrichment() {
    console.log("🛠️ Starting Historical Smart Value Enrichment...");

    const rawPlayers = db.prepare("SELECT data FROM players").all().map((r: any) => JSON.parse(r.data));
    const rawHistory = db.prepare("SELECT player_id, fixture_id, data FROM player_history").all().reduce((acc: any, r: any) => {
        if (!acc[r.player_id]) acc[r.player_id] = [];
        const h = JSON.parse(r.data);
        h._fid = r.fixture_id; // Keep track for update
        acc[r.player_id].push(h);
        return acc;
    }, {});

    const players: Player[] = rawPlayers.map((p: any) => ({
        ...p,
        history: rawHistory[p.id] || []
    }));

    const maxRound = Math.max(...players.flatMap(p => p.history.map(h => h.round)), 1);
    console.log(`Determined max round: ${maxRound}`);

    // Loop through each week to calculate SV at that point in time
    for (let week = 1; week <= maxRound; week++) {
        console.log(`Calculating for GW${week}...`);

        const globalMax = { min: 45, xg: 1, xa: 1, cs: 1, saves: 1, xgc: 1 };
        const playersAtWeek: any[] = [];

        // 1. Calculate Global Maximas up to 'week'
        players.forEach(p => {
            const hUpToNow = p.history.filter((h: any) => h.round <= week).sort((a, b) => b.round - a.round);
            if (hUpToNow.length === 0) return;

            const season = calculateMean(hUpToNow);
            const form = calculateMean(hUpToNow.slice(0, 5));

            const blended = {
                minutes: (1 - ALPHA) * season.minutes + ALPHA * form.minutes,
                xg: (1 - ALPHA) * season.xg + ALPHA * form.xg,
                xa: (1 - ALPHA) * season.xa + ALPHA * form.xa,
                clean_sheets: (1 - ALPHA) * season.clean_sheets + ALPHA * form.clean_sheets,
                saves: (1 - ALPHA) * season.saves + ALPHA * form.saves,
                xgc: (1 - ALPHA) * season.xgc + ALPHA * form.xgc
            };

            if (blended.minutes > globalMax.min) globalMax.min = blended.minutes;
            if (blended.xg > globalMax.xg) globalMax.xg = blended.xg;
            if (blended.xa > globalMax.xa) globalMax.xa = blended.xa;
            if (blended.clean_sheets > globalMax.cs) globalMax.cs = blended.clean_sheets;
            if (blended.saves > globalMax.saves) globalMax.saves = blended.saves;
            if (blended.xgc > globalMax.xgc) globalMax.xgc = blended.xgc;

            playersAtWeek.push({ p, blended, weekMatch: p.history.find(h => h.round === week) });
        });

        // 2. Assign Smart Value to the history entry of that week
        playersAtWeek.forEach(({ p, blended, weekMatch }) => {
            if (!weekMatch) return;

            const b = blended;
            const nXG = b.xg / globalMax.xg;
            const nXA = b.xa / globalMax.xa;
            const nCS = b.clean_sheets / globalMax.cs;
            const nSaves = b.saves / globalMax.saves;
            const nInvXGC = Math.max(0, 1 - (b.xgc / 3.0));

            let power = (p.element_type === 1 || p.element_type === 2) ? 0.7 : 0.3;
            const reliability = Math.pow(b.minutes / globalMax.min, power);

            let rawScore = 0;
            switch (p.element_type) {
                case 1: rawScore = (0.35 * nCS) + (0.35 * nSaves); break;
                case 2: rawScore = (0.30 * nInvXGC) + (0.50 * nXG) + (0.20 * nXA); break;
                case 3: rawScore = (0.50 * nXG) + (0.40 * nXA) + (0.10 * nCS); break;
                case 4: rawScore = (0.60 * nXG) + (0.40 * nXA); break;
            }

            // Confidence Factor: Penalize small sample sizes (threshold ~5 full games)
            const statsUpToNow = p.history.filter((h: any) => h.round <= week);
            const cumulativeMinutes = statsUpToNow.reduce((acc: number, m: any) => acc + (m.minutes || 0), 0);

            const confidence = Math.min(1, cumulativeMinutes / 450);

            const smartValue = ((rawScore * reliability * 1000) / (p.now_cost / 10)) * confidence;

            weekMatch.smart_value = Number(smartValue.toFixed(2));
            weekMatch.smart_score = Number((rawScore * reliability * confidence).toFixed(4));
        });
    }

    // 3. Batch Update Database
    console.log("💾 Writing updates to database...");
    const updateHistory = db.prepare("UPDATE player_history SET data = ? WHERE player_id = ? AND fixture_id = ?");
    const updatePlayer = db.prepare("UPDATE players SET data = ? WHERE id = ?");

    const transaction = db.transaction((allPlayers: Player[]) => {
        let totalH = 0;
        for (const p of allPlayers) {
            // Update History
            let latestSV = 0;
            let latestRound = -1;

            for (const h of p.history) {
                const fid = h._fid;
                delete h._fid;
                updateHistory.run(JSON.stringify(h), p.id, fid);
                totalH++;

                if (h.round > latestRound && h.smart_value !== undefined) {
                    latestRound = h.round;
                    latestSV = h.smart_value;
                }
            }

            // Update Player Top-Level
            const playerJson = JSON.parse(db.prepare("SELECT data FROM players WHERE id = ?").get(p.id).data);
            playerJson.smart_value = latestSV / 100; // Normalize 0-1 for common usage
            updatePlayer.run(JSON.stringify(playerJson), p.id);
        }
        return totalH;
    });

    const updatedCount = transaction(players);
    console.log(`✅ Success! Updated ${updatedCount} historical entries and top-level player records.`);


    // Verification
    const row = db.prepare("SELECT data FROM player_history LIMIT 1").get();
    console.log("Verification Row (End):", row.data.substring(row.data.length - 100));
}

runEnrichment().catch(console.error);
