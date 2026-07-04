const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://voice-ai-interview-agent.onrender.com';

const TOKEN_KEY = 'voicebench_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Extracts a human-readable message from a FastAPI error payload,
 * including 422 validation errors shaped like { detail: [...] }.
 */
function extractErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload.detail === 'string') return payload.detail;
  if (Array.isArray(payload.detail)) {
    return payload.detail
      .map((d) => (d.msg ? `${(d.loc || []).slice(-1)[0] || ''}: ${d.msg}` : JSON.stringify(d)))
      .join(', ');
  }
  return fallback;
}

/**
 * Core request helper.
 * - JSON bodies are stringified automatically.
 * - FormData / URLSearchParams bodies are passed through untouched (correct Content-Type is
 *   set automatically by the browser for FormData, and we set it explicitly for URLSearchParams).
 * - Attaches `Authorization: Bearer <token>` automatically when a token is present, unless
 *   `skipAuth` is passed.
 */
export async function request(path, { method = 'GET', body, skipAuth = false, isForm = false } = {}) {
  const headers = {};
  let finalBody = body;

  if (body instanceof FormData) {
    // Let the browser set the multipart boundary.
  } else if (body instanceof URLSearchParams) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    finalBody = JSON.stringify(body);
  }

  if (!skipAuth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: finalBody,
    });
  } catch (networkErr) {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0, null);
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
    }
    const message = extractErrorMessage(payload, `Request failed (${response.status})`);
    throw new ApiError(message, response.status, payload?.detail);
  }

  return payload;
}

export { ApiError, BASE_URL };
