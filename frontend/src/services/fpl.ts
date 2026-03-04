import type { TeamEntry, BootstrapStatic, TeamPicks, Match } from '../types/fpl';

import { getDataProvider } from './dataFactory';

const API_BASE = '/api'; // Uses the Vite proxy (or Firebase Rewrite)

export const fplService = {
    async getTeamDetails(teamId: number): Promise<TeamEntry> {
        try {
            const response = await fetch(`${API_BASE}/entry/${teamId}/`);
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
        return await getDataProvider().getBootstrapStatic();
    },

    async getTeamPicks(teamId: number, eventId: number): Promise<TeamPicks> {
        try {
            const response = await fetch(`${API_BASE}/entry/${teamId}/event/${eventId}/picks/`);
            if (!response.ok) throw new Error('Failed to fetch team picks');
            return await response.json();
        } catch (error) {
            console.error('Error fetching team picks:', error);
            throw error;
        }
    },

    async getFixtures(): Promise<Match[]> {
        try {
            const response = await fetch(`${API_BASE}/fixtures/`);
            if (!response.ok) throw new Error('Failed to fetch fixtures');
            return await response.json();
        } catch (error) {
            console.error('Error fetching fixtures:', error);
            throw error;
        }
    },

    async getPlayerSummary(elementId: number): Promise<any> { // Using any loosely here, but ideally PlayerSummary
        try {
            const response = await fetch(`${API_BASE}/element-summary/${elementId}/`);
            if (!response.ok) throw new Error(`Failed to fetch player summary for ${elementId}`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching player summary:', error);
            throw error;
        }
    },

    async getTransfers(teamId: number): Promise<any[]> {
        try {
            const response = await fetch(`${API_BASE}/entry/${teamId}/transfers/`);
            if (!response.ok) throw new Error('Failed to fetch transfers');
            return await response.json();
        } catch (error) {
            console.error('Error fetching transfers:', error);
            return [];
        }
    }
};
