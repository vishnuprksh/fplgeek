export interface ApiResponse<T> { data: T; generatedAt?: string; }

export class ApiError extends Error {
    readonly status: number;
    constructor(message: string, status: number) { super(message); this.status = status; this.name = 'ApiError'; }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
    const body = await response.json().catch(() => null) as ApiResponse<T> | { error?: string } | null;
    if (!response.ok) throw new ApiError(body && 'error' in body && body.error ? body.error : `Request failed (${response.status})`, response.status);
    return body && 'data' in body ? body.data : body as T;
}