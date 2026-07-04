import { request } from './client';

/** POST /user — create an account. Returns { id, email }. */
export function registerUser(email, password) {
  return request('/user', {
    method: 'POST',
    body: { email, password },
    skipAuth: true,
  });
}

/**
 * POST /login — OAuth2 password flow, form-urlencoded.
 * Returns { access_token, token_type }.
 */
export function loginUser(email, password) {
  const form = new URLSearchParams();
  form.set('grant_type', 'password');
  form.set('username', email);
  form.set('password', password);
  form.set('scope', '');

  return request('/login', {
    method: 'POST',
    body: form,
    skipAuth: true,
  });
}
