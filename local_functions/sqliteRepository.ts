import { IDatabaseRepository } from "../functions/src/db/repository";
import { Team, Event, ElementType } from "../functions/src/types";
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

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

    async savePlayerHistory(playerId: number, history: any[]): Promise<void> {
        const insert = this.db.prepare('INSERT OR REPLACE INTO player_history (player_id, fixture_id, data) VALUES (@player_id, @fixture_id, @data)');
        const insertMany = this.db.transaction((hist: any[]) => {
            for (const h of hist) {
                insert.run({
                    player_id: playerId,
                    fixture_id: h.fixture,
                    data: JSON.stringify(h)
                });
            }
        });
        insertMany(history);
    }
}
