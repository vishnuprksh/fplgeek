import type { Team, Event, ElementType, Match } from '../types';

export interface ILogger {
    info(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
}

export interface IDatabaseRepository {
    batchWritePlayers(players: any[]): Promise<void>;
    saveStaticData(teams: Team[], events: Event[], elementTypes: ElementType[]): Promise<void>;
    savePlayerHistory(playerId: number, history: any[]): Promise<void>;
    saveFixtures(fixtures: Match[]): Promise<void>;
}
