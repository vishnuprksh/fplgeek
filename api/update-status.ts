import { cacheHeaders, sendJson } from '../lib/http';
import type { ApiResponse, UpdateStatus } from '../lib/api-contracts';
import { requireGet, table, withErrors, type Handler } from './_helpers';

const handler: Handler = withErrors(async (req, res) => {
  if (!requireGet(req, res)) return;
  const { executeQuery } = await import('../lib/databricks');
  const rows = await executeQuery(`SELECT MAX(updated_at) AS last_update FROM ${table('predictions')}`);
  const data: UpdateStatus = { isUpdating: false, status: 'idle', lastUpdateTime: rows[0]?.last_update ? String(rows[0].last_update) : null, dataExists: rows.length > 0 && rows[0]?.last_update !== null };
  const response: ApiResponse<UpdateStatus> = { data, generatedAt: new Date().toISOString() };
  sendJson(res, 200, response, cacheHeaders(300));
});
export default handler;
