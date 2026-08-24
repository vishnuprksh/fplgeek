import { fetchFpl } from '../../../lib/fpl-api';
import type { ApiResponse } from '../../../lib/api-contracts';
import { cacheHeaders, sendJson } from '../../../lib/http';
import { positiveInt } from '../../../lib/validation';
import { requireGet, queryParam, withErrors, type Handler } from '../../_helpers';

const handler: Handler = withErrors(async (req, res) => {
  if (!requireGet(req, res)) return;
  const elementId = positiveInt(queryParam(req, 'elementId'), 'elementId', 10_000);
  const response: ApiResponse<unknown> = { data: await fetchFpl(`/element-summary/${elementId}/`), generatedAt: new Date().toISOString() };
  sendJson(res, 200, response, cacheHeaders(300));
});
export default handler;
