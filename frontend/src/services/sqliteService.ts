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
            // Use API endpoint for database file (works in both dev and production)
            const DATA_URL = '/ai-api/api/data/fpl.sqlite';
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

            // 3. Merge history into players, deduplicating by kickoff_time
            // Both the historical ingestion (negative fixture_ids) and the FPL API fetch
            // (positive fixture_ids) insert entries for the same current-season matches,
            // causing duplicate rows per round. Dedup by kickoff_time keeps only one per match.
            players.forEach(p => {
                const rawHistory = historyMap.get(p.id) || [];
                const seen = new Set<string>();
                p.history = rawHistory.filter(item => {
                    const key = item.kickoff_time || String(item.fixture_id ?? Math.random());
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
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
            // Teams are stored as one row per team (id = team id), not a single
            // 'teams' key row. Query all rows; throw if empty so the hybrid
            // provider falls back to the FPL API instead of returning no data.
            if (!this.db) throw new Error("Database not initialized");
            const teams = this.querySingle<Team>("SELECT data FROM teams");
            if (teams.length === 0) throw new Error("No teams found in SQLite database");
            return teams;
        } catch (error) {
            console.warn("SQLite getTeams failed, this will fall back in dataFactory", error);
            throw error;
        }
    }

    async getEvents(): Promise<Event[]> {
        try {
            await this.ensureInitialized();
            // Events are stored as one row per event (id = event id).
            if (!this.db) throw new Error("Database not initialized");
            const events = this.querySingle<Event>("SELECT data FROM events");
            if (events.length === 0) throw new Error("No events found in SQLite database");
            return events;
        } catch (error) {
            console.warn("SQLite getEvents failed, this will fall back in dataFactory", error);
            throw error;
        }
    }

    async getElementTypes(): Promise<ElementType[]> {
        try {
            await this.ensureInitialized();
            // Element types are stored as one row per type (id = type id).
            if (!this.db) throw new Error("Database not initialized");
            const elementTypes = this.querySingle<ElementType>("SELECT data FROM element_types");
            if (elementTypes.length === 0) throw new Error("No element_types found in SQLite database");
            return elementTypes;
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

    async getBacktestHistory(): Promise<any[]> {
        // Attempt to fetch generated JSON backtest first from API
        try {
            const response = await fetch('/ai-api/api/data/backtest_results.json');
            if (response.ok) {
                const data = await response.json();
                console.log("Loaded backtest results from API");
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
