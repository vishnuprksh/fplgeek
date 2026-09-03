import { neon } from '@neondatabase/serverless';

let client: ReturnType<typeof neon> | undefined;

export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not configured');
    client = neon(url);
  }
  return client;
}

export async function activeVersion() {
  const rows = await db()`
    SELECT id, version_key, source_season, current_gameweek, metadata, created_at, activated_at
    FROM data_versions
    WHERE status = 'active'
    ORDER BY activated_at DESC NULLS LAST
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export function jsonPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
