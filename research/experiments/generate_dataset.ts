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
    selected_by_percent: number; // New field for ownership boost
    // Context
    ctx_was_home: number;
    ctx_opponent: number;
    ctx_difficulty: number;
    ctx_price: number;
    ctx_hours_rest: number;
    // All-Time Features (Player Quality Baseline)
    ctx_all_time_avg_points: number;
    ctx_all_time_total_points: number;
    ctx_all_time_goals_per_90: number;
    ctx_all_time_xg_per_90: number;
    ctx_all_time_games_played: number;
    // History Sequence (Flat for now, but ordered)
    history_sequence: number[][]; // [ [min, xG, xA...], [min, xG, xA...] ]
}

// --- Helpers ---
function parseFloatSafe(val: any): number {
    const f = parseFloat(val);
    return isNaN(f) ? 0 : f;
}

function getSeason(kickoffTime: string): string {
    const date = new Date(kickoffTime);
    const year = date.getFullYear();
    const month = date.getMonth();

    // Season runs from August (month 7) to May (month 4)
    // If month is Aug-Dec, season is year/year+1
    // If month is Jan-Jul, season is year-1/year
    if (month >= 7) {
        return `${year % 100}/${(year + 1) % 100}`;
    } else {
        return `${(year - 1) % 100}/${year % 100}`;
    }
}

interface SeasonStats {
    avg_points: number;
    total_points: number;
    goals_per_90: number;
    xg_per_90: number;
    consistency: number;
    avg_minutes: number;
    games_played: number;
}

function calculateSeasonStats(matches: RawMatch[]): SeasonStats | null {
    if (matches.length === 0) {
        return null;
    }

    const totalMinutes = matches.reduce((sum, m) => sum + m.minutes, 0);
    const totalPoints = matches.reduce((sum, m) => sum + m.total_points, 0);
    const totalGoals = matches.reduce((sum, m) => sum + parseFloatSafe((m as any).goals_scored || 0), 0);
    const totalXG = matches.reduce((sum, m) => sum + parseFloatSafe(m.expected_goals), 0);

    const avgPoints = totalPoints / matches.length;
    const pointsVariance = matches.reduce((sum, m) => sum + Math.pow(m.total_points - avgPoints, 2), 0) / matches.length;
    const consistency = Math.sqrt(pointsVariance);

    return {
        avg_points: avgPoints,
        total_points: totalPoints,
        goals_per_90: totalMinutes > 0 ? (totalGoals / totalMinutes) * 90 : 0,
        xg_per_90: totalMinutes > 0 ? (totalXG / totalMinutes) * 90 : 0,
        consistency: consistency,
        avg_minutes: totalMinutes / matches.length,
        games_played: matches.length
    };
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

    for (const player of players) {
        // Filter out matches with missing data
        const historyRawData = historyByPlayer[player.id] || [];
        const history = historyRawData.filter(m => m.kickoff_time && !isNaN(new Date(m.kickoff_time).getTime()));
        if (history.length < LOOKBACK) continue;

        // Sort by Kickoff Time (Chronological: Oldest -> Newest)
        history.sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

        // Iterate through rounds to create samples
        for (let i = 0; i < history.length; i++) {
            const targetMatch = history[i];
            const gw = parseInt(targetMatch.round as any);
            if (isNaN(gw)) continue;

            // Skip entries if we don't have enough history for the sequence
            if (i < LOOKBACK) continue;

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

            // Calc Opponent Strength
            // If we are Home, opponent is Away -> use Opponent Strength Away
            // If we are Away, opponent is Home -> use Opponent Strength Home
            const opponentId = targetMatch.opponent_team;
            const opponent = teamsMap[opponentId];
            let opponentStrength = 1100; // Default fallback

            if (opponent) {
                if (targetMatch.was_home) {
                    // We are Home, Opponent is Away
                    opponentStrength = opponent.strength_overall_away || opponent.strength || 1100;
                } else {
                    // We are Away, Opponent is Home
                    opponentStrength = opponent.strength_overall_home || opponent.strength || 1100;
                }

                // If it's the simplified 'strength' (1-5), scale it to ~1000 range
                if (opponentStrength < 100) {
                    opponentStrength = 1000 + (opponentStrength - 3) * 100;
                }
            }

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
                    // REMOVED: parseFloatSafe(past.smart_value || 0),
                    parseFloatSafe(past.value) / 10.0, // Normalize price approx
                    past.was_home ? 1 : 0,
                    parseFloatSafe(past.total_points) // Include points history!
                ]);
            }

            // Calculate All-Time Statistics (all history up to current match)
            const historyBeforeTarget = history.slice(0, i);
            const allTimeStats = calculateSeasonStats(historyBeforeTarget);


            const sample: ProcessedSample = {
                name: player.web_name,
                id: player.id,
                gw: gw,
                season: season, // New Field
                target: targetMatch.total_points,
                selected_by_percent: parseFloatSafe(targetMatch.selected_by_percent),
                ctx_was_home: targetMatch.was_home ? 1 : 0,
                ctx_opponent: opponentStrength, // UPDATED: Now using actual team strength!
                ctx_difficulty: difficulty,
                ctx_price: targetMatch.value / 10.0,
                ctx_hours_rest: Math.min(hoursRest, 300), // Cap at ~12 days to avoid huge outliers
                // All-Time Features (Player Quality Baseline)
                ctx_all_time_avg_points: allTimeStats?.avg_points || 0,
                ctx_all_time_total_points: allTimeStats?.total_points || 0,
                ctx_all_time_goals_per_90: allTimeStats?.goals_per_90 || 0,
                ctx_all_time_xg_per_90: allTimeStats?.xg_per_90 || 0,
                ctx_all_time_games_played: allTimeStats?.games_played || 0,
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
