import type { IDataProvider } from './dataProvider';
import type { BootstrapStatic, Team, Event, ElementType, UnifiedPlayer } from '../types/fpl';
import { apiGet } from './apiClient';

// Fallback provider that fetches from FPL API directly
class FplApiProvider implements IDataProvider {
    async getBootstrapStatic(): Promise<BootstrapStatic> {
        return apiGet<BootstrapStatic>('/api/fpl/bootstrap-static');
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
            return await apiGet<any[]>('/api/data/predictions');
        } catch (e) {
            console.warn('Failed to fetch predictions from API', e);
        }
        return [];
    }

}

const fplApiProvider = new FplApiProvider();

export function getDataProvider(): IDataProvider {
    return fplApiProvider;
}
