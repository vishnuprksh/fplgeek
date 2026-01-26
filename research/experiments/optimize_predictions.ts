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

async function runOptimization() {
    console.log("🚀 Starting Prediction Optimizer (Grid Search)...");

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
    const rawTeams = JSON.parse(db.prepare("SELECT data FROM teams WHERE id = 'teams'").get().data);

    // 2. Prep Weight Combinations
    let best = { r: -1, wSV: 0, wFix: 0 };

    // Search for Weights
    for (let wSV = 0; wSV <= 1.0; wSV += 0.05) {
        const wFix = 1 - wSV;
        const dataset: { x: number[], y: number[] } = { x: [], y: [] };

        for (let week = 5; week <= 21; week++) {
            const nextWeek = week + 1;

            // A. Calculate Team Stats UP TO Week N
            const teamStats: any = {};
            rawTeams.forEach((t: any) => {
                teamStats[t.id] = { id: t.id, hs: 0, hc: 0, as: 0, ac: 0 };
            });
            rawFixtures.filter((f: any) => f.finished && f.event <= week).forEach((f: any) => {
                teamStats[f.team_h].hs += f.team_h_score;
                teamStats[f.team_h].hc += f.team_a_score;
                teamStats[f.team_a].as += f.team_a_score;
                teamStats[f.team_a].ac += f.team_h_score;
            });

            // B. Score Players for Week N+1
            rawPlayers.forEach(p => {
                const history = (rawHistory[p.id] || []).filter((h: any) => h.round <= week).sort((a: any, b: any) => b.round - a.round);
                if (history.length === 0) return;

                const latestMatch = history[0];
                if (!latestMatch.smart_value) return;

                const nMatch = (rawHistory[p.id] || []).find((h: any) => h.round === nextWeek);
                if (!nMatch) return;

                // Find Fixture Potential for GW N+1
                const fixture = rawFixtures.find((f: any) => f.event === nextWeek && (f.team_h === p.team || f.team_a === p.team));
                if (!fixture) return;

                const isHome = fixture.team_h === p.team;
                const myStats = teamStats[p.team];
                const oppStats = teamStats[isHome ? fixture.team_a : fixture.team_h];

                let fixPot = 0;
                if (p.element_type === 1 || p.element_type === 2) {
                    const risk = isHome ? (myStats.hc + oppStats.as) : (myStats.ac + oppStats.hs);
                    fixPot = Math.max(0, 10 - (risk / (week / 2 || 1)));
                } else {
                    fixPot = isHome ? (myStats.hs + oppStats.ac) : (myStats.as + oppStats.hc);
                    fixPot = fixPot / (week / 2 || 1);
                }

                const normSV = latestMatch.smart_value / 100; // Normalize 0-100 to 0-1
                const score = (wSV * normSV) + (wFix * fixPot);

                if (wSV === 0.5 && dataset.x.length < 5) {
                    console.log(`Sample: ${p.web_name} SV=${latestMatch.smart_value} FixPot=${fixPot.toFixed(2)} -> Score=${score.toFixed(2)} Pts=${nMatch.total_points}`);
                }

                dataset.x.push(score);
                dataset.y.push(nMatch.total_points);
            });
        }

        const r = pearsonCorrelation(dataset.x, dataset.y);
        if (wSV === 0) console.log(`Debug: Dataset size = ${dataset.x.length} samples.`);
        if (r > best.r) best = { r, wSV, wFix };
    }

    if (best.r === 0) {
        console.log("⚠️ No correlation found! This usually means the dataset was empty or mismatched.");
        const samplePlayer = rawPlayers[0];
        const sampleHist = rawHistory[samplePlayer.id] || [];
        console.log(`Sample Player: ${samplePlayer.web_name}, History matches: ${sampleHist.length}`);
        if (sampleHist.length > 0) {
            console.log(`Sample History Row:`, JSON.stringify(sampleHist[0]).substring(0, 100));
        }
    }

    console.log(`\n🏆 BEST PREDICTION CONFIGURATION (OVERALL):`);
    console.log(`- Smart Value Weight: ${best.wSV.toFixed(2)}`);
    console.log(`- Fixture Weight:     ${best.wFix.toFixed(2)}`);
    console.log(`- Max Correlation r:  ${best.r.toFixed(4)}`);

    // Helper to find best for subset
    const findBestForType = (typeFilter: number[]) => {
        let b = { r: -1, wSV: 0 };
        for (let wSV = 0; wSV <= 1.0; wSV += 0.1) {
            const wFix = 1 - wSV;
            const ds: { x: number[], y: number[] } = { x: [], y: [] };
            for (let week = 5; week <= 21; week++) {
                const nextWeek = week + 1;
                // Redo teamStats calc just for this check (simplified)
                rawPlayers.filter(p => typeFilter.includes(p.element_type)).forEach(p => {
                    const history = (rawHistory[p.id] || []).filter((h: any) => h.round <= week).sort((a: any, b: any) => b.round - a.round);
                    if (history.length === 0 || !history[0].smart_value) return;
                    const nMatch = (rawHistory[p.id] || []).find((h: any) => h.round === nextWeek);
                    if (!nMatch) return;
                    const normSV = history[0].smart_value / 100;
                    ds.x.push((wSV * normSV) + (wFix * 0.5)); // Placeholder fixpot for speed
                    ds.y.push(nMatch.total_points);
                });
            }
            const r = pearsonCorrelation(ds.x, ds.y);
            if (r > b.r) b = { r, wSV };
        }
        return b;
    };

    console.log(`\n📍 POSITIONAL TRENDS:`);
    console.log(`GKP/DEF: Best SV weight around ${findBestForType([1, 2]).wSV.toFixed(2)}`);
    console.log(`MID/FWD: Best SV weight around ${findBestForType([3, 4]).wSV.toFixed(2)}`);
}

runOptimization().catch(console.error);
