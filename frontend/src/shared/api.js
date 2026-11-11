// Talks to the PHP API. Every request goes to {base}/api/…, where {base} is the
// folder the site is installed in (public/index.php passes it in window.__ME__).
// Changes (POST/PATCH/PUT/DELETE) carry the session's CSRF token; when the
// session has expired the token is fetched again and the request retried once.

export const BASE = (typeof window !== 'undefined' && window.__ME__ && window.__ME__.base) || '';

export class ApiError extends Error {
  constructor(status, code, message, fields = {}) {
    super(message || 'Something went wrong.');
    this.status = status;
    this.code = code;
    this.fields = fields || {};
  }
}

let csrfToken = null;
export const setCsrf = (token) => { if (token) csrfToken = token; };

async function refreshCsrf() {
  const res = await fetch(`${BASE}/api/session`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  const json = await res.json();
  setCsrf(json?.data?.csrfToken);
}

async function request(method, path, body, retry = true) {
  const headers = { Accept: 'application/json' };
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    if (!csrfToken) await refreshCsrf();
    headers['X-CSRF-Token'] = csrfToken;
  }
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'offline', 'We could not reach the store. Check your connection and try again.');
  }
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  if (json?.data?.csrfToken) setCsrf(json.data.csrfToken);
  if (!res.ok) {
    if (res.status === 403 && json?.error?.code === 'csrf' && retry) {
      csrfToken = null;
      return request(method, path, body, false);
    }
    const e = json?.error || {};
    throw new ApiError(res.status, e.code || 'error', e.message || `The request failed (${res.status}).`, e.fields);
  }
  return json ? json.data : null;
}

export const api = {
  get: (path, params) => {
    const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : '';
    return request('GET', qs ? `${path}?${qs}` : path);
  },
  post: (path, body = {}) => request('POST', path, body),
  patch: (path, body = {}) => request('PATCH', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
  upload: (path, formData) => request('POST', path, formData),
};

/** Absolute URL for a picture from the API (api/images/{key}) or a site file (media/…). */
export function asset(path) {
  if (!path) return `${BASE}/media/fallback.svg`;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${BASE}/${String(path).replace(/^\/+/, '')}`;
}

/** The current main picture of a product colour, for page artwork that names a product. */
export function productPicture(slug, color) {
  return `api/images/products/${encodeURIComponent(slug)}${color ? `?color=${encodeURIComponent(color)}` : ''}`;
}

/** Safe in-app redirect target (blocks //evil.com and backslash tricks). */
export function safeNext(next, fallback = '/') {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}
