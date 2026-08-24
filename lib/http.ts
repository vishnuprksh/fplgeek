import type { IncomingMessage, ServerResponse } from 'node:http';

export type ApiRequest = IncomingMessage & { query?: Record<string, string | string[] | undefined> };
export type ApiResponse = ServerResponse & {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

export function sendJson<T>(res: ServerResponse, status: number, body: T, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(payload);
}

export function methodNotAllowed(res: ServerResponse, allowed: string[]): void {
  sendJson(res, 405, { error: 'Method not allowed' }, { Allow: allowed.join(', ') });
}

export function getQueryValue(req: ApiRequest, key: string): string | undefined {
  const value = req.query?.[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function handleApiError(res: ServerResponse, error: unknown): void {
  console.error('API request failed:', error);
  sendJson(res, 500, { error: 'The requested data is temporarily unavailable.' });
}

export function cacheHeaders(seconds: number): Record<string, string> {
  return { 'Cache-Control': `s-maxage=${seconds}, stale-while-revalidate=${seconds}` };
}
