import { fetchFpl } from '../../../../../../lib/fpl-api';
import type { ApiResponse } from '../../../../../../lib/api-contracts';
import { cacheHeaders, sendJson } from '../../../../../../lib/http';
import { positiveInt } from '../../../../../../lib/validation';
import { requireGet, queryParam, withErrors, type Handler } from '../../../../../_helpers';

const handler: Handler = withErrors(async (req, res) => {
  if (!requireGet(req, res)) return;
  const teamId = positiveInt(queryParam(req, 'teamId'), 'teamId', 10_000_000);
  const eventId = positiveInt(queryParam(req, 'eventId'), 'eventId', 100);
  const response: ApiResponse<unknown> = { data: await fetchFpl(`/entry/${teamId}/event/${eventId}/picks/`), generatedAt: new Date().toISOString() };
  sendJson(res, 200, response, cacheHeaders(60));
});
export default handler;
