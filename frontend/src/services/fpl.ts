import type { TeamEntry, BootstrapStatic, TeamPicks, Match } from '../types/fpl';

import { getDataProvider } from './dataFactory';
import { apiGet } from './apiClient';

const API_BASE = '/api/fpl';

export const fplService = {
    async getTeamDetails(teamId: number): Promise<TeamEntry> {
        try {
            return await apiGet<TeamEntry>(`${API_BASE}/entry/${teamId}`);
        } catch (error) {
            console.error('Error fetching team details:', error);
            throw error;
        }
    },

    async getBootstrapStatic(): Promise<BootstrapStatic> {
        try {
            const data = await getDataProvider().getBootstrapStatic();
            if (!data || !data.elements || data.elements.length === 0) {
                throw new Error('Invalid bootstrap data');
            }
            return data;
        } catch (error) {
            console.warn('Failed to get bootstrap static from data provider, trying direct FPL API:', error);
            try {
                return await apiGet<BootstrapStatic>(`${API_BASE}/bootstrap-static`);
            } catch (fallbackError) {
                console.error('Fallback FPL API also failed:', fallbackError);
                throw fallbackError;
            }
        }
    },

    async getTeamPicks(teamId: number, eventId: number): Promise<TeamPicks> {
        try {
            return await apiGet<TeamPicks>(`${API_BASE}/entry/${teamId}/event/${eventId}/picks`);
        } catch (error) {
            console.error('Error fetching team picks:', error);
            throw error;
        }
    },

    async getFixtures(): Promise<Match[]> {
        try {
            return await apiGet<Match[]>(`${API_BASE}/fixtures`);
        } catch (error) {
            console.error('Error fetching fixtures:', error);
            throw error;
        }
    },

    async getPlayerSummary(elementId: number): Promise<any> { // Using any loosely here, but ideally PlayerSummary
        try {
            return await apiGet(`${API_BASE}/element-summary/${elementId}`);
        } catch (error) {
            console.error('Error fetching player summary:', error);
            throw error;
        }
    },

    async getTransfers(teamId: number): Promise<any[]> {
        try {
            return await apiGet<any[]>(`${API_BASE}/entry/${teamId}/transfers`);
        } catch (error) {
            console.error('Error fetching transfers:', error);
            return [];
        }
    }
};
