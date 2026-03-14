import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const _dataRoot = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
const DB_PATH = path.join(_dataRoot, 'fpl.sqlite');
const OUTPUT_DIR = path.join(_dataRoot, 'processed');
const LOOKBACK = 10; // Store 10 matches to ensure we can find a cycling window of 10 played games

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

// --- Fixture-Based Team Strength ---
// Mirrors calculateTable() + getFixtureTicker() logic from fixtures.ts
interface TeamVenueStats {
    goalsScored: number;
    goalsConceded: number;
    homeGoalsScored: number;
    homeGoalsConceded: number;
    awayGoalsScored: number;
    awayGoalsConceded: number;
    played: number;
}

function buildTeamVenueTable(finishedFixtures: any[]): Record<number, TeamVenueStats> {
    const table: Record<number, TeamVenueStats> = {};
    const teamIds = new Set<number>();
    finishedFixtures.forEach(f => {
        teamIds.add(f.team_h);
        teamIds.add(f.team_a);
    });

    const ensure = (id: number) => {
        if (!table[id]) {
            table[id] = {
                goalsScored: 0, goalsConceded: 0,
                homeGoalsScored: 0, homeGoalsConceded: 0,
                awayGoalsScored: 0, awayGoalsConceded: 0,
                played: 0
            };
        }
    };

    // Sort chronologically
    const sorted = [...finishedFixtures].sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

    teamIds.forEach(teamId => {
        ensure(teamId);
        const teamMatches = sorted.filter(f => f.team_h === teamId || f.team_a === teamId);
        const last10 = teamMatches.slice(-10);

        last10.forEach(f => {
            const isHome = f.team_h === teamId;
            const hScore: number = f.team_h_score ?? 0;
            const aScore: number = f.team_a_score ?? 0;

            table[teamId].played++;
            if (isHome) {
                table[teamId].goalsScored += hScore;
                table[teamId].goalsConceded += aScore;
                table[teamId].homeGoalsScored += hScore;
                table[teamId].homeGoalsConceded += aScore;
            } else {
                table[teamId].goalsScored += aScore;
                table[teamId].goalsConceded += hScore;
                table[teamId].awayGoalsScored += aScore;
                table[teamId].awayGoalsConceded += hScore;
            }
        });
    });

    return table;
}

// Compute raw attack & defense scores for a given team vs opponent (Venue Independent)
function computeFixtureScores(
    teamId: number,
    opponentId: number,
    venueTable: Record<number, TeamVenueStats>
): { attackRaw: number; defenseRaw: number } {
    const team = venueTable[teamId];
    const opp = venueTable[opponentId];

    if (!team || !opp) return { attackRaw: 0, defenseRaw: 0 };

    // Attack: our offensive output + opponent's defensive weakness (Total)
    const attackRaw = team.goalsScored + opp.goalsConceded;

    // Defense: opponent's offensive threat + our defensive weakness (Total)
    const defenseRaw = opp.goalsScored + team.goalsConceded;

    return { attackRaw, defenseRaw };
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
    // Fixture-Based Team Strength (Venue Independent, 10-match window)
    ctx_fixture_attack: number;    // [0,1] — higher = easier to score
    ctx_fixture_defense: number;   // [0,1] — higher = easier to keep sheet
    // History Sequence (Flat for now, but ordered)
    history_sequence: number[][]; // [ [min, xG, xA...], [min, xG, xA...] ]
    // Pre-computed rolling-window aggregates (consistency-adjusted, penalty-scaled)
    agg_r4: number[];  // 9 features: [min, pts, xG, xA, inf, cre, thr, gc, saves] over last 4 played games
    agg_r10: number[]; // 9 features: same over last 10 played games
    // ML Ready
    target_class: number; // 0-15 bucketized points
    feature_vector: number[]; // All 27 features normalized/cleaned
}

// --- Helpers ---
function parseFloatSafe(val: any): number {
    const f = parseFloat(val);
    return isNaN(f) ? 0 : f;
}

// Rolling window aggregation
// history_sequence columns: [min, xG, xA, thr, cre, inf, gc, saves, sel, price, home, pts, form]
const AGG_INDICES = [0, 11, 1, 2, 5, 4, 3, 6, 7]; // [min, pts, xG, xA, inf, cre, thr, gc, saves]
const AGG_WINDOWS = [4, 10];

