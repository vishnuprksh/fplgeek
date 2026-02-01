
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const DB_PATH = path.resolve(process.cwd(), "public/data/fpl.sqlite");

interface SeasonConfig {
    name: string;
    url: string;
    fixtureStartId: number;
}

const SEASONS: SeasonConfig[] = [
    {
        name: '2023/24',
        url: "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2023-24/gws/merged_gw.csv",
        fixtureStartId: 2023000
    },
    {
        name: '2024/25',
        url: "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2024-25/gws/merged_gw.csv",
        fixtureStartId: 2024000
    }
];

async function fetchCsv(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch CSV: ${response.statusText}`);
    return await response.text();
}

function normalizeName(name: string): string {
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function ingestHistorical() {
    console.log("Starting historical data ingestion...");

    // 1. Load DB and Players
    const db = new Database(DB_PATH);
    const players = db.prepare("SELECT id, data FROM players").all();

    const playerMap = new Map<string, number>(); // Normalized Name -> ID

    players.forEach((p: any) => {
        const data = JSON.parse(p.data);
        const firstName = normalizeName(data.first_name);
        const secondName = normalizeName(data.second_name);
        const webName = normalizeName(data.web_name);

        const fullName = normalizeName(`${data.first_name} ${data.second_name}`);

        playerMap.set(fullName, p.id);
        playerMap.set(webName, p.id);

        // Also map "First Last" explicitly if different from above (duplicates handled by Map)
        playerMap.set(firstName + secondName, p.id);
    });

    console.log(`Loaded ${players.length} players from DB.`);

    const insertHistory = db.prepare('INSERT OR REPLACE INTO player_history (player_id, fixture_id, data) VALUES (@player_id, @fixture_id, @data)');

    for (const season of SEASONS) {
        console.log(`\nProcessing Season: ${season.name}`);
        console.log(`Fetching CSV from ${season.url}...`);

        try {
            const csvData = await fetchCsv(season.url);
            const records = parse(csvData, {
                columns: true,
                skip_empty_lines: true
            });

            console.log(`Parsed ${records.length} rows.`);

            let matchCount = 0;
            let missCount = 0;
            const missedNames = new Set<string>();

            const tx = db.transaction((rows: any[]) => {
                for (const row of rows) {
                    const name = row.name;
                    let normalized = normalizeName(name);
                    let playerId = playerMap.get(normalized);

                    // Strategy 2: Handle "Name 'Nickname' Surname"
                    if (!playerId && name.includes("'")) {
                        const nicknameMatch = name.match(/'([^']+)'/);
                        if (nicknameMatch) {
                            const nickname = normalizeName(nicknameMatch[1]);
                            playerId = playerMap.get(nickname);
                        }
                    }

                    if (!playerId) {
                        if (!missedNames.has(name) && missedNames.size < 50) {
                            console.warn(`Missed: "${name}" (Normal: ${normalized})`);
                            missedNames.add(name);
                        }
                        missCount++;
                        continue;
                    }

                    // Generate pseudo fixture ID: -1 * (SeasonStartYear * 1000 + gameweek * 100 + matchIndex?)
                    // The CSV has 'fixture' column (integer).
                    const fixtureId = -(season.fixtureStartId + parseInt(row.fixture));

                    // Construct data object matching FPL API structure where possible
                    const historyData = {
                        ...row,
                        season_name: season.name, // Mark explicitly
                        minutes: parseInt(row.minutes),
                        goals_scored: parseInt(row.goals_scored),
                        assists: parseInt(row.assists),
                        clean_sheets: parseInt(row.clean_sheets),
                        goals_conceded: parseInt(row.goals_conceded),
                        own_goals: parseInt(row.own_goals),
                        penalties_saved: parseInt(row.penalties_saved),
                        penalties_missed: parseInt(row.penalties_missed),
                        yellow_cards: parseInt(row.yellow_cards),
                        red_cards: parseInt(row.red_cards),
                        saves: parseInt(row.saves),
                        bonus: parseInt(row.bonus),
                        bps: parseInt(row.bps),
                        total_points: parseInt(row.total_points),
                        value: parseInt(row.value),
                        selected: parseInt(row.selected),
                        transfers_in: parseInt(row.transfers_in),
                        transfers_out: parseInt(row.transfers_out),
                        round: parseInt(row.GW),
                        opponent_team: parseInt(row.opponent_team),
                        was_home: row.was_home === 'True' || row.was_home === 'true',
                        kickoff_time: row.kickoff_time // Ensure kickoff_time is preserved
                    };

                    insertHistory.run({
                        player_id: playerId,
                        fixture_id: fixtureId,
                        data: JSON.stringify(historyData)
                    });
                    matchCount++;
                }
            });

            tx(records);

            console.log(`Season ${season.name} Complete.`);
            console.log(`Matched: ${matchCount}`);
            console.log(`Missed: ${missCount}`);

        } catch (e) {
            console.error(`Failed to process season ${season.name}:`, e);
        }
    }
}

ingestHistorical();
