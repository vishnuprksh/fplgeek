import type { VercelRequest, VercelResponse } from '@vercel/node';
import { activeVersion, db } from '../_lib/db.js';
import { cache, sendError } from '../_lib/response.js';

export default async function handler(_request: VercelRequest, response: VercelResponse) {
  try {
    const version = await activeVersion();
    if (!version) return sendError(response, 404, 'No active data version');
    const sql = db();
    const [teams, elements, events, element_types] = await Promise.all([
      sql`SELECT payload FROM teams WHERE data_version_id = ${version.id} ORDER BY id`,
      sql`SELECT payload FROM players WHERE data_version_id = ${version.id} ORDER BY id`,
      sql`SELECT payload FROM events WHERE data_version_id = ${version.id} ORDER BY id`,
      sql`SELECT payload FROM element_types WHERE data_version_id = ${version.id} ORDER BY id`,
    ]);
    cache(response, 21600);
    const payloads = (rows: unknown) => (rows as Array<{ payload: unknown }>).map(row => row.payload);
    return response.status(200).json({
      teams: payloads(teams),
      elements: payloads(elements),
      events: payloads(events),
      element_types: payloads(element_types),
    });
  } catch (error) {
    console.error('Bootstrap lookup failed', error);
    return sendError(response, 503, 'Unable to load bootstrap data');
  }
}
