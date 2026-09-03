import type { VercelRequest, VercelResponse } from '@vercel/node';
import { activeVersion, db } from '../_lib/db.js';
import { cache, sendError } from '../_lib/response.js';

export default async function handler(_request: VercelRequest, response: VercelResponse) {
  try {
    const version = await activeVersion();
    if (!version) return sendError(response, 404, 'No active data version');
    const rows = await db()`
      SELECT payload FROM analysis_results
      WHERE data_version_id = ${version.id} AND result_type = 'league_analysis'
      LIMIT 1
    `;
    if (!rows[0]) return sendError(response, 404, 'League analysis unavailable');
    cache(response, 21600);
    return response.status(200).json(rows[0].payload);
  } catch (error) {
    console.error('League analysis lookup failed', error);
    return sendError(response, 503, 'Unable to load league analysis');
  }
}
