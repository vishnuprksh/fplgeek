import { apiGet } from './apiClient';
import type { PredictionMetadata } from '../types/gameweek';
import type { TrainingDataRow } from '../../../lib/api-contracts';

export interface Prediction { id: number; name: string; team: number; position: string; total3Week: number; prob_gt_6: number; prob_gt_10: number; projections: Array<{ xP?: number; prob_gt_6?: number }>; [key: string]: unknown; }
export interface LeagueAnalysisEntry { position: string; total_players: number; top_10: Array<{ id?: number; name?: string; percent?: number; effective_ownership?: number }>; }

export const dataApi = {
    getPredictions: () => apiGet<Prediction[]>('/api/data/predictions'),
    getGameweekContext: () => apiGet<PredictionMetadata>('/api/data/gameweek-context'),
    getLeagueAnalysis: () => apiGet<LeagueAnalysisEntry[]>('/api/data/league-analysis'),
    getTrainingData: (params: URLSearchParams) => apiGet<{ data: TrainingDataRow[]; total: number; page: number; pageSize: number; totalPages: number }>(`/api/data/training-data?${params}`),
};