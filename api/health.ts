import type { VercelRequest, VercelResponse } from '@vercel/node';
import { activeVersion } from './_lib/db.js';
import { sendError } from './_lib/response.js';

export default async function handler(_request: VercelRequest, response: VercelResponse) {
  try {
    const version = await activeVersion();
    return response.status(200).json({ ok: true, database: true, activeVersion: version?.version_key ?? null });
  } catch (error) {
    console.error('Health check failed', error);
    return sendError(response, 503, 'Database unavailable');
  }
}
