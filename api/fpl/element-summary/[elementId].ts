import { fetchFpl } from '../../../lib/fpl-api';
import { cacheHeaders, sendJson } from '../../../lib/http';
import { positiveInt } from '../../../lib/validation';
import { requireGet, queryParam, withErrors, type Handler } from '../../_helpers';

const handler: Handler = withErrors(async (req, res) => {
  if (!requireGet(req, res)) return;
  const elementId = positiveInt(queryParam(req, 'elementId'), 'elementId', 10_000);
  sendJson(res, 200, { data: await fetchFpl(`/element-summary/${elementId}/`), generatedAt: new Date().toISOString() }, cacheHeaders(300));
});
export default handler;
