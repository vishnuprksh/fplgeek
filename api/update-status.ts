import { cacheHeaders, sendJson } from '../lib/http';
import { requireGet, table, withErrors, type Handler } from './_helpers';

const handler: Handler = withErrors(async (req, res) => {
  if (!requireGet(req, res)) return;
  const { executeQuery } = await import('../lib/databricks');
  const rows = await executeQuery(`SELECT MAX(updated_at) AS last_update FROM ${table('predictions')}`);
  sendJson(res, 200, { data: { isUpdating: false, status: 'idle', lastUpdateTime: rows[0]?.last_update || null, dataExists: rows.length > 0 && rows[0]?.last_update !== null }, generatedAt: new Date().toISOString() }, cacheHeaders(300));
});
export default handler;
