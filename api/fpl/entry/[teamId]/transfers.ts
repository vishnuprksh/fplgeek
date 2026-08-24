import { fetchFpl } from '../../../../lib/fpl-api';
import { cacheHeaders, sendJson } from '../../../../lib/http';
import { positiveInt } from '../../../../lib/validation';
import { requireGet, queryParam, withErrors, type Handler } from '../../../_helpers';

const handler: Handler = withErrors(async (req, res) => {
  if (!requireGet(req, res)) return;
  const teamId = positiveInt(queryParam(req, 'teamId'), 'teamId', 10_000_000);
  sendJson(res, 200, { data: await fetchFpl(`/entry/${teamId}/transfers/`), generatedAt: new Date().toISOString() }, cacheHeaders(60));
});
export default handler;
