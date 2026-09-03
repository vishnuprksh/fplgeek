import type { VercelRequest, VercelResponse } from '@vercel/node';
import { activeVersion, db } from '../_lib/db.js';
import { cache, sendError } from '../_lib/response.js';

const MAX_PAGE_SIZE = 100;
const positions = new Set(['GKP', 'DEF', 'MID', 'FWD']);

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    const version = await activeVersion();
    if (!version) return sendError(response, 404, 'No active data version');
    const page = positiveInt(request.query.page, 1);
    const pageSize = Math.min(positiveInt(request.query.pageSize, 50), MAX_PAGE_SIZE);
    const position = typeof request.query.position === 'string' ? request.query.position : '';
    const search = typeof request.query.search === 'string' ? request.query.search.trim().slice(0, 80) : '';
    if (position && !positions.has(position)) return sendError(response, 400, 'Invalid position');
    const offset = (page - 1) * pageSize;
    const sql = db();
    const filters = position ? sql`AND t.position = ${position}` : sql``;
    const searchFilter = search ? sql`AND p.web_name ILIKE ${`%${search}%`}` : sql``;
    const [rows, countRows] = await Promise.all([
      sql`SELECT t.player_id AS id, p.web_name AS name, t.gameweek AS gw, t.season,
          t.target_class AS target, t.is_future, t.metadata
          FROM training_data t JOIN players p ON p.id = t.player_id
          WHERE t.data_version_id = ${version.id} ${filters} ${searchFilter}
          ORDER BY t.season DESC, t.gameweek DESC, t.player_id
          LIMIT ${pageSize} OFFSET ${offset}`,
      sql`SELECT COUNT(*)::int AS total FROM training_data t JOIN players p ON p.id = t.player_id
          WHERE t.data_version_id = ${version.id} ${filters} ${searchFilter}`,
    ]);
    const total = Number((countRows as Array<{ total: number }>)[0]?.total ?? 0);
    cache(response, 300);
    return response.status(200).json({ data: rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (error) {
    console.error('Training data lookup failed', error);
    return sendError(response, 503, 'Unable to load training data');
  }
}
