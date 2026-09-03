import type { VercelRequest, VercelResponse } from '@vercel/node';
import { activeVersion } from './_lib/db.js';
import { cache, sendError } from './_lib/response.js';

export default async function handler(_request: VercelRequest, response: VercelResponse) {
  try {
    cache(response, 180);
    return response.status(200).json({ dataVersion: await activeVersion() });
  } catch (error) {
    console.error('Version lookup failed', error);
    return sendError(response, 503, 'Unable to load data version');
  }
}
