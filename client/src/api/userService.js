/**
 * userService.js — Data-access layer for the Users module.
 *
 * Mirrors CONTRACT/api.md §§ 3-4 exactly:
 *
 *   GET  /api/v1/users/profile   → fetch authenticated user profile
 *   PUT  /api/v1/users/profile   → update fullName | phone | gender
 *
 * Response envelope (server):
 *   { success, message, data: { user: {...} }, error }
 */

import api from './api.js';

// ── GET /api/v1/users/profile ─────────────────────────────────────────────────
/**
 * Fetch the currently authenticated user's profile.
 * @returns {Promise<Object>} The raw user object from data.user
 * @throws  {AxiosError}  On 401 (bad/expired token) or network error
 */
export const getProfile = async () => {
  const response = await api.get('/users/profile');
  // Unwrap envelope: { success, message, data: { user } }
  return response.data.data.user;
};

// ── PUT /api/v1/users/profile ─────────────────────────────────────────────────
/**
 * Update mutable profile fields.
 *
 * @param {{ fullName?: string, phone?: string, gender?: 'male'|'female'|'other' }} payload
 *   At least one field must be provided. Immutable fields (id, email, etc.)
 *   are silently ignored by the server per CONTRACT/api.md § 4.
 * @returns {Promise<Object>} The updated user object from data.user
 * @throws  {AxiosError}  On 400 (validation) | 401 (auth) | network error
 */
export const updateProfile = async (payload) => {
  const response = await api.put('/users/profile', payload);
  return response.data.data.user;
};
