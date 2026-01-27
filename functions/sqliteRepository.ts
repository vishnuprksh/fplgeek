import { IDatabaseRepository } from "./src/db/repository.js";
import { Team, Event, ElementType } from "./src/types.js";
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);
const Database = _require('better-sqlite3');

export class SqliteRepository implements IDatabaseRepository {
    private db: any; // Type as any for now to avoid extensive type definitions for better-sqlite3 in this context

    constructor(dbPath: string) {
        this.db = new Database(dbPath);
        this.initialize();
    }

    private initialize() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY,
                data TEXT
            );
            CREATE TABLE IF NOT EXISTS teams (
                id TEXT PRIMARY KEY, 
                data TEXT
            );
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                data TEXT
            );
            CREATE TABLE IF NOT EXISTS element_types (
                id TEXT PRIMARY KEY,
                data TEXT
            );
            CREATE TABLE IF NOT EXISTS fixtures (
                id INTEGER PRIMARY KEY,
                data TEXT
            );
            CREATE TABLE IF NOT EXISTS player_history (
                player_id INTEGER,
                fixture_id INTEGER,
                data TEXT,
                PRIMARY KEY (player_id, fixture_id)
            );
        `);
    }

    async saveFixtures(fixtures: any[]): Promise<void> {
        const insert = this.db.prepare('INSERT OR REPLACE INTO fixtures (id, data) VALUES (@id, @data)');
        const tx = this.db.transaction((fixtures: any[]) => {
            for (const f of fixtures) {
                insert.run({ id: f.id, data: JSON.stringify(f) });
            }
        });
        tx(fixtures);
    }

    async batchWritePlayers(players: any[]): Promise<void> {
        const insert = this.db.prepare('INSERT OR REPLACE INTO players (id, data) VALUES (@id, @data)');
        const insertMany = this.db.transaction((players: any[]) => {
            for (const p of players) {
                insert.run({ id: p.id, data: JSON.stringify(p) });
            }
        });
        insertMany(players);
    }

    async saveStaticData(teams: Team[], events: Event[], elementTypes: ElementType[]): Promise<void> {
        const insertTeam = this.db.prepare('INSERT OR REPLACE INTO teams (id, data) VALUES (?, ?)');
        const insertEvents = this.db.prepare('INSERT OR REPLACE INTO events (id, data) VALUES (?, ?)');
        const insertTypes = this.db.prepare('INSERT OR REPLACE INTO element_types (id, data) VALUES (?, ?)');

        const tx = this.db.transaction(() => {
            insertTeam.run('teams', JSON.stringify(teams));
            insertEvents.run('events', JSON.stringify(events));
            insertTypes.run('element_types', JSON.stringify(elementTypes));
        });
        tx();
    }

    async savePlayerHistory(playerId: number, history: any[], historyPast: any[] = []): Promise<void> {
        const insert = this.db.prepare('INSERT OR REPLACE INTO player_history (player_id, fixture_id, data) VALUES (@player_id, @fixture_id, @data)');
        const insertMany = this.db.transaction((hist: any[], histPast: any[]) => {
            for (const h of hist) {
                insert.run({
                    player_id: playerId,
                    fixture_id: h.fixture,
                    data: JSON.stringify(h)
                });
            }
            if (histPast && histPast.length > 0) {
                for (const h of histPast) {
                    // For past history, we use a negative fixture_id to avoid collision
                    // or just use 0 if it's summary? 
                    // FPL element-summary history_past has season id but no fixture id.
                    // We can use a hash of season_name or similar.
                    // Let's use negative numbers based on some index or just dummy IDs.
                    // Better: use season name as part of the data.
                    insert.run({
                        player_id: playerId,
                        fixture_id: -h.season_name.split('/')[0], // e.g. -2024 for 2024/25
                        data: JSON.stringify({ ...h, season: h.season_name })
                    });
                }
            }
        });
        insertMany(history, historyPast);
    }
}
