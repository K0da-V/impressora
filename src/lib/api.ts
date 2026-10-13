import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'autodrop_token';
export const getToken = () => sessionStorage.getItem(KEY) ?? '';
export const setToken = (t: string) => sessionStorage.setItem(KEY, t);
export const clearToken = () => sessionStorage.removeItem(KEY);

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Erro ${res.status}`);
  return data as T;
}

/** Busca dados e atualiza sozinho a cada `every` ms. */
export function useApi<T>(path: string, every = 8000) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<ApiError | undefined>();
  const alive = useRef(true);
  const load = useCallback(async () => {
    try { const d = await api<T>(path); if (alive.current) { setData(d); setError(undefined); } }
    catch (e) { if (alive.current) setError(e as ApiError); }
  }, [path]);
  useEffect(() => {
    alive.current = true; void load();
    const t = setInterval(load, every);
    return () => { alive.current = false; clearInterval(t); };
  }, [load, every]);
  return { data, error, reload: load };
}
