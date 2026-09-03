import type { VercelRequest, VercelResponse } from '@vercel/node';
import { activeVersion, db } from './_lib/db.js';
import { cache, sendError } from './_lib/response.js';

/**
 * Returns gameweek context derived from the active Neon data version:
 * - currentGW: the latest GW with any finished fixtures
 * - nextPlayGW: the next GW with upcoming fixtures (optimization target)
 * - blankGWs: GWs with fewer than 10 fixtures scheduled
 */
export default async function handler(_request: VercelRequest, response: VercelResponse) {
  try {
    const version = await activeVersion();
    if (!version) return sendError(response, 404, 'No active data version');

    const rows = await db()`
      SELECT (payload->>'event')::int AS event,
             (payload->>'started')::boolean AS started,
             (payload->>'finished')::boolean AS finished,
             (payload->>'is_future')::boolean AS is_future
      FROM fixtures
      WHERE data_version_id = ${version.id}
    `;

    const fixtures = rows as Array<{
      event: number | null;
      started: boolean | null;
      finished: boolean | null;
      is_future: boolean | null;
    }>;

    const byGw = new Map<number, { total: number; future: number; finished: number }>();
    for (const f of fixtures) {
      if (f.event == null) continue;
      const gw = byGw.get(f.event) ?? { total: 0, future: 0, finished: 0 };
      gw.total += 1;
      if (f.is_future) gw.future += 1;
      if (f.finished) gw.finished += 1;
      byGw.set(f.event, gw);
    }

    const events = [...byGw.entries()].sort((a, b) => a[0] - b[0]);
    const currentGW = events.reduce((acc, [gw, s]) => (s.finished > 0 ? Math.max(acc, gw) : acc), 1);
    const nextPlayGwEntry = events.find(([, s]) => s.future > 0);
    const nextPlayGW = nextPlayGwEntry ? nextPlayGwEntry[0] : currentGW + 1;
    // A "blank" gameweek has fewer than the usual 10 fixtures.
    const blankGWs = events.filter(([gw, s]) => gw >= nextPlayGW && s.total < 10).map(([gw]) => gw);

    cache(response, 3600);
    return response.status(200).json({
      currentGW,
      nextPlayGW,
      blankGWs,
      timestamp: (version.created_at as string | undefined) ?? new Date().toISOString(),
    });
  } catch (error) {
    console.error('Gameweek context lookup failed', error);
    return sendError(response, 503, 'Unable to load gameweek context');
  }
}
