import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type { IDataProvider } from './dataProvider';
import type { BootstrapStatic, Team, Event, ElementType, UnifiedPlayer } from '../types/fpl';

export class SqliteProvider implements IDataProvider {
    private db: Database | null = null;
    private initPromise: Promise<void> | null = null;
    private initFailed: boolean = false;

    private async ensureInitialized(): Promise<void> {
        if (this.db) return;
        if (this.initFailed) return; // Don't retry if initialization failed
        if (!this.initPromise) {
            this.initPromise = this.initialize();
        }
        await this.initPromise;
    }

    private async initialize(): Promise<void> {
        try {
            console.log("Initializing SQL.js...");
            const SQL: SqlJsStatic = await initSqlJs({
                // Locate the WASM file in the public folder
                locateFile: file => `/${file}`
            });

            console.log("Fetching fpl.sqlite...");
            const DATA_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/data/fpl.sqlite` : '/data/fpl.sqlite';
            const response = await fetch(DATA_URL);
            if (!response.ok) {
                throw new Error(`Failed to fetch database: ${response.statusText}`);
            }
            const buffer = await response.arrayBuffer();
            this.db = new SQL.Database(new Uint8Array(buffer));
            console.log("Database initialized");
        } catch (error) {
            console.error("Failed to initialize local database:", error);
            this.initFailed = true;
            throw error;
        }
    }

    private querySingle<T>(sql: string): T[] {
        if (!this.db) throw new Error("Database not initialized");
        const stmt = this.db.prepare(sql);
        const result: T[] = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            if (row.data && typeof row.data === 'string') {
                result.push(JSON.parse(row.data) as T);
            }
        }
        stmt.free();
        return result;
    }

    async getPlayers(): Promise<UnifiedPlayer[]> {
        try {
            await this.ensureInitialized();
            if (!this.db) throw new Error("Database not initialized");

            // 1. Fetch all basic player data
            const players = this.querySingle<UnifiedPlayer>("SELECT data FROM players");

            // 2. Fetch all history data
            // We select key fields to map them back
            const stmt = this.db.prepare("SELECT player_id, data FROM player_history");
            const historyMap = new Map<number, any[]>();

            while (stmt.step()) {
                const row = stmt.getAsObject();
                if (row.data && typeof row.data === 'string' && typeof row.player_id === 'number') {
                    const playerId = row.player_id;
                    const historyItem = JSON.parse(row.data);

                    if (!historyMap.has(playerId)) {
                        historyMap.set(playerId, []);
                    }
                    historyMap.get(playerId)?.push(historyItem);
                }
            }
            stmt.free();

            // 3. Merge history into players
            players.forEach(p => {
                p.history = historyMap.get(p.id) || [];
            });

            return players;
        } catch (error) {
            console.warn("SQLite getPlayers failed, this will fall back in dataFactory", error);
            throw error;
        }
    }

    async getTeams(): Promise<Team[]> {
        try {
            await this.ensureInitialized();
            // The table structure stores teams as a single array in 'teams' key if using same structure as firestore?
            // Wait, SqliteRepository saves 'teams' as ID 'teams' and data JSON string of ARRAY?
            // Let's check SqliteRepository.saveStaticData
            // insertTeam.run('teams', JSON.stringify(teams));
            // So ID='teams', data='[...]'

            if (!this.db) throw new Error("Database not initialized");
            const stmt = this.db.prepare("SELECT data FROM teams WHERE id = 'teams'");
            if (stmt.step()) {
                const row = stmt.getAsObject();
                return JSON.parse(row.data as string) as Team[];
            }
            return [];
        } catch (error) {
            console.warn("SQLite getTeams failed, this will fall back in dataFactory", error);
            throw error;
        }
    }

    async getEvents(): Promise<Event[]> {
        try {
            await this.ensureInitialized();
            if (!this.db) throw new Error("Database not initialized");
            const stmt = this.db.prepare("SELECT data FROM events WHERE id = 'events'");
            if (stmt.step()) {
                const row = stmt.getAsObject();
                return JSON.parse(row.data as string) as Event[];
            }
            return [];
        } catch (error) {
            console.warn("SQLite getEvents failed, this will fall back in dataFactory", error);
            throw error;
        }
    }

    async getElementTypes(): Promise<ElementType[]> {
        try {
            await this.ensureInitialized();
            if (!this.db) throw new Error("Database not initialized");
            const stmt = this.db.prepare("SELECT data FROM element_types WHERE id = 'element_types'");
            if (stmt.step()) {
                const row = stmt.getAsObject();
                return JSON.parse(row.data as string) as ElementType[];
            }
            return [];
        } catch (error) {
            console.warn("SQLite getElementTypes failed, this will fall back in dataFactory", error);
            throw error;
        }
    }

    async getBootstrapStatic(): Promise<BootstrapStatic> {
        const [elements, teams, events, element_types] = await Promise.all([
            this.getPlayers(),
            this.getTeams(),
            this.getEvents(),
            this.getElementTypes()
        ]);

        return {
            elements,
            teams,
            events,
            element_types
        };
    }

    async getPredictions(): Promise<any[]> {
        // Attempt to fetch generated JSON predictions first
        try {
            const response = await fetch(`/data/ai_predictions.json?t=${Date.now()}`);
            if (response.ok) {
                const data = await response.json();
                console.log("Loaded predictions from JSON file");
                return data;
            }
        } catch (e) {
            console.warn("Failed to fetch ai_predictions.json", e);
        }

        await this.ensureInitialized();
        if (!this.db) throw new Error("Database not initialized");

        try {
            const result = this.querySingle<any>("SELECT data FROM predictions");
            return result;
        } catch (e) {
            console.warn("Predictions table not found or empty", e);
            return [];
        }
    }

    async getBacktestHistory(): Promise<any[]> {
        // Attempt to fetch generated JSON backtest first
        try {
            const response = await fetch('/data/backtest_results.json');
            if (response.ok) {
                const data = await response.json();
                console.log("Loaded backtest results from JSON file");
                return data;
            }
        } catch (e) {
            console.warn("Failed to fetch backtest_results.json", e);
        }

        await this.ensureInitialized();
        if (!this.db) throw new Error("Database not initialized");

        try {
            const result = this.querySingle<any>("SELECT data FROM backtest_results ORDER BY gameweek DESC");
            return result;
        } catch (e) {
            console.warn("Backtest results table not found or empty", e);
            return [];
        }
    }
}

export const sqliteProvider = new SqliteProvider();
