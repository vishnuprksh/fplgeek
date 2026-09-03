import type { VercelResponse } from '@vercel/node';

export function sendError(response: VercelResponse, status: number, message: string) {
  return response.status(status).json({ error: message });
}

export function cache(response: VercelResponse, seconds: number) {
  response.setHeader('Cache-Control', `public, s-maxage=${seconds}, stale-while-revalidate=${seconds}`);
}
