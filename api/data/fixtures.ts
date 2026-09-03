import type { VercelRequest, VercelResponse } from '@vercel/node';
import { activeVersion, db } from '../_lib/db.js';
import { cache, sendError } from '../_lib/response.js';

export default async function handler(_request: VercelRequest, response: VercelResponse) {
  try {
    const version = await activeVersion();
    if (!version) return sendError(response, 404, 'No active data version');
    const rows = await db()`
      SELECT payload FROM fixtures
      WHERE data_version_id = ${version.id}
      ORDER BY kickoff_time NULLS LAST, id
    `;
    cache(response, 21600);
    return response.status(200).json((rows as Array<{ payload: unknown }>).map(row => row.payload));
  } catch (error) {
    console.error('Fixtures lookup failed', error);
    return sendError(response, 503, 'Unable to load fixtures');
  }
}
