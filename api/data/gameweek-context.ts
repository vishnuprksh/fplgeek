import { cacheHeaders, sendJson } from '../../lib/http';
import type { ApiResponse, GameweekContext } from '../../lib/api-contracts';
import { requireGet, table, withErrors, type Handler } from '../_helpers';

const handler: Handler = withErrors(async (req, res) => {
  if (!requireGet(req, res)) return;
  const { executeQuery } = await import('../../lib/databricks');
  const rows = await executeQuery(`SELECT CAST(get_json_object(data, '$.event') AS INT) AS event, COUNT(*) AS total, SUM(CASE WHEN CAST(get_json_object(data, '$.finished') AS BOOLEAN) THEN 1 ELSE 0 END) AS finished FROM ${table('fixtures')} GROUP BY CAST(get_json_object(data, '$.event') AS INT) ORDER BY event LIMIT 100`);
  const stats = rows.filter(row => row.event !== null).map(row => ({ gw: Number(row.event), total: Number(row.total), finished: Number(row.finished || 0) }));
  let currentGW = 1;
  for (const stat of [...stats].reverse()) if (stat.finished > 0) { currentGW = stat.gw; break; }
  const next = stats.find(stat => stat.gw > currentGW && stat.finished === 0 && stat.total > 0);
  const data: GameweekContext = { currentGW, nextPlayGW: next?.gw || currentGW + 1, blankGWs: stats.filter(stat => stat.total < 10).map(stat => stat.gw), timestamp: new Date().toISOString() };
  const response: ApiResponse<GameweekContext> = { data, generatedAt: data.timestamp };
  sendJson(res, 200, response, cacheHeaders(600));
});
export default handler;
