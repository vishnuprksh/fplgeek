import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

async function generatePredictions() {
    console.log("🔮 Generating AI 5-Week Predictions...");

    // 1. Load Data
    const rawPlayers = db.prepare("SELECT id, data FROM players").all().map((r: any) => ({
        id: r.id,
        ...JSON.parse(r.data)
    }));
    const rawHistory = db.prepare("SELECT player_id, data FROM player_history").all().reduce((acc: any, r: any) => {
        if (!acc[r.player_id]) acc[r.player_id] = [];
        acc[r.player_id].push(JSON.parse(r.data));
        return acc;
    }, {});
    const rawFixtures = db.prepare("SELECT data FROM fixtures").all().map((r: any) => JSON.parse(r.data));
    const teamAnalysis = db.prepare("SELECT data FROM team_analysis").all().map((r: any) => JSON.parse(r.data)).reduce((acc: any, t: any) => {
        acc[t.id] = t;
        return acc;
    }, {});
    const eventsData = db.prepare("SELECT data FROM events WHERE id = 'events'").get();
    const currentEvent = JSON.parse(eventsData.data).find((e: any) => e.is_current).id;

    const next5Gws = Array.from({ length: 5 }, (_, i) => currentEvent + 1 + i);
    console.log(`Targeting GW${next5Gws[0]} to GW${next5Gws[4]}...`);

    // 2. Setup Predictions Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS predictions (
            player_id INTEGER PRIMARY KEY,
            data TEXT
        );
    `);

    // 3. Process each player
    const projections: any[] = [];
    rawPlayers.forEach(p => {
        const history = (rawHistory[p.id] || []).sort((a: any, b: any) => b.round - a.round);
        if (history.length === 0) return;

        const latestMatch = history[0];
        const sv = latestMatch.smart_value || 0;
        const normSV = sv / 100;

        const weeklyProjections: any[] = [];
        let totalProjection = 0;

        next5Gws.forEach(gw => {
            const fixture = rawFixtures.find((f: any) => f.event === gw && (f.team_h === p.team || f.team_a === p.team));
            if (!fixture) {
                weeklyProjections.push({ gw, xP: 0, opponent: 'BLANK' });
                return;
            }

            const isHome = fixture.team_h === p.team;
            const oppId = isHome ? fixture.team_a : fixture.team_h;
            const myTeam = teamAnalysis[p.team];
            const oppTeam = teamAnalysis[oppId];

            let fixPot = 0;
            if (p.element_type <= 2) { // GKP/DEF
                const currentGw = currentEvent || 1;
                const risk = isHome ? (myTeam.homeGoalsConceded + oppTeam.awayGoalsScored) : (myTeam.awayGoalsConceded + oppTeam.homeGoalsScored);
                fixPot = Math.max(0, 1 - (risk / 50)); // Normalize: 0 risk = 1.0, 50 goals = 0.0
            } else { // MID/FWD
                const currentGw = currentEvent || 1;
                const potential = isHome ? (myTeam.homeGoalsScored + oppTeam.awayGoalsConceded) : (myTeam.awayGoalsScored + oppTeam.homeGoalsConceded);
                fixPot = Math.min(1, potential / 50); // Normalize: 50 potential = 1.0
            }

            // Apply Optimized Weights (from grid search)
            let wSV = 0.85;
            if (p.element_type === 1) wSV = 0.80; // GKP favors fixtures slightly more

            const wFix = 1 - wSV;
            const score = (wSV * normSV) + (wFix * fixPot);

            // Scalar: A top score of 1.0 (Elite player + Elite fixture) -> ~8-9 pts.
            // A mid score of 0.5 -> ~3-4 pts.
            const xP = Number((score * 7).toFixed(1));
            weeklyProjections.push({
                gw,
                xP,
                opponent: oppTeam?.short_name || 'UNK',
                isHome
            });
            totalProjection += xP;
        });

        projections.push({
            id: p.id,
            name: p.web_name,
            team: teamAnalysis[p.team]?.short_name || 'UNK',
            type: p.element_type,
            projections: weeklyProjections,
            total5Week: Number(totalProjection.toFixed(1))
        });
    });

    // 4. Save to DB
    const insert = db.prepare("INSERT OR REPLACE INTO predictions (player_id, data) VALUES (?, ?)");
    const tx = db.transaction(() => {
        projections.forEach(p => {
            insert.run(p.id, JSON.stringify(p));
        });
    });
    tx();

    console.log(`✅ Success! Generated 5-week projections for ${projections.length} players.`);

    // Sample Output
    const top5 = projections.sort((a, b) => b.total5Week - a.total5Week).slice(0, 5);
    console.log("\n🔝 TOP 5 PROJECTED PLAYERS:");
    top5.forEach(p => console.log(`${p.name} (${p.team}): ${p.total5Week} total pts`));
}

generatePredictions().catch(console.error);
