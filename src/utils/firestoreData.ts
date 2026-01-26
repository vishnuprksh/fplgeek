import type { UnifiedPlayer } from '../types/fpl';
import { getDataProvider } from '../services/dataFactory';

/**
 * Fetches all unified player documents.
 * 
 * @returns Promise<UnifiedPlayer[]>
 */
export async function fetchAllUnifiedPlayers(): Promise<UnifiedPlayer[]> {
    try {
        const players = await getDataProvider().getPlayers();

        if (players.length === 0) {
            console.warn("No data found handling unified players.");
        }

        return players;
    } catch (error) {
        console.error("Error fetching unified players:", error);
        throw error;
    }
}

