import type { TeamEntry, BootstrapStatic, TeamPicks, Match } from '../types/fpl';

const API_BASE = '/api';

export const fplService = {
    async getTeamDetails(teamId: number): Promise<TeamEntry> {
        try {
            const response = await fetch(`${API_BASE}/fpl/entry/${teamId}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch team details: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching team details:', error);
            throw error;
        }
    },

    async getBootstrapStatic(): Promise<BootstrapStatic> {
        // Prefer the Neon-backed serverless route; fall back to the live FPL proxy.
        try {
            const response = await fetch(`${API_BASE}/data/bootstrap-static`);
            if (!response.ok) throw new Error(`Failed to fetch bootstrap static: ${response.statusText}`);
            const data: BootstrapStatic = await response.json();
            if (!data || !data.elements || data.elements.length === 0) {
                throw new Error('Invalid bootstrap data');
            }
            return data;
        } catch (error) {
            console.warn('Failed to get bootstrap static from Neon data, trying live FPL API:', error);
            try {
                const response = await fetch(`${API_BASE}/fpl/bootstrap-static`);
                if (!response.ok) throw new Error(`Failed to fetch from FPL API: ${response.statusText}`);
                return await response.json();
            } catch (fallbackError) {
                console.error('Fallback FPL API also failed:', fallbackError);
                throw fallbackError;
            }
        }
    },

    async getTeamPicks(teamId: number, eventId: number): Promise<TeamPicks> {
        try {
            const response = await fetch(`${API_BASE}/fpl/entry/${teamId}/event/${eventId}/picks`);
            if (!response.ok) throw new Error('Failed to fetch team picks');
            return await response.json();
        } catch (error) {
            console.error('Error fetching team picks:', error);
            throw error;
        }
    },

    async getFixtures(): Promise<Match[]> {
        try {
            const response = await fetch(`${API_BASE}/data/fixtures`);
            if (!response.ok) throw new Error('Failed to fetch fixtures');
            return await response.json();
        } catch (error) {
            console.error('Error fetching fixtures:', error);
            throw error;
        }
    },

    async getPlayerSummary(elementId: number): Promise<Record<string, unknown>> {
        try {
            const response = await fetch(`${API_BASE}/fpl/element-summary/${elementId}`);
            if (!response.ok) throw new Error(`Failed to fetch player summary for ${elementId}`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching player summary:', error);
            throw error;
        }
    },

    async getTransfers(teamId: number): Promise<Array<Record<string, unknown>>> {
        try {
            const response = await fetch(`${API_BASE}/fpl/entry/${teamId}/transfers`);
            if (!response.ok) throw new Error('Failed to fetch transfers');
            return await response.json();
        } catch (error) {
            console.error('Error fetching transfers:', error);
            return [];
        }
    }
};
