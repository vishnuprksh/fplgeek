import type { BootstrapStatic, Team, Event, ElementType, UnifiedPlayer } from '../types/fpl';

export interface IDataProvider {
    getPlayers(): Promise<UnifiedPlayer[]>;
    getTeams(): Promise<Team[]>;
    getEvents(): Promise<Event[]>;
    getElementTypes(): Promise<ElementType[]>;
    getBootstrapStatic(): Promise<BootstrapStatic>;
    getPredictions(): Promise<any[]>;
    getBacktestHistory(): Promise<any[]>;
}
