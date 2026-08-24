import { cacheHeaders, sendJson } from '../../lib/http';
import { boundedInt, position, ValidationError } from '../../lib/validation';
import { jsonColumn, requireGet, queryParam, table, withErrors, type Handler } from '../_helpers';

const handler: Handler = withErrors(async (req, res) => {
  if (!requireGet(req, res)) return;
  const pos = position(queryParam(req, 'position'));
  const page = boundedInt(queryParam(req, 'page'), 'page', 1, 1, 10_000);
  const pageSize = boundedInt(queryParam(req, 'pageSize'), 'pageSize', 50, 1, 100);
  const search = queryParam(req, 'search')?.trim() || '';
  if (search.length > 100) throw new ValidationError('search must be 100 characters or fewer.');
  const { executeQuery } = await import('../../lib/databricks');
  const escapedSearch = search.replace(/[%_\\]/g, '\\$&').replace(/'/g, "''");
  const filter = search ? ` AND metadata LIKE '%${escapedSearch}%'` : '';
  const rows = await executeQuery(`SELECT gw, season, metadata, target_class AS target FROM ${table('preprocessed_data')} WHERE position = '${pos}'${filter} ORDER BY season DESC, gw DESC LIMIT 5000`);
  const data = rows.slice((page - 1) * pageSize, page * pageSize).map(row => ({ ...(jsonColumn(row.metadata) as object || {}), gw: Number(row.gw), season: row.season, target: Number(row.target || 0) }));
  sendJson(res, 200, { data, total: rows.length, page, pageSize, totalPages: Math.ceil(rows.length / pageSize), generatedAt: new Date().toISOString() }, cacheHeaders(3600));
});
export default handler;
