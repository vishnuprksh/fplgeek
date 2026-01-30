
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

interface TrainingExample {
    smartValue: number;
    fixtureDifficulty: number;
    isHome: number; // 1 for home, 0 for away
    nextPoints: number;
}

function calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 2) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumX2 += x[i] * x[i];
        sumY2 += y[i] * y[i];
    }
    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return den === 0 ? 0 : num / den;
}

async function analyzePrediction() {
    console.log("🔮 Analyzing Feature Importance for Prediction...");

    // 1. Load Players & History
    const players = db.prepare("SELECT data FROM players").all().map((r: any) => JSON.parse(r.data));
    const historyRows = db.prepare("SELECT player_id, fixture_id, data FROM player_history").all();
    const fixturesRows = db.prepare("SELECT data FROM fixtures").all().map((r: any) => JSON.parse(r.data));

    // Map Fixture ID to Difficulty
    const fixtureMap: any = {};
    fixturesRows.forEach((f: any) => {
        fixtureMap[f.id] = f;
    });

    const historyMap = historyRows.reduce((acc: any, r: any) => {
        if (!acc[r.player_id]) acc[r.player_id] = [];
        const h = JSON.parse(r.data);
        h._fid = r.fixture_id;
        acc[r.player_id].push(h);
        return acc;
    }, {});

    const examplesByPos: { [key: number]: TrainingExample[] } = { 1: [], 2: [], 3: [], 4: [] };

    players.forEach((p: any) => {
        const hist = historyMap[p.id];
        if (!hist || hist.length < 2) return;

        // Sort by time
        const cleanHist = hist
            .filter((h: any) => h.minutes <= 120 && h.kickoff_time)
            .sort((a: any, b: any) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

        for (let i = 0; i < cleanHist.length - 1; i++) {
            const current = cleanHist[i];
            const next = cleanHist[i + 1];

            if (next.minutes === 0) continue; // Only predict if they play
            if (current.smart_value === undefined) continue;

            const fid = next._fid;
            const fixture = fixtureMap[fid];
            if (!fixture) continue;

            let difficulty = 3; // Default
            let isHome = 0;

            // Determine difficulty for the PLAYER
            if (fixture.team_h === next.opponent_team) {
                // Player is AWAY vs Team H
                isHome = 0;
                difficulty = fixture.team_a_difficulty;
            } else {
                // Player is HOME vs Team A
                isHome = 1;
                difficulty = fixture.team_h_difficulty;
            }

            // Check correctness of mapping?
            // Player history has 'was_home'.
            if (next.was_home) {
                isHome = 1;
                difficulty = fixture.team_h_difficulty;
            } else {
                isHome = 0;
                difficulty = fixture.team_a_difficulty;
            }

            examplesByPos[p.element_type].push({
                smartValue: current.smart_value,
                fixtureDifficulty: difficulty, // 1 (Easy) to 5 (Hard)
                isHome,
                nextPoints: next.total_points
            });
        }
    });

    console.log("\n## Prediction correlations (Single Feature vs Points)\n");
    console.log("| Position | Smart Value (r) | Inverted Difficulty (r) | Home Adv (r) | Pairs |");
    console.log("|---|---|---|---|---|");

    for (const type of [1, 2, 3, 4]) {
        const data = examplesByPos[type];
        if (data.length < 50) continue;

        const svR = calculateCorrelation(data.map(d => d.smartValue), data.map(d => d.nextPoints));
        // Invert difficulty (Hard=Bad) so we expect negative correlation. 
        // Let's correlate with (6 - difficulty) to imply "Easiness".
        const diffR = calculateCorrelation(data.map(d => 6 - d.fixtureDifficulty), data.map(d => d.nextPoints));
        const homeR = calculateCorrelation(data.map(d => d.isHome), data.map(d => d.nextPoints));

        const posName = ['?', 'GKP', 'DEF', 'MID', 'FWD'][type];
        console.log(`| ${posName} | **${svR.toFixed(3)}** | ${diffR.toFixed(3)} | ${homeR.toFixed(3)} | ${data.length} |`);
    }

    console.log("\n## Simple Combined Model (Smart Value * Easiness Factor)\n");
    // Model: SV * (1 + (Easiness * Weight))?
    // Let's just try SV / Difficulty? Or SV * (6 - Difficulty)

    console.log("| Position | Model (SV * Easiness) (r) |");
    console.log("|---|---|");

    for (const type of [1, 2, 3, 4]) {
        const data = examplesByPos[type];
        if (data.length < 50) continue;

        // Easiness factor: Map 5 (Hard) -> 0.8, 1 (Easy) -> 1.2?
        // Let's try simple multiplication first: SV * (6 - Difficulty)
        const modeled = data.map(d => d.smartValue * (6 - d.fixtureDifficulty));
        const r = calculateCorrelation(modeled, data.map(d => d.nextPoints));

        const posName = ['?', 'GKP', 'DEF', 'MID', 'FWD'][type];
        console.log(`| ${posName} | **${r.toFixed(3)}** |`);
    }
}

analyzePrediction();
