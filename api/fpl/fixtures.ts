import { fetchFpl } from '../../lib/fpl-api';
import { cacheHeaders, sendJson } from '../../lib/http';
import { requireGet, withErrors, type Handler } from '../_helpers';

const handler: Handler = withErrors(async (req, res) => {
  if (!requireGet(req, res)) return;
  sendJson(res, 200, { data: await fetchFpl<unknown[]>('/fixtures/'), generatedAt: new Date().toISOString() }, cacheHeaders(600));
});
export default handler;
