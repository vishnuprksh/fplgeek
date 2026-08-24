import type { IncomingMessage, ServerResponse } from 'node:http';
import { executeQuery, table } from '../lib/databricks';
import { getQueryValue, handleApiError, sendJson, type ApiRequest } from '../lib/http';
import { ValidationError } from '../lib/validation';

export type Handler = (req: ApiRequest, res: ServerResponse) => Promise<void>;

export function withErrors(handler: Handler): Handler {
  return async (req, res) => {
    try { await handler(req, res); }
    catch (error) {
      if (error instanceof ValidationError) return sendJson(res, 400, { error: error.message });
      handleApiError(res, error);
    }
  };
}

export function requireGet(req: ApiRequest, res: ServerResponse): boolean {
  if (req.method !== 'GET') { sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET' }); return false; }
  return true;
}

export { executeQuery, getQueryValue, sendJson, table };
export function jsonColumn(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

export function queryParam(req: ApiRequest, key: string): string | undefined { return getQueryValue(req, key); }
