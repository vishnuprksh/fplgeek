import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';
import fs from 'fs';

// --- Configuration ---
const DB_PATH = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const OUTPUT_DIR = path.resolve(process.cwd(), "public/data/processed");
const LOOKBACK = 10; // Length of history sequence (supports 10-match rolling window)

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
    selected_by_percent: string; // From API (can be string or number, stored as text in DB likely)
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
    is_future: boolean;
    selected_by_percent: number;
    // Context
    ctx_was_home: number;
    ctx_opponent: number;
    ctx_difficulty: number;
    ctx_price: number;
    ctx_hours_rest: number;
    // Form, Ownership, Availability
    ctx_ownership: number;
    ctx_chance_of_playing: number;
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

    // 2. Fetch Team Data for Strength
    const teams = db.prepare("SELECT id, data FROM teams").all().map((r: any) => ({
        id: r.id,
        ...JSON.parse(r.data)
    }));
    const teamsMap: Record<number, any> = {};
    teams.forEach((t: any) => teamsMap[t.id] = t);

    const fixturesRaw = db.prepare("SELECT data FROM fixtures").all().map((r: any) => JSON.parse(r.data));

    // 3. Processing
    const datasets: Record<string, ProcessedSample[]> = {
        "GKP": [], "DEF": [], "MID": [], "FWD": []
    };

    let totalSamples = 0;

    // Create a map of team fixtures for quick lookup: teamId -> array of fixtures
    const teamFixturesMap: Record<number, any[]> = {};
    fixturesRaw.forEach((f: any) => {
        if (!teamFixturesMap[f.team_h]) teamFixturesMap[f.team_h] = [];
        if (!teamFixturesMap[f.team_a]) teamFixturesMap[f.team_a] = [];
        teamFixturesMap[f.team_h].push(f);
        teamFixturesMap[f.team_a].push(f);
    });

    for (const player of players) {
        // Filter out matches with missing data
        const historyRawData = historyByPlayer[player.id] || [];
        const history = historyRawData.filter(m => m.kickoff_time && !isNaN(new Date(m.kickoff_time).getTime()));

        // Sort by Kickoff Time (Chronological: Oldest -> Newest)
        history.sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

        // --- PART A: Process Historical Data ---
        // Iterate through rounds to create samples
        let lastMatchDate = new Date('2000-01-01');

        if (history.length >= LOOKBACK) {
            for (let i = 0; i < history.length; i++) {
                const targetMatch = history[i];
                const gw = parseInt(targetMatch.round as any);
                if (isNaN(gw)) continue;

                // Update last match date
                const matchDate = new Date(targetMatch.kickoff_time);
                if (matchDate > lastMatchDate) lastMatchDate = matchDate;

                // Skip entries if we don't have enough history for the sequence
                if (i < LOOKBACK) continue;

                const date = new Date(targetMatch.kickoff_time);
                let season = "Unknown";
                const year = date.getFullYear();
                const month = date.getMonth(); // 0-11

                // Logic: Season starts Aug (7), ends May (4) usually
                if ((year === 2023 && month >= 7) || (year === 2024 && month < 6)) {
                    season = "23/24";
                } else if ((year === 2024 && month >= 7) || (year === 2025 && month < 6)) {
                    season = "24/25";
                } else if ((year === 2025 && month >= 7) || (year === 2026 && month < 6)) {
                    season = "25/26";
                }

                const pTeam = player.team;

                // Find fixture context (difficulty etc)
                // We prioritize player_history context if available, but for consistency we can look up fixture too.
                // Here we stick to existing logic for history samples.

                let difficulty = 3;
                // Try to find fixture to get accurate difficulty
                const fixture = fixturesRaw.find((f: any) =>
                    f.event === gw &&
                    ((f.team_h === pTeam && f.team_a === targetMatch.opponent_team) ||
                        (f.team_a === pTeam && f.team_h === targetMatch.opponent_team))
                );

                if (fixture) {
                    if (fixture.team_h === pTeam) difficulty = fixture.team_h_difficulty;
                    else difficulty = fixture.team_a_difficulty;
                }

                // Calc Rest
                const prevMatch = history[i - 1];
                const currTime = new Date(targetMatch.kickoff_time).getTime();
                const prevTime = new Date(prevMatch.kickoff_time).getTime();
                const hoursRest = (currTime - prevTime) / (1000 * 60 * 60);

                // Calc Opponent Strength
                const opponentId = targetMatch.opponent_team;
                const opponent = teamsMap[opponentId];
                let opponentStrength = 1100;

                if (opponent) {
                    if (targetMatch.was_home) {
                        opponentStrength = opponent.strength_overall_away || opponent.strength || 1100;
                    } else {
                        opponentStrength = opponent.strength_overall_home || opponent.strength || 1100;
                    }
                    if (opponentStrength < 100) {
                        opponentStrength = 1000 + (opponentStrength - 3) * 100;
                    }
                }

                // Construct History Sequence
                const seqData: number[][] = [];

                for (let k = 1; k <= LOOKBACK; k++) {
                    const past = history[i - k];
                    // Calculate form for this past match (avg points from previous 4 matches)
                    let pastForm = 0;
                    if (i - k >= 4) {
                        const formMatches = history.slice(Math.max(0, i - k - 4), i - k);
                        const formSum = formMatches.reduce((sum, m) => sum + m.total_points, 0);
                        pastForm = formMatches.length > 0 ? formSum / formMatches.length : 0;
                    }

                    seqData.unshift([
                        parseFloatSafe(past.minutes),
                        parseFloatSafe(past.expected_goals),
                        parseFloatSafe(past.expected_assists),
                        parseFloatSafe(past.threat),
                        parseFloatSafe(past.creativity),
                        parseFloatSafe(past.influence),
                        parseFloatSafe(past.goals_conceded),
                        parseFloatSafe(past.saves),
                        Math.log1p(parseFloatSafe(past.selected)),
                        parseFloatSafe(past.value) / 10.0,
                        past.was_home ? 1 : 0,
                        parseFloatSafe(past.total_points),
                        pastForm  // NEW: 13th feature - form
                    ]);
                }

                // Calculate All-Time Statistics — REMOVED (replaced by rolling windows in ai_manager.py)

                const sample: ProcessedSample = {
                    name: player.web_name,
                    id: player.id,
                    gw: gw,
                    season: season,
                    target: targetMatch.total_points,
                    is_future: false,
                    selected_by_percent: parseFloatSafe(targetMatch.selected_by_percent),
                    ctx_was_home: targetMatch.was_home ? 1 : 0,
                    ctx_opponent: opponentStrength,
                    ctx_difficulty: difficulty,
                    ctx_price: targetMatch.value / 10.0,
                    ctx_hours_rest: Math.min(hoursRest, 300),
                    ctx_ownership: parseFloatSafe(targetMatch.selected_by_percent),
                    ctx_chance_of_playing: 100, // Historical matches: player played, so 100%
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

        // --- PART B: Process Future Fixtures ---
        // Find all fixtures for this player's team that are AFTER the last processed match
        // Or simplified: Find all fixtures for this player's team in the current season that haven't been processed.
        // Actually, safer to just check against the 'fixtures' table for dates > lastMatchDate

        const myTeamFixtures = teamFixturesMap[player.team] || [];

        // Filter for future fixtures
        const futureFixtures = myTeamFixtures.filter((f: any) => {
            const fDate = new Date(f.kickoff_time);
            return fDate > lastMatchDate;
        });

        // Sort future fixtures
        futureFixtures.sort((a: any, b: any) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

        // Use the LAST valid history sequence for placeholder
        // We need a valid sequence to feed the model, even if sim_utils will swap it.
        // It's critical for the data loader to return a valid shape.
        // If the player lacks the 10 games of history needed for the rolling windows, drop them
        // per user request (instead of zero-padding them).
        if (history.length < LOOKBACK) {
            continue;
        }

        let placeholderSeq: number[][] = [];
        for (let k = 0; k < LOOKBACK; k++) {
            const past = history[history.length - 1 - k]; // Last 10 matches
            // Calculate form for this past match
            let pastForm = 0;
            if (history.length - 1 - k >= 4) {
                const formMatches = history.slice(Math.max(0, history.length - 1 - k - 4), history.length - 1 - k);
                const formSum = formMatches.reduce((sum, m) => sum + m.total_points, 0);
                pastForm = formMatches.length > 0 ? formSum / formMatches.length : 0;
            }

            placeholderSeq.unshift([
                parseFloatSafe(past.minutes),
                parseFloatSafe(past.expected_goals),
                parseFloatSafe(past.expected_assists),
                parseFloatSafe(past.threat),
                parseFloatSafe(past.creativity),
                parseFloatSafe(past.influence),
                parseFloatSafe(past.goals_conceded),
                parseFloatSafe(past.saves),
                Math.log1p(parseFloatSafe(past.selected)),
                parseFloatSafe(past.value) / 10.0,
                past.was_home ? 1 : 0,
                parseFloatSafe(past.total_points),
                pastForm  // NEW: 13th feature
            ]);
        }

        // All-Time stats — REMOVED (replaced by rolling windows)
        const lastValue = history.length > 0 ? parseFloatSafe(history[history.length - 1].value) / 10.0 : 5.0; // Fallback price

        let lastFixtureTime = lastMatchDate.getTime();

        for (const f of futureFixtures) {
            const gw = f.event;
            if (!gw) continue;

            const season = "25/26"; // Assume future fixtures are current season

            const isHome = f.team_h === player.team;
            const opponentId = isHome ? f.team_a : f.team_h;
            const difficulty = isHome ? f.team_h_difficulty : f.team_a_difficulty;

            const opponent = teamsMap[opponentId];
            let opponentStrength = 1100;
            if (opponent) {
                if (isHome) {
                    // We are Home, Opponent is Away
                    opponentStrength = opponent.strength_overall_away || opponent.strength || 1100;
                } else {
                    // We are Away, Opponent is Home
                    opponentStrength = opponent.strength_overall_home || opponent.strength || 1100;
                }
                if (opponentStrength < 100) {
                    opponentStrength = 1000 + (opponentStrength - 3) * 100;
                }
            }

            const currTime = new Date(f.kickoff_time).getTime();
            const hoursRest = (currTime - lastFixtureTime) / (1000 * 60 * 60);
            lastFixtureTime = currTime; // Update for next iteration in loop

            const sample: ProcessedSample = {
                name: player.web_name,
                id: player.id,
                gw: gw,
                season: season,
                target: 0, // Future target unknown
                is_future: true,
                selected_by_percent: 0, // Unknown
                ctx_was_home: isHome ? 1 : 0,
                ctx_opponent: opponentStrength,
                ctx_difficulty: difficulty,
                ctx_price: lastValue, // Use last known price
                ctx_hours_rest: Math.min(hoursRest, 300),
                ctx_ownership: 0, // Unknown for future fixtures
                ctx_chance_of_playing: player.chance_of_playing_next_round ?? 100, // From player static data
                history_sequence: placeholderSeq
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
