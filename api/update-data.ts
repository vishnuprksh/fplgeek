import type { ServerResponse } from 'node:http';
import { getQueryValue, sendJson, type ApiRequest } from '../lib/http';
import { withErrors, type Handler } from './_helpers';

const handler: Handler = withErrors(async (req: ApiRequest, res: ServerResponse) => {
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' }); return; }
  const configured = process.env.UPDATE_ADMIN_SECRET;
  const supplied = req.headers['x-update-admin-secret'];
  if (!configured || supplied !== configured) { sendJson(res, 401, { error: 'Unauthorized' }); return; }
  // Refresh execution is intentionally not started by a Vercel function. Schedule a Databricks Job separately.
  sendJson(res, 501, { error: 'Data refresh is managed by the scheduled Databricks Job.' });
});
export default handler;
