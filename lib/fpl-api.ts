const FPL_API_BASE = 'https://fantasy.premierleague.com/api';
const REQUEST_TIMEOUT_MS = 10_000;

export class FplApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FplApiError';
  }
}

export async function fetchFpl<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${FPL_API_BASE}${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'FPLGeek/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) throw new FplApiError(response.status, `FPL API returned ${response.status}.`);
    return await response.json() as T;
  } catch (error) {
    if (error instanceof FplApiError) throw error;
    throw new FplApiError(502, 'Unable to reach the official FPL API.');
  } finally {
    clearTimeout(timeout);
  }
}