function computeRollingAgg(historySeq: number[][], window: number): number[] {
    if (historySeq.length === 0) return new Array(AGG_INDICES.length).fill(0);
    const played = historySeq.filter(h => h[0] > 0); // minutes > 0
    const available = Math.min(window, played.length);
    if (available === 0) return new Array(AGG_INDICES.length).fill(0);
    const sub = played.slice(-available);
    const penaltyFactor = available / window;
    return AGG_INDICES.map(idx => {
        const vals = sub.map(h => h[idx]);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        if (mean === 0) return 0;
        const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
        const std = Math.sqrt(variance);
        const cv = std / mean;
        return mean * (1 - cv) * penaltyFactor;
    });
}

function classifyTarget(points: number): number {
    return Math.max(0, Math.min(Math.floor(points), 15));
}

function cleanAndVectorize(sample: any): number[] {
    const ctx = [
        sample.ctx_was_home,
        sample.ctx_difficulty,
        sample.ctx_price,
        sample.ctx_hours_rest,
        sample.ctx_ownership,
        sample.ctx_opponent,
        sample.ctx_chance_of_playing,
        sample.ctx_fixture_attack,
        sample.ctx_fixture_defense
    ];
    const vec = [...ctx, ...sample.agg_r4, ...sample.agg_r10];
    return vec.map(v => (isNaN(v) || !isFinite(v)) ? 0 : v);
}


