import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';
import fs from 'fs';

// --- Configuration ---
const DB_PATH = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const OUTPUT_DIR = path.resolve(process.cwd(), "public/data/processed");
const LOOKBACK = 5; // Length of history sequence

console.log(`Starting Feature Engineering...`);
console.log(`DB: ${DB_PATH}`);
console.log(`Output: ${OUTPUT_DIR}`);

// --- Data Types ---
interface RawMatch {
    round: number;
    total_points: number;
    minutes: number;
    was_home: boolean;
    opponent_team: number;
    value: number;
    expected_goals: string;
    expected_assists: string;
    threat: string;
    creativity: string;
    influence: string;
    goals_conceded: number;
    saves: number;
    selected: number;
    smart_value: number;
    kickoff_time: string;
    team_h_difficulty?: number; // Joined later
    team_a_difficulty?: number; // Joined later
}

interface ProcessedSample {
    name: string;
    id: number;
    gw: number;
    season: string;
    target: number;
    // Context
    ctx_was_home: number;
    ctx_opponent: number;
    ctx_difficulty: number;
    ctx_price: number;
    ctx_hours_rest: number;
    // History Sequence (Flat for now, but ordered)
    history_sequence: number[][]; // [ [min, xG, xA...], [min, xG, xA...] ]
}

// --- Helpers ---
function parseFloatSafe(val: any): number {
    const f = parseFloat(val);
    return isNaN(f) ? 0 : f;
}

// --- Main ---
function main() {
    const db = new Database(DB_PATH);

    // 1. Fetch Raw Data
    const players = db.prepare("SELECT id, data FROM players").all().map((r: any) => ({
        id: r.id,
        ...JSON.parse(r.data)
    }));

    // Group history by player
    const historyRaw = db.prepare("SELECT player_id, data FROM player_history").all();
    const historyByPlayer: Record<number, RawMatch[]> = {};

    historyRaw.forEach((row: any) => {
        if (!historyByPlayer[row.player_id]) historyByPlayer[row.player_id] = [];
        historyByPlayer[row.player_id].push(JSON.parse(row.data));
    });

    const fixturesRaw = db.prepare("SELECT data FROM fixtures").all().map((r: any) => JSON.parse(r.data));

    // 2. Processing
    const datasets: Record<string, ProcessedSample[]> = {
        "GKP": [], "DEF": [], "MID": [], "FWD": []
    };

    let totalSamples = 0;

    for (const player of players) {
        const history = historyByPlayer[player.id];
        if (!history || history.length < LOOKBACK) continue;

        // Sort by Kickoff Time (Chronological) to handle multiple seasons correctly
        history.sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

        // Iterate through rounds to create samples
        // We predict Round T. We need history from T-1, T-2...
        // We must respect Season boundaries. History window should probably NOT cross seasons (reset form).
        // OR we allow it but note the long gap (hoursRest will be huge).

        for (let i = LOOKBACK; i < history.length; i++) {
            const targetMatch = history[i];
            const gw = parseInt(targetMatch.round as any);
            if (isNaN(gw)) continue; // Skip bad data

            // Determine Season
            const date = new Date(targetMatch.kickoff_time);
            const season = date.getFullYear() === 2024 || (date.getFullYear() === 2025 && date.getMonth() < 6) ? "24/25" : "25/26";

            // If crossing seasons (huge gap), we might want to skip or just accept the gap.
            // Let's accept it but allow hours_rest to be capped.

            // Find fixture for (Team, Opponent, GW)
            // Fix: Identifying fixture in 'fixtures' table requires Season matching too.
            // But 'fixtures' table in valid fpl dump usually only has CURRENT season.
            // If historical data is in player_history, we rely on that.
            // We'll trust player_history's context primarily if fixture lookup fails.

            const pTeam = player.team;
            const fixture = fixturesRaw.find((f: any) =>
                f.event === gw &&
                ((f.team_h === pTeam && f.team_a === targetMatch.opponent_team) ||
                    (f.team_a === pTeam && f.team_h === targetMatch.opponent_team))
            );

            let difficulty = 3; // Default
            if (fixture) {
                if (fixture.team_h === pTeam) difficulty = fixture.team_h_difficulty;
                else difficulty = fixture.team_a_difficulty;
            }

            // Calc Rest
            const prevMatch = history[i - 1];
            const currTime = new Date(targetMatch.kickoff_time).getTime();
            const prevTime = new Date(prevMatch.kickoff_time).getTime();
            const hoursRest = (currTime - prevTime) / (1000 * 60 * 60);

            // Construct History Sequence
            const seqData: number[][] = [];

            for (let k = 1; k <= LOOKBACK; k++) {
                const past = history[i - k]; // i-1 is most recent

                seqData.unshift([ // Unshift to keep chronological order (Oldest -> Newest)
                    parseFloatSafe(past.minutes),
                    parseFloatSafe(past.expected_goals),
                    parseFloatSafe(past.expected_assists),
                    parseFloatSafe(past.threat),
                    parseFloatSafe(past.creativity),
                    parseFloatSafe(past.influence),
                    parseFloatSafe(past.goals_conceded),
                    parseFloatSafe(past.saves),
                    Math.log1p(parseFloatSafe(past.selected)), // Log transform ownership
                    parseFloatSafe(past.smart_value || 0),
                    parseFloatSafe(past.value) / 10.0, // Normalize price approx
                    past.was_home ? 1 : 0,
                    parseFloatSafe(past.total_points) // Include points history!
                ]);
            }

            const sample: ProcessedSample = {
                name: player.web_name,
                id: player.id,
                gw: gw,
                season: season, // New Field
                target: targetMatch.total_points,
                ctx_was_home: targetMatch.was_home ? 1 : 0,
                ctx_opponent: targetMatch.opponent_team,
                ctx_difficulty: difficulty,
                ctx_price: targetMatch.value / 10.0,
                ctx_hours_rest: Math.min(hoursRest, 300), // Cap at ~12 days to avoid huge outliers
                history_sequence: seqData
            };

            // Route to bucket
            if (player.element_type === 1) datasets["GKP"].push(sample);
            else if (player.element_type === 2) datasets["DEF"].push(sample);
            else if (player.element_type === 3) datasets["MID"].push(sample);
            else if (player.element_type === 4) datasets["FWD"].push(sample);

            totalSamples++;
        }
    }

    console.log(`\nProcessing Complete. Total Samples: ${totalSamples}`);

    for (const [pos, data] of Object.entries(datasets)) {
        const p = path.join(OUTPUT_DIR, `dataset_${pos}.json`);
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
        console.log(`Saved ${pos}: ${data.length} samples -> ${p}`);
    }
}

main();
