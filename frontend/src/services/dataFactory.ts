import type { IDataProvider } from './dataProvider';
import type { BootstrapStatic, Event, ElementType, Team, UnifiedPlayer } from '../types/fpl';

async function request<T>(path: string): Promise<T> {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Request failed (${response.status}) for ${path}`);
    return response.json() as Promise<T>;
}

class ApiDataProvider implements IDataProvider {
    getBootstrapStatic(): Promise<BootstrapStatic> {
        return request<BootstrapStatic>('/api/data/bootstrap-static');
    }

    async getPlayers(): Promise<UnifiedPlayer[]> {
        return (await this.getBootstrapStatic()).elements;
    }

    async getTeams(): Promise<Team[]> {
        return (await this.getBootstrapStatic()).teams;
    }

    async getEvents(): Promise<Event[]> {
        return (await this.getBootstrapStatic()).events;
    }

    async getElementTypes(): Promise<ElementType[]> {
        return (await this.getBootstrapStatic()).element_types;
    }

    getPredictions(): Promise<unknown[]> {
        return request<unknown[]>('/api/data/predictions');
    }

    getBacktestHistory(): Promise<unknown[]> {
        return request<unknown[]>('/api/data/backtest-results');
    }
}

const apiProvider = new ApiDataProvider();

export function getDataProvider(): IDataProvider {
    return apiProvider;
}
