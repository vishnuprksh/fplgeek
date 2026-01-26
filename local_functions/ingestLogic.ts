
import { Team, Event, ElementType } from "../functions/src/types";

// Interface ported locally to avoid dependency chains
export interface IDatabaseRepository {
    saveFixtures(fixtures: any[]): Promise<void>;
    batchWritePlayers(players: any[]): Promise<void>;
    saveStaticData(teams: Team[], events: Event[], elementTypes: ElementType[]): Promise<void>;
    savePlayerHistory(playerId: number, history: any[]): Promise<void>;
}

export interface ILogger {
    info(msg: string, ...args: any[]): void;
    error(msg: string, ...args: any[]): void;
    warn(msg: string, ...args: any[]): void;
}

const BASE_URL = 'https://fantasy.premierleague.com/api';

async function fetchJson(url: string) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    });
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    return await response.json();
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function ingestData(repo: IDatabaseRepository, logger: ILogger) {
    logger.info("Starting Data Ingestion...");

    try {
        const staticData = await fetchJson(`${BASE_URL}/bootstrap-static/`);
        const players = staticData.elements;

        // 1. Ingest Players (Batch write)
        logger.info(`Ingesting ${players.length} players...`);
        await repo.batchWritePlayers(players);
        logger.info("Player ingestion complete.");

        // 1.5 Ingest Static Data (Teams, Events, Types)
        logger.info("Ingesting static metadata (Teams, Events, Types)...");
        await repo.saveStaticData(staticData.teams, staticData.events, staticData.element_types);
        logger.info("Static metadata ingestion complete.");

        // 1.6 Ingest Fixtures
        logger.info("Ingesting fixtures...");
        const fixtures = await fetchJson(`${BASE_URL}/fixtures/`);
        await repo.saveFixtures(fixtures);
        logger.info("Fixture ingestion complete.");

        // 2. Ingest History for active players
        const activePlayers = players.filter((p: any) => p.minutes > 0 || parseFloat(p.selected_by_percent) > 0.5);
        logger.info(`Ingesting history for ${activePlayers.length} active players...`);

        // Process in chunks to avoid timeouts/rate limits
        for (let i = 0; i < activePlayers.length; i++) {
            const player = activePlayers[i];
            try {
                const summary = await fetchJson(`${BASE_URL}/element-summary/${player.id}/`);
                const history = summary.history;

                await repo.savePlayerHistory(player.id, history);

                if (i % 10 === 0) logger.info(`Processed ${i} / ${activePlayers.length} player histories.`);
                await sleep(50); // Be nice to the API
            } catch (e) {
                logger.error(`Error fetching history for ${player.web_name} (${player.id}):`, e);
            }
        }

        logger.info("Data Ingestion Complete.");
    } catch (error) {
        logger.error("Ingest failed", error);
        throw error;
    }
}
