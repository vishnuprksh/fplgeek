import { cacheHeaders, sendJson } from '../../lib/http';
import type { ApiResponse, Prediction } from '../../lib/api-contracts';
import { jsonColumn, requireGet, table, withErrors, type Handler } from '../_helpers';

const handler: Handler = withErrors(async (req, res) => {
  if (!requireGet(req, res)) return;
  const rows = await import('../../lib/databricks').then(({ executeQuery }) => executeQuery(`SELECT player_id, name, team, position, total_3week, prob_gt_6, prob_gt_10, prob_gt_6_next, prob_gt_10_next, f_atk_next, f_def_next, projections, r6_stats, updated_at FROM ${table('predictions')} ORDER BY total_3week DESC LIMIT 5000`));
  const data: Prediction[] = rows.map(row => ({ id: Number(row.player_id), name: String(row.name || ''), team: Number(row.team), position: String(row.position || ''), total3Week: Number(row.total_3week || 0), prob_gt_6: Number(row.prob_gt_6 || 0), prob_gt_10: Number(row.prob_gt_10 || 0), prob_gt_6_next: Number(row.prob_gt_6_next || 0), prob_gt_10_next: Number(row.prob_gt_10_next || 0), f_atk_next: Number(row.f_atk_next || 0), f_def_next: Number(row.f_def_next || 0), projections: (jsonColumn(row.projections) as unknown[]) || [], ...(jsonColumn(row.r6_stats) as object || {}) }));
  const response: ApiResponse<Prediction[]> = { data, generatedAt: String(rows[0]?.updated_at || new Date().toISOString()) };
  sendJson(res, 200, response, cacheHeaders(600));
});
export default handler;
