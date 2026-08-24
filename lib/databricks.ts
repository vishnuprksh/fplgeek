type DatabricksColumn = { name: string };
type DatabricksResult = {
  manifest?: { schema?: { columns?: DatabricksColumn[] } };
  result?: { data_array?: unknown[][]; next_chunk_internal_link?: string };
};

type StatementResponse = DatabricksResult & {
  statement_id?: string;
  status?: { state?: string; error?: { message?: string } };
};

const MAX_ROWS = 5000;
const DEFAULT_TIMEOUT_MS = 25_000;
const POLL_INTERVAL_MS = 250;

function config(): { host: string; token: string; httpPath: string; warehouseId: string; catalog: string; schema: string } {
  const host = process.env.DATABRICKS_HOST?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const token = process.env.DATABRICKS_TOKEN;
  const httpPath = process.env.DATABRICKS_HTTP_PATH;
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID || httpPath?.split('/').filter(Boolean).pop();
  if (!host || !token || !httpPath || !warehouseId) throw new Error('Databricks server configuration is incomplete.');
  return { host, token, httpPath, warehouseId, catalog: process.env.DATABRICKS_CATALOG || 'workspace', schema: process.env.DATABRICKS_SCHEMA || 'fplgeek' };
}

function endpoint(host: string, path: string): string { return `https://${host}${path}`; }

async function request<T>(url: string, init: RequestInit, token: string): Promise<T> {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!response.ok) {
    console.error('Databricks request failed:', response.status, await response.text());
    throw new Error('Databricks request failed.');
  }
  return await response.json() as T;
}

function rowsFrom(result: DatabricksResult): Record<string, unknown>[] {
  const columns = result.manifest?.schema?.columns?.map(column => column.name) || [];
  return (result.result?.data_array || []).slice(0, MAX_ROWS).map(row => Object.fromEntries(columns.map((column, index) => [column, row[index] ?? null])));
}

export async function executeQuery(statement: string, parameters: unknown[] = [], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Record<string, unknown>[]> {
  const settings = config();
  const payload = {
    statement,
    warehouse_id: settings.warehouseId,
    catalog: settings.catalog,
    schema: settings.schema,
    parameters: parameters.map((value, index) => ({ name: `p${index}`, type: typeof value === 'number' ? 'INT' : 'STRING', value: String(value) })),
    wait_timeout: '5s',
    on_wait_timeout: 'CONTINUE',
    disposition: 'INLINE',
    format: 'JSON_ARRAY',
  };
  let result = await request<StatementResponse>(endpoint(settings.host, '/api/2.0/sql/statements/'), { method: 'POST', body: JSON.stringify(payload) }, settings.token);
  const deadline = Date.now() + timeoutMs;
  while (result.status?.state && !['SUCCEEDED', 'FAILED', 'CANCELED', 'CLOSED'].includes(result.status.state)) {
    if (Date.now() >= deadline) throw new Error('Databricks query timed out.');
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    if (!result.statement_id) throw new Error('Databricks did not return a statement identifier.');
    result = await request<StatementResponse>(endpoint(settings.host, `/api/2.0/sql/statements/${encodeURIComponent(result.statement_id)}`), { method: 'GET' }, settings.token);
  }
  if (result.status?.state !== 'SUCCEEDED') throw new Error(`Databricks query ${result.status?.state || 'failed'}.`);
  return rowsFrom(result);
}

export function table(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Invalid table name.');
  const settings = config();
  return `\`${settings.catalog}\`.\`${settings.schema}\`.\`${name}\``;
}
