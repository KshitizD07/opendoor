/**
 * api.js — Axios instance pre-configured for the Opendoor API.
 *
 * Base URL: /api/v1  (proxied to http://localhost:5000 in dev via vite.config.js)
 * Auth:     Bearer <accessToken> read from localStorage.
 * Credentials: true so the httpOnly refreshToken cookie is sent on every request.
 */

import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,          // send/receive httpOnly cookies (refresh token)
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Request Interceptor ───────────────────────────────────────────────────────
// Attach the access token from localStorage before every request.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response Interceptor ──────────────────────────────────────────────────────
// Unwrap the standardised { success, message, data, error } envelope so callers
// only deal with `data`.  On 401 clear local storage (token expired/invalid).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      // TODO: redirect to /login once auth routes are wired
    }
    return Promise.reject(error);
  }
);

export default api;
