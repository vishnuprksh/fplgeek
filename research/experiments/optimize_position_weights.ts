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

async function optimizeByPosition() {
    console.log("⚙️  Running Positional Weight Optimization (Grid Search)...");
    console.log("Constraint: Min weight = 0.1\n");

    const rawPlayers = db.prepare("SELECT data FROM players").all().map((r: any) => {
        const p = JSON.parse(r.data);
        return {
            id: p.id,
            element_type: p.element_type,
            team: p.team,
            ...p
        };
    });
    const rawHistory = db.prepare("SELECT player_id, data FROM player_history").all().reduce((acc: any, r: any) => {
        if (!acc[r.player_id]) acc[r.player_id] = [];
        acc[r.player_id].push(JSON.parse(r.data));
        return acc;
    }, {});
    const rawFixtures = db.prepare("SELECT data FROM fixtures").all().map((r: any) => JSON.parse(r.data));
    const rawTeams = JSON.parse(db.prepare("SELECT data FROM teams WHERE id = 'teams'").get().data);

    const posNames = ["", "GKP", "DEF", "MID", "FWD"];

    for (let type = 1; type <= 4; type++) {
        let best = { r: -1, wSV: 0, wFix: 0 };
        const players = rawPlayers.filter(p => p.element_type === type);

        // Grid Search: 0.1 to 0.9 (since other must be >= 0.1)
        for (let wSV = 0.1; wSV <= 0.9; wSV += 0.05) {
            const wFix = 1 - wSV;
            const ds: { x: number[], y: number[] } = { x: [], y: [] };

            for (let week = 5; week <= 22; week++) {
                const nextWeek = week + 1;

                // Team Stats for this week
                const teamStats: any = {};
                rawTeams.forEach((t: any) => teamStats[t.id] = { hs: 0, hc: 0, as: 0, ac: 0 });
                rawFixtures.filter((f: any) => f.finished && f.event <= week).forEach((f: any) => {
                    teamStats[f.team_h].hs += f.team_h_score;
                    teamStats[f.team_h].hc += f.team_a_score;
                    teamStats[f.team_a].as += f.team_a_score;
                    teamStats[f.team_a].ac += f.team_h_score;
                });

                players.forEach(p => {
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
                    if (type <= 2) { // GKP/DEF
                        const risk = isHome ? (myTeam.hc + oppTeam.as) : (myTeam.ac + oppTeam.hs);
                        fixPot = Math.max(0, 1 - (risk / 50));
                    } else { // MID/FWD
                        const pot = isHome ? (myTeam.hs + oppTeam.ac) : (myTeam.as + oppTeam.hc);
                        fixPot = Math.min(1, pot / 50);
                    }

                    const normSV = history[0].smart_value / 100;
                    const score = (wSV * normSV) + (wFix * fixPot);

                    ds.x.push(score);
                    ds.y.push(nMatch.total_points);
                });
            }

            const r = pearsonCorrelation(ds.x, ds.y);
            if (r > best.r) best = { r, wSV, wFix };
        }

        console.log(`🏆 BEST FOR ${posNames[type]}:`);
        console.log(`   SV Weight:   ${best.wSV.toFixed(2)}`);
        console.log(`   Fix Weight:  ${best.wFix.toFixed(2)}`);
        console.log(`   Correlation: ${best.r.toFixed(4)}`);
        console.log(`   Samples:     ${best.r > 0 ? 'Verified' : 'Low Data'}\n`);
    }
}

optimizeByPosition().catch(console.error);
