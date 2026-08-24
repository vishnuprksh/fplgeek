/**
 * Public HTTP contracts shared by the Vercel functions.
 *
 * Keep these types free of Databricks/FPL SDK implementation details. The
 * `data` envelope is intentional: it gives clients one predictable place to
 * read the payload while metadata remains available alongside it.
 */

export interface ApiErrorResponse {
  error: string;
}

export interface ApiResponse<T> {
  data: T;
  generatedAt: string;
}

export interface PaginatedApiResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Prediction {
  id: number;
  name: string;
  team: number;
  position: string;
  total3Week: number;
  prob_gt_6: number;
  prob_gt_10: number;
  prob_gt_6_next: number;
  prob_gt_10_next: number;
  f_atk_next: number;
  f_def_next: number;
  projections: unknown[];
  [key: string]: unknown;
}

export interface LeagueAnalysisEntry {
  position: string;
  total_players: number;
  top_10: unknown[];
  avg_total3Week: number;
  avg_prob_gt_6: number;
}

export interface FeatureImportanceEntry {
  feature: string;
  importance: number;
}

export interface GameweekContext {
  currentGW: number;
  nextPlayGW: number;
  blankGWs: number[];
  timestamp: string;
}

export interface TrainingDataRow {
  gw: number;
  season: string;
  target: number;
  [key: string]: unknown;
}

export interface FplUpdateMetadata {
  generatedAt: string;
}

export interface UpdateStatus {
  isUpdating: boolean;
  status: string;
  lastUpdateTime: string | null;
  dataExists: boolean;
}