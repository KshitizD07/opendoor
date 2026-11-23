/**
 * useProfile.js — React hook for fetching and updating the authenticated
 *                 user's profile via GET/PUT /api/v1/users/profile.
 *
 * CONTRACT dependency: CONTRACT/api.md §§ 3-4
 *
 * Returned state:
 *   profile   — raw user object (null while loading or on error)
 *   loading   — true during the initial GET fetch
 *   saving    — true while a PUT is in-flight
 *   error     — string error message, or null
 *   saveError — string error from PUT, or null
 *   fetchProfile()          — re-fetch (useful after navigation back)
 *   updateProfile(payload)  — trigger PUT; resolves with updated user
 */

import { useState, useCallback } from 'react';
import { getProfile, updateProfile as apiUpdateProfile } from '../api/userService.js';

/**
 * Extract a user-readable error message from an AxiosError.
 * The server's envelope uses:
 *   { success: false, message: '...', error: { code, details? } }
 */
const extractErrorMessage = (axiosError) => {
  const serverMsg = axiosError?.response?.data?.message;
  const details   = axiosError?.response?.data?.error?.details;

  if (details && Array.isArray(details) && details.length > 0) {
    // Surface the first validation detail if present
    return details.map((d) => `${d.field ? d.field + ': ' : ''}${d.message}`).join(' | ');
  }
  return serverMsg || axiosError?.message || 'An unexpected error occurred.';
};

/**
 * @returns {{
 *   profile: Object|null,
 *   loading: boolean,
 *   saving: boolean,
 *   error: string|null,
 *   saveError: string|null,
 *   fetchProfile: () => Promise<void>,
 *   updateProfile: (payload: object) => Promise<Object>,
 * }}
 */
const useProfile = () => {
  const [profile,   setProfile]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);
  const [saveError, setSaveError] = useState(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await getProfile();
      setProfile(user);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Update ─────────────────────────────────────────────────────────────────
  const updateProfile = useCallback(async (payload) => {
    setSaving(true);
    setSaveError(null);
    try {
      const updatedUser = await apiUpdateProfile(payload);
      setProfile(updatedUser);
      return updatedUser;
    } catch (err) {
      const msg = extractErrorMessage(err);
      setSaveError(msg);
      throw new Error(msg); // re-throw so callers can react (e.g. show inline toast)
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    profile,
    loading,
    saving,
    error,
    saveError,
    fetchProfile,
    updateProfile,
  };
};

export default useProfile;
