
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

interface DataPoint {
    sv: number;
    nextPoints: number;
}

function calculateCorrelation(data: DataPoint[]): number {
    const n = data.length;
    if (n < 2) return 0;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (const p of data) {
        sumX += p.sv;
        sumY += p.nextPoints;
        sumXY += p.sv * p.nextPoints;
        sumX2 += p.sv * p.sv;
        sumY2 += p.nextPoints * p.nextPoints;
    }

    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));

    if (denominator === 0) return 0;

    return numerator / denominator;
}

function getAbsoluteRound(h: any): number {
    const round = h.round || 999;
    if (h.season_name === '2024/25' || h.season === '2024/25') {
        return round;
    } else {
        return 38 + round;
    }
}

async function analyze() {
    console.log("📊 Analyzing Smart Value Correlation...");

    const players = db.prepare("SELECT data FROM players").all().map((r: any) => JSON.parse(r.data));
    const historyRows = db.prepare("SELECT player_id, data FROM player_history").all();

    const historyMap = historyRows.reduce((acc: any, r: any) => {
        if (!acc[r.player_id]) acc[r.player_id] = [];
        const h = JSON.parse(r.data);
        h._absRound = getAbsoluteRound(h);
        acc[r.player_id].push(h);
        return acc;
    }, {});

    const positionData: { [key: number]: DataPoint[] } = {
        1: [], // GKP
        2: [], // DEF
        3: [], // MID
        4: []  // FWD
    };

    let totalPairs = 0;

    players.forEach((p: any) => {
        const history = historyMap[p.id];
        if (!history || history.length < 2) return;

        // Filter out summary rows or bad data
        const cleanHistory = history.filter((h: any) => h.minutes <= 120 && h.kickoff_time);

        // Sort by kickoff_time
        cleanHistory.sort((a: any, b: any) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

        // Use cleanHistory for loop
        for (let i = 0; i < cleanHistory.length - 1; i++) {
            const current = cleanHistory[i];
            const next = cleanHistory[i + 1];

            // Validate sequence (e.g. Next match should be relatively close? 
            // Or just next played match is fine. "Next Match" simply means next appearance.)

            // Check if Smart Value was calculated for current match
            if (current.smart_value !== undefined && next.total_points !== undefined) {
                // Also exclude matches where minutes = 0? 
                // SV is form. Next points is outcome. If next points is 0 because benched, 
                // SV might have been high. Should we punish SV? 
                // SV usually implies "If they play". But Risk is part of the game.
                // However, let's filter for where player played > 0 mins NEXT match to test "Performance Prediction"
                // vs "Lineup Prediction". Smart Value currently models performance stats mostly.
                // Let's filter next.minutes > 0 for now to see "If he plays, how well does he do?"

                if (next.minutes > 0) {
                    positionData[p.element_type].push({ sv: current.smart_value, nextPoints: next.total_points });
                    totalPairs++;
                }
            }
        }
    });

    console.log(`Extracted ${totalPairs} pairs.`);

    console.log("\n## Correlation Report (Smart Value vs Next Match Points)\n");
    console.log("| Position | Pairs | Correlation (r) |");
    console.log("|---|---|---|");

    const posNames = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };

    for (let type = 1; type <= 4; type++) {
        const data = positionData[type];
        const r = calculateCorrelation(data);
        console.log(`| ${posNames[type as 1 | 2 | 3 | 4]} | ${data.length} | **${r.toFixed(4)}** |`);
    }
    console.log("\n");
}

analyze();