// --- Main ---
function main() {
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const db = new Database(DB_PATH);

    // Ensure preprocessed_data table exists
    db.exec(`
        CREATE TABLE IF NOT EXISTS preprocessed_data (
            player_id INTEGER,
            gw INTEGER,
            season TEXT,
            position TEXT,
            is_future INTEGER,
            target_class INTEGER,
            feature_vector BLOB,
            metadata TEXT,
            PRIMARY KEY (player_id, gw, season)
        );
    `);

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

    // 3. Build venue-based team stats table from finished fixtures
    const finishedFixtures = fixturesRaw.filter((f: any) => f.finished === true || f.finished === 1);
    const venueTable = buildTeamVenueTable(finishedFixtures);

    // 4. Processing
    let totalSamples = 0;

    // Track all raw fixture scores for global scaling (two-pass approach)
    // We'll store partial samples first, then scale in a second pass
    type PartialSample = ProcessedSample & { _attackRaw: number; _defenseRaw: number };
    const partialDatasets: Record<string, PartialSample[]> = {
        "GKP": [], "DEF": [], "MID": [], "FWD": []
    };

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
        const history = historyRawData.filter(m => m.kickoff_time && !isNaN(new Date(m.kickoff_time).getTime()) && parseFloatSafe(m.minutes) > 0);

        // Sort by Kickoff Time (Chronological: Oldest -> Newest)
        history.sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

        // --- PART A: Process Historical Data ---
        // Iterate through rounds to create samples
        let lastMatchDate = new Date('2000-01-01');

        if (history.length > 0) {
            for (let i = 0; i < history.length; i++) {
                const targetMatch = history[i];
                const gw = parseInt(targetMatch.round as any);
                if (isNaN(gw)) continue;

                // Skip games where the player didn't play (minutes == 0)
                if (parseFloatSafe(targetMatch.minutes) === 0) continue;

                // Update last match date
                const matchDate = new Date(targetMatch.kickoff_time);
                if (matchDate > lastMatchDate) lastMatchDate = matchDate;

                // We don't skip entries without full history, we pad them instead

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
                let hoursRest = 168; // Default 1 week
                if (i > 0) {
                    const prevMatch = history[i - 1];
                    const currTime = new Date(targetMatch.kickoff_time).getTime();
                    const prevTime = new Date(prevMatch.kickoff_time).getTime();
                    hoursRest = (currTime - prevTime) / (1000 * 60 * 60);
                }

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

                for (let k = LOOKBACK; k >= 1; k--) {
                    if (i - k < 0) {
                        seqData.push(new Array(13).fill(0));
                        continue;
                    }
                    const past = history[i - k];
                    // Calculate form for this past match (avg points from previous 4 matches)
                    let pastForm = 0;
                    if (i - k >= 4) {
                        const formMatches = history.slice(Math.max(0, i - k - 4), i - k);
                        const formSum = formMatches.reduce((sum, m) => sum + m.total_points, 0);
                        pastForm = formMatches.length > 0 ? formSum / formMatches.length : 0;
                    }

                    seqData.push([
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

                // Compute pre-aggregated rolling window features
                const agg_r4 = computeRollingAgg(seqData, AGG_WINDOWS[0]);
                const agg_r10 = computeRollingAgg(seqData, AGG_WINDOWS[1]);

                // Compute fixture-based team strength scores
                const { attackRaw, defenseRaw } = computeFixtureScores(
                    pTeam, targetMatch.opponent_team, venueTable
                );

                const sample = {
                    name: player.web_name,
                    id: player.id,
                    team: player.team,
                    gw: gw,
                    season: season,
                    target: targetMatch.total_points,
                    target_class: classifyTarget(targetMatch.total_points),
                    is_future: false,
                    selected_by_percent: parseFloatSafe(player.selected_by_percent),
                    ctx_was_home: targetMatch.was_home ? 1 : 0,
                    ctx_opponent: opponentStrength,
                    ctx_difficulty: difficulty,
                    ctx_price: targetMatch.value / 10.0,
                    ctx_hours_rest: Math.min(hoursRest, 300),
                    ctx_ownership: parseFloatSafe(player.selected_by_percent),
                    ctx_chance_of_playing: 100,
                    ctx_fixture_attack: 0,    // filled in second pass
                    ctx_fixture_defense: 0,   // filled in second pass
                    history_sequence: seqData,
                    agg_r4,
                    agg_r10,
                    _attackRaw: attackRaw,
                    _defenseRaw: defenseRaw
                } as any;

                // Route to bucket
                if (player.element_type === 1) partialDatasets["GKP"].push(sample);
                else if (player.element_type === 2) partialDatasets["DEF"].push(sample);
                else if (player.element_type === 3) partialDatasets["MID"].push(sample);
                else if (player.element_type === 4) partialDatasets["FWD"].push(sample);

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
        // If the player lacks the 10 games of history, pad them
        // we'll apply a penalty factor during training/inference.
        if (history.length === 0) {
            continue;
        }

        let placeholderSeq: number[][] = [];
        for (let k = LOOKBACK; k >= 1; k--) {
            if (history.length - k < 0) {
                placeholderSeq.push(new Array(13).fill(0));
                continue;
            }
            const past = history[history.length - k]; // Oldest to newest in the Lookback window
            // Calculate form for this past match
            let pastForm = 0;
            if (history.length - k >= 4) {
                const formMatches = history.slice(Math.max(0, history.length - k - 4), history.length - k);
                const formSum = formMatches.reduce((sum, m) => sum + m.total_points, 0);
                pastForm = formMatches.length > 0 ? formSum / formMatches.length : 0;
            }

            placeholderSeq.push([
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

            // Compute fixture-based scores for this future fixture
            const futOpponentId = isHome ? f.team_a : f.team_h;
            const { attackRaw: futAttackRaw, defenseRaw: futDefenseRaw } = computeFixtureScores(
                player.team, futOpponentId, venueTable
            );

            // Compute pre-aggregated rolling window features from the placeholder history
            const fut_agg_r4 = computeRollingAgg(placeholderSeq, AGG_WINDOWS[0]);
            const fut_agg_r10 = computeRollingAgg(placeholderSeq, AGG_WINDOWS[1]);

            const sample = {
                name: player.web_name,
                id: player.id,
                team: player.team,
                gw: gw,
                season: season,
                target: 0,
                target_class: 0,
                is_future: true,
                selected_by_percent: parseFloatSafe(player.selected_by_percent),
                ctx_was_home: isHome ? 1 : 0,
                ctx_opponent: opponentStrength,
                ctx_difficulty: difficulty,
                ctx_price: lastValue,
                ctx_hours_rest: Math.min(hoursRest, 300),
                ctx_ownership: parseFloatSafe(player.selected_by_percent),
                ctx_chance_of_playing: player.chance_of_playing_next_round ?? 100,
                ctx_fixture_attack: 0,    // filled in second pass
                ctx_fixture_defense: 0,   // filled in second pass
                history_sequence: placeholderSeq,
                agg_r4: fut_agg_r4,
                agg_r10: fut_agg_r10,
                _attackRaw: futAttackRaw,
                _defenseRaw: futDefenseRaw
            } as any;

            // Route to bucket
            if (player.element_type === 1) partialDatasets["GKP"].push(sample);
            else if (player.element_type === 2) partialDatasets["DEF"].push(sample);
            else if (player.element_type === 3) partialDatasets["MID"].push(sample);
            else if (player.element_type === 4) partialDatasets["FWD"].push(sample);

            totalSamples++;
        }
    }

    console.log(`\nProcessing Complete. Total Samples: ${totalSamples}`);

    // --- SECOND PASS: Min-Max scale fixture scores per position bucket ---
    // This mirrors the global normalization in getFixtureTicker() from fixtures.ts
    for (const [pos, partials] of Object.entries(partialDatasets)) {
        if (partials.length === 0) {
            const p = path.join(OUTPUT_DIR, `dataset_${pos}.json`);
            fs.writeFileSync(p, JSON.stringify([], null, 2));
            continue;
        }

        const allAttackRaw = partials.map(s => s._attackRaw);
        const allDefenseRaw = partials.map(s => s._defenseRaw);

        const minAtk = Math.min(...allAttackRaw);
        const maxAtk = Math.max(...allAttackRaw);
        const rangeAtk = maxAtk - minAtk || 1;

        const minDef = Math.min(...allDefenseRaw);
        const maxDef = Math.max(...allDefenseRaw);
        const rangeDef = maxDef - minDef || 1;

        const output: ProcessedSample[] = partials.map(s => {
            // Attack: high = good (easy to score) → scale high
            const atkScaled = (s._attackRaw - minAtk) / rangeAtk;
            // Defense: low raw = good (opponent is weak attacker) → invert
            const defScaled = (maxDef - s._defenseRaw) / rangeDef;

            const { _attackRaw, _defenseRaw, ...rest } = s;
            const updated = {
                ...rest,
                ctx_fixture_attack: parseFloat(atkScaled.toFixed(4)),
                ctx_fixture_defense: parseFloat(defScaled.toFixed(4))
            } as ProcessedSample;
            // Now vectorize
            updated.feature_vector = cleanAndVectorize(updated);
            return updated;
        });

        const p = path.join(OUTPUT_DIR, `dataset_${pos}.json`);
        fs.writeFileSync(p, JSON.stringify(output, null, 2));
        console.log(`Saved ${pos}: ${output.length} samples -> ${p}`);
    }

    // --- THIRD PASS: Store in SQLite ---
    console.log(`\nStoring preprocessed data in SQLite...`);
    db.prepare("DELETE FROM preprocessed_data").run();

    const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO preprocessed_data (player_id, gw, season, position, is_future, target_class, feature_vector, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((datasets: Record<string, ProcessedSample[]>) => {
        for (const [pos, data] of Object.entries(datasets)) {
            for (const s of data) {
                // Convert feature_vector number[] to Buffer (Float32Array)
                const buffer = Buffer.from(new Float32Array(s.feature_vector).buffer);
                const metadata = JSON.stringify({
                    name: s.name,
                    id: s.id,
                    team: (s as any).team,
                    selected_by_percent: s.selected_by_percent,
                    ctx_was_home: s.ctx_was_home,
                    ctx_opponent: s.ctx_opponent,
                    ctx_difficulty: s.ctx_difficulty,
                    ctx_price: s.ctx_price,
                    ctx_hours_rest: s.ctx_hours_rest,
                    ctx_ownership: s.ctx_ownership,
                    ctx_chance_of_playing: s.ctx_chance_of_playing,
                    ctx_fixture_attack: s.ctx_fixture_attack,
                    ctx_fixture_defense: s.ctx_fixture_defense,
                    agg_r4: s.agg_r4,
                    agg_r10: s.agg_r10
                });

                insertStmt.run(
                    s.id,
                    s.gw,
                    s.season,
                    pos,
                    s.is_future ? 1 : 0,
                    s.target_class,
                    buffer,
                    metadata
                );
            }
        }
    });

    // We need to use the output of the second pass mappings
    const allDatasets: Record<string, ProcessedSample[]> = {};
    for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
        const p = path.join(OUTPUT_DIR, `dataset_${pos}.json`);
        if (fs.existsSync(p)) {
            allDatasets[pos] = JSON.parse(fs.readFileSync(p, 'utf-8'));
        }
    }

    insertMany(allDatasets);
    console.log(`Successfully stored all samples in SQLite.`);
}

main();
