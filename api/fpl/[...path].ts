import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendError } from '../_lib/response.js';

const allowed = new Set([
  'bootstrap-static',
  'fixtures',
  'entry',
  'element-summary',
]);

function routeParts(request: VercelRequest): string[] {
  const value = request.query.path;
  return Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') return sendError(response, 405, 'Method not allowed');
  const parts = routeParts(request);
  if (!parts.length || !allowed.has(parts[0])) return sendError(response, 404, 'FPL endpoint not allowed');
  const path = `/${parts.map(part => encodeURIComponent(part)).join('/')}/`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const upstream = await fetch(`https://fantasy.premierleague.com/api${path}`, { signal: controller.signal });
    const body = await upstream.text();
    response.status(upstream.status);
    response.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return response.send(body);
  } catch (error) {
    console.error('FPL proxy failed', error);
    return sendError(response, 502, 'FPL service unavailable');
  } finally {
    clearTimeout(timeout);
  }
}
