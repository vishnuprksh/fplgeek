import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

function pearsonCorrelation(x: number[], y: number[]) {
    if (x.length < 5) return 0;
    const n = x.length, meanX = x.reduce((a, b) => a + b) / n, meanY = y.reduce((a, b) => a + b) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - meanX, dy = y[i] - meanY;
        num += dx * dy; denX += dx * dx; denY += dy * dy;
    }
    return (denX === 0 || denY === 0) ? 0 : num / Math.sqrt(denX * denY);
}

async function runDetailedCorrelation() {
    console.log("🔍 Running Position-Specific Prediction Analysis...");

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
    const rawTeams = JSON.parse(db.prepare("SELECT data FROM teams WHERE id = 'teams'").get().data);

    const posStats: Record<number, { x: number[], y: number[] }> = { 1: { x: [], y: [] }, 2: { x: [], y: [] }, 3: { x: [], y: [] }, 4: { x: [], y: [] } };

    // Use specific weights found in previous grid search or common sense
    // Attackers: 100% SV, Defenders: 70% SV / 30% Fixture
    const WEIGHTS: Record<number, { wSV: number, wFix: number }> = {
        1: { wSV: 0.7, wFix: 0.3 },
        2: { wSV: 0.7, wFix: 0.3 },
        3: { wSV: 1.0, wFix: 0.0 },
        4: { wSV: 1.0, wFix: 0.0 }
    };

    for (let week = 5; week <= 22; week++) {
        const nextWeek = week + 1;

        // Calculate team defensive/attack metrics for this week
        const teamStats: any = {};
        rawTeams.forEach((t: any) => teamStats[t.id] = { hs: 0, hc: 0, as: 0, ac: 0 });
        rawFixtures.filter((f: any) => f.finished && f.event <= week).forEach((f: any) => {
            teamStats[f.team_h].hs += f.team_h_score;
            teamStats[f.team_h].hc += f.team_a_score;
            teamStats[f.team_a].as += f.team_a_score;
            teamStats[f.team_a].ac += f.team_h_score;
        });

        rawPlayers.forEach(p => {
            const history = (rawHistory[p.id] || []).filter((h: any) => h.round <= week).sort((a: any, b: any) => b.round - a.round);
            if (history.length === 0 || !history[0].smart_value) return;

            const nMatch = (rawHistory[p.id] || []).find((h: any) => h.round === nextWeek);
            if (!nMatch) return;

            const fixture = rawFixtures.find((f: any) => f.event === nextWeek && (f.team_h === p.team || f.team_a === p.team));
            if (!fixture) return;

            const isHome = fixture.team_h === p.team;
            const myTeam = teamStats[p.team];
            const oppTeam = teamStats[isHome ? fixture.team_a : fixture.team_h];

            let fixPot = 0;
            if (p.element_type <= 2) {
                const risk = isHome ? (myTeam.hc + oppTeam.as) : (myTeam.ac + oppTeam.hs);
                fixPot = Math.max(0, 1 - (risk / 50));
            } else {
                const pot = isHome ? (myTeam.hs + oppTeam.ac) : (myTeam.as + oppTeam.hc);
                fixPot = Math.min(1, pot / 50);
            }

            const w = WEIGHTS[p.element_type];
            const score = (w.wSV * (history[0].smart_value / 100)) + (w.wFix * fixPot);

            posStats[p.element_type].x.push(score);
            posStats[p.element_type].y.push(nMatch.total_points);
        });
    }

    console.log("\n📊 Detailed Correlation (N -> N+1 Points):");
    const posNames = ["", "GKP", "DEF", "MID", "FWD"];
    let totalX: number[] = [], totalY: number[] = [];

    for (let i = 1; i <= 4; i++) {
        const r = pearsonCorrelation(posStats[i].x, posStats[i].y);
        console.log(`${posNames[i]}: ${r.toFixed(4)}  (${posStats[i].x.length} samples)`);
        totalX.push(...posStats[i].x);
        totalY.push(...posStats[i].y);
    }
    console.log(`\nOverall: ${pearsonCorrelation(totalX, totalY).toFixed(4)}`);
}

runDetailedCorrelation().catch(console.error);
