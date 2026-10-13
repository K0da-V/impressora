import crypto from 'node:crypto';

export const nowIso = () => new Date().toISOString();
export const uid = (p = 'id') => `${p}_${crypto.randomBytes(6).toString('hex')}`;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const today = () => new Date().toISOString().slice(0, 10);

export class HttpError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

/** fetch com timeout e re-tentativas (429/5xx) com espera exponencial. */
export async function http<T = any>(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {},
): Promise<T> {
  const { timeoutMs = 20_000, retries = 2, ...rest } = init;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...rest, signal: ctrl.signal });
      const text = await res.text();
      let body: any = text;
      try { body = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }
      if (res.ok) return body as T;
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(800 * 2 ** attempt);
        continue;
      }
      throw new HttpError(res.status, `HTTP ${res.status} em ${new URL(url).host}`, body);
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError) throw e;
      if (attempt < retries) { await sleep(800 * 2 ** attempt); continue; }
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function maskEmail(email: string) {
  const [u, d] = email.split('@');
  if (!d) return '***';
  return `${u.slice(0, 2)}***@${d}`;
}

export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a); const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
