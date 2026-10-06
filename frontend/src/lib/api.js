const TOKEN_KEY = 'lfs.token';

export const tokenStore = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* modo privado */ } },
};

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || 'No pudimos conectar con el servidor.');
    this.status = status;
    this.code = data?.code;
    this.field = data?.field;
    this.fields = data?.fields || (data?.field ? { [data.field]: data.error } : {});
  }
}

export async function api(path, { method, body, form, signal } = {}) {
  const token = tokenStore.get();
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method: method ?? (body || form ? 'POST' : 'GET'),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: form ?? (body ? JSON.stringify(body) : undefined),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, { error: 'Sin conexión con el servidor. ¿Está encendido el backend?' });
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const get = (p, opts) => api(p, opts);
export const post = (p, body, opts) => api(p, { ...opts, body: body ?? {}, method: 'POST' });
export const patch = (p, body) => api(p, { body, method: 'PATCH' });

export const streamUrl = () => `/api/stream?token=${encodeURIComponent(tokenStore.get() || '')}`;
