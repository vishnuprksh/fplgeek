
import { Team, Event, ElementType } from "../types.js";

export interface IDatabaseRepository {
    saveFixtures(fixtures: any[]): Promise<void>;
    batchWritePlayers(players: any[]): Promise<void>;
    saveStaticData(teams: Team[], events: Event[], elementTypes: ElementType[]): Promise<void>;
    savePlayerHistory(playerId: number, history: any[], historyPast?: any[]): Promise<void>;
}
