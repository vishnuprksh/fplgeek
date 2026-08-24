import { cacheHeaders, sendJson } from '../../lib/http';
import { jsonColumn, requireGet, table, withErrors, type Handler } from '../_helpers';

const handler: Handler = withErrors(async (req, res) => {
  if (!requireGet(req, res)) return;
  const rows = await import('../../lib/databricks').then(({ executeQuery }) => executeQuery(`SELECT position, total_players, top_10, avg_total3week, avg_prob_gt_6, updated_at FROM ${table('league_analysis')} ORDER BY position LIMIT 10`));
  const history = rows.map(row => ({ position: row.position, total_players: Number(row.total_players || 0), top_10: jsonColumn(row.top_10) || [], avg_total3Week: Number(row.avg_total3week || 0), avg_prob_gt_6: Number(row.avg_prob_gt_6 || 0) }));
  sendJson(res, 200, { data: history, generatedAt: rows[0]?.updated_at || new Date().toISOString() }, cacheHeaders(3600));
});
export default handler;
