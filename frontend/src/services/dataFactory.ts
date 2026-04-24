import { sqliteProvider } from './sqliteService';
import type { IDataProvider } from './dataProvider';
import type { BootstrapStatic, Team, Event, ElementType, UnifiedPlayer } from '../types/fpl';

// Fallback provider that fetches from FPL API directly
class FplApiProvider implements IDataProvider {
    async getBootstrapStatic(): Promise<BootstrapStatic> {
        const response = await fetch('/api/bootstrap-static/');
        if (!response.ok) throw new Error('Failed to fetch bootstrap data');
        return response.json();
    }

    async getPlayers(): Promise<UnifiedPlayer[]> {
        const bootstrap = await this.getBootstrapStatic();
        return bootstrap.elements;
    }

    async getTeams(): Promise<Team[]> {
        const bootstrap = await this.getBootstrapStatic();
        return bootstrap.teams;
    }

    async getEvents(): Promise<Event[]> {
        const bootstrap = await this.getBootstrapStatic();
        return bootstrap.events;
    }

    async getElementTypes(): Promise<ElementType[]> {
        const bootstrap = await this.getBootstrapStatic();
        return bootstrap.element_types;
    }

    async getPredictions(): Promise<any[]> {
        try {
            // Fetch from backend API data endpoint (not static files)
            const response = await fetch('/ai-api/api/data/predictions');
            if (response.ok) return response.json();
        } catch (e) {
            console.warn('Failed to fetch predictions from API', e);
        }
        return [];
    }

    async getBacktestHistory(): Promise<any[]> {
        try {
            const response = await fetch('/ai-api/api/data/:filename');
            if (response.ok) return response.json();
        } catch (e) {
            console.warn('Failed to fetch backtest results', e);
        }
        return [];
    }
}

const fplApiProvider = new FplApiProvider();

// Wrapper provider that tries SQLite first, then falls back to FPL API
class HybridDataProvider implements IDataProvider {
    async getBootstrapStatic(): Promise<BootstrapStatic> {
        try {
            return await sqliteProvider.getBootstrapStatic();
        } catch (error) {
            console.warn('SQLite provider failed for getBootstrapStatic, falling back to FPL API:', error);
            return await fplApiProvider.getBootstrapStatic();
        }
    }

    async getPlayers(): Promise<UnifiedPlayer[]> {
        try {
            return await sqliteProvider.getPlayers();
        } catch (error) {
            console.warn('SQLite provider failed for getPlayers, falling back to FPL API:', error);
            return await fplApiProvider.getPlayers();
        }
    }

    async getTeams(): Promise<Team[]> {
        try {
            return await sqliteProvider.getTeams();
        } catch (error) {
            console.warn('SQLite provider failed for getTeams, falling back to FPL API:', error);
            return await fplApiProvider.getTeams();
        }
    }

    async getEvents(): Promise<Event[]> {
        try {
            return await sqliteProvider.getEvents();
        } catch (error) {
            console.warn('SQLite provider failed for getEvents, falling back to FPL API:', error);
            return await fplApiProvider.getEvents();
        }
    }

    async getElementTypes(): Promise<ElementType[]> {
        try {
            return await sqliteProvider.getElementTypes();
        } catch (error) {
            console.warn('SQLite provider failed for getElementTypes, falling back to FPL API:', error);
            return await fplApiProvider.getElementTypes();
        }
    }

    async getPredictions(): Promise<any[]> {
        // Predictions come from FPL API provider (backend /api/data/predictions endpoint)
        return await fplApiProvider.getPredictions();
    }

    async getBacktestHistory(): Promise<any[]> {
        try {
            return await sqliteProvider.getBacktestHistory();
        } catch (error) {
            console.warn('SQLite provider failed for getBacktestHistory, falling back to FPL API:', error);
            return await fplApiProvider.getBacktestHistory();
        }
    }
}

const hybridProvider = new HybridDataProvider();

export function getDataProvider(): IDataProvider {
    console.log("Using Hybrid Data Provider (SQLite with FPL API fallback)");
    return hybridProvider;
}
