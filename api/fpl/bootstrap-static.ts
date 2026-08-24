import { fetchFpl } from '../../lib/fpl-api';
import type { ApiResponse } from '../../lib/api-contracts';
import { cacheHeaders, sendJson } from '../../lib/http';
import { requireGet, withErrors, type Handler } from '../_helpers';

const handler: Handler = withErrors(async (req, res) => {
  if (!requireGet(req, res)) return;
  const response: ApiResponse<unknown> = { data: await fetchFpl('/bootstrap-static/'), generatedAt: new Date().toISOString() };
  sendJson(res, 200, response, cacheHeaders(600));
});
export default handler;
