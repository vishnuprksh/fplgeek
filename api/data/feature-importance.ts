import { cacheHeaders, sendJson } from '../../lib/http';
import { jsonColumn, requireGet, table, withErrors, type Handler } from '../_helpers';

const handler: Handler = withErrors(async (req, res) => {
  if (!requireGet(req, res)) return;
  const rows = await import('../../lib/databricks').then(({ executeQuery }) => executeQuery(`SELECT feature_name, importance, updated_at FROM ${table('feature_importance')} ORDER BY importance DESC LIMIT 100`));
  const data = rows.map(row => ({ feature: row.feature_name, importance: Number(row.importance || 0) }));
  sendJson(res, 200, { data, generatedAt: rows[0]?.updated_at || new Date().toISOString() }, cacheHeaders(3600));
});
export default handler;
