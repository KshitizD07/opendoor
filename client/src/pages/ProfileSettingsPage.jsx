/**
 * ProfileSettingsPage.jsx — task-frontend-02
 *
 * Renders the User Profile Settings page. Consumes:
 *   GET  /api/v1/users/profile   (loads current data)
 *   PUT  /api/v1/users/profile   (saves edits: fullName, phone, gender)
 *
 * API shape is taken verbatim from CONTRACT/api.md §§ 3-4.
 * Mutable fields  : fullName, phone, gender
 * Immutable fields: id, universityId, rollNumber, email, role, status (display-only)
 */

import { useEffect, useState } from 'react';
import useProfile from '../hooks/useProfile.js';
import styles from './ProfileSettingsPage.module.css';

// ── Small utility components ──────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    pending_verification: { label: 'Pending Verification', cls: styles.badgeWarning },
    active:               { label: 'Active',               cls: styles.badgeSuccess },
    suspended:            { label: 'Suspended',            cls: styles.badgeDanger  },
  };
  const { label, cls } = map[status] ?? { label: status, cls: styles.badgeDefault };
  return <span className={`${styles.badge} ${cls}`}>{label}</span>;
}

function RoleBadge({ role }) {
  const labels = {
    student:     'Student',
    warden:      'Warden',
    guard:       'Guard',
    super_admin: 'Super Admin',
  };
  return (
    <span className={`${styles.badge} ${styles.badgePrimary}`}>
      {labels[role] ?? role}
    </span>
  );
}

function FormField({ id, label, value, onChange, type = 'text', readOnly = false, hint }) {
  return (
    <div className={styles.formField}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value ?? ''}
        onChange={onChange}
        readOnly={readOnly}
        className={`${styles.input} ${readOnly ? styles.inputReadOnly : ''}`}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

function GenderSelect({ value, onChange, disabled }) {
  return (
    <div className={styles.formField}>
      <label htmlFor="gender" className={styles.label}>
        Gender
      </label>
      <select
        id="gender"
        value={value ?? ''}
        onChange={onChange}
        disabled={disabled}
        className={styles.select}
      >
        <option value="">— Not specified —</option>
        <option value="male">Male</option>
        <option value="female">Female</option>
        <option value="other">Other</option>
      </select>
    </div>
  );
}

// ── Toast notification ────────────────────────────────────────────────────────

function Toast({ message, type, onDismiss }) {
  if (!message) return null;
  const cls = type === 'success' ? styles.toastSuccess : styles.toastError;
  return (
    <div className={`${styles.toast} ${cls}`} role="alert">
      <span>{message}</span>
      <button className={styles.toastClose} onClick={onDismiss} aria-label="Dismiss notification">
        ✕
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProfileSettingsPage() {
  const { profile, loading, saving, error, saveError, fetchProfile, updateProfile } =
    useProfile();

  // Local form state (controlled)
  const [form, setForm] = useState({ fullName: '', phone: '', gender: '' });
  const [isDirty, setIsDirty] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  // Seed form once profile loads
  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (profile) {
      setForm({
        fullName: profile.fullName ?? '',
        phone:    profile.phone    ?? '',
        gender:   profile.gender   ?? '',
      });
      setIsDirty(false);
    }
  }, [profile]);

  // ── Form helpers ───────────────────────────────────────────────────────────
  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setIsDirty(true);
  };

  const handleReset = () => {
    if (!profile) return;
    setForm({
      fullName: profile.fullName ?? '',
      phone:    profile.phone    ?? '',
      gender:   profile.gender   ?? '',
    });
    setIsDirty(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setToast({ message: '', type: 'success' });

    // Build payload: only include fields the contract allows to change
    // Per CONTRACT/api.md § 4 all three are optional — omit blanks for phone/gender
    const payload = {};
    if (form.fullName.trim()) payload.fullName = form.fullName.trim();
    if (form.phone.trim())    payload.phone    = form.phone.trim();
    if (form.gender)          payload.gender   = form.gender;

    try {
      await updateProfile(payload);
      setIsDirty(false);
      setToast({ message: 'Profile updated successfully!', type: 'success' });
    } catch {
      // saveError is already set inside the hook; toast handled below
      setToast({ message: saveError || 'Update failed. Please try again.', type: 'error' });
    }
  };

  // ── Render: loading skeleton ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.skeleton} style={{ height: '24px', width: '200px', marginBottom: '8px' }} />
          <div className={styles.skeleton} style={{ height: '16px', width: '300px', marginBottom: '32px' }} />
          <div className={styles.card}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.skeleton} style={{ height: '56px', marginBottom: '16px' }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: fetch error ────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.errorState}>
            <p className={styles.errorIcon}>⚠️</p>
            <h2>Could not load profile</h2>
            <p className={styles.errorText}>{error}</p>
            <button className={styles.btnPrimary} onClick={fetchProfile}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: main ──────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.container}>

        {/* Page header */}
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Profile Settings</h1>
            <p className={styles.pageSubtitle}>
              Manage your account details. Some fields are locked by the system.
            </p>
          </div>
          {profile && (
            <div className={styles.badgeRow}>
              <RoleBadge role={profile.role} />
              <StatusBadge status={profile.status} />
            </div>
          )}
        </header>

        {/* Toast */}
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast({ message: '', type: 'success' })}
        />

        {/* ── Read-only identity card ── */}
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>🔒</span>
            Identity (read-only)
          </h2>
          <p className={styles.sectionDesc}>
            These fields are managed by your university and cannot be changed here.
          </p>

          <div className={styles.fieldGrid}>
            <FormField
              id="userId"
              label="User ID"
              value={profile?.id}
              readOnly
            />
            <FormField
              id="rollNumber"
              label="Roll Number"
              value={profile?.rollNumber}
              readOnly
            />
            <FormField
              id="email"
              label="Email Address"
              value={profile?.email}
              type="email"
              readOnly
            />
            <FormField
              id="universityId"
              label="University ID"
              value={profile?.universityId}
              readOnly
            />
          </div>
        </section>

        {/* ── Editable profile form ── */}
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>✏️</span>
            Personal Details
          </h2>
          <p className={styles.sectionDesc}>
            Update your display name, contact number, and gender.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.fieldGrid}>
              <FormField
                id="fullName"
                label="Full Name"
                value={form.fullName}
                onChange={handleChange('fullName')}
                hint="1 – 100 characters"
              />
              <FormField
                id="phone"
                label="Phone Number"
                value={form.phone}
                onChange={handleChange('phone')}
                type="tel"
                hint="E.164 format, e.g. +919876543210"
              />
            </div>

            <GenderSelect
              value={form.gender}
              onChange={handleChange('gender')}
              disabled={saving}
            />

            {/* Save error inline */}
            {saveError && (
              <p className={styles.fieldError} role="alert">
                {saveError}
              </p>
            )}

            {/* Action buttons */}
            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleReset}
                disabled={!isDirty || saving}
              >
                Discard Changes
              </button>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={!isDirty || saving}
              >
                {saving ? (
                  <>
                    <span className={styles.spinner} aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </form>
        </section>

        {/* ── Hostel assignment (read-only context) ── */}
        {profile && (
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>🏠</span>
              Hostel Assignment
            </h2>
            <p className={styles.sectionDesc}>
              Assigned by the warden after physical verification.
            </p>
            <div className={styles.fieldGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Hostel</span>
                <span className={styles.infoValue}>
                  {profile.hostelId ?? <em className={styles.unassigned}>Not assigned</em>}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Room</span>
                <span className={styles.infoValue}>
                  {profile.roomId ?? <em className={styles.unassigned}>Not assigned</em>}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Bed</span>
                <span className={styles.infoValue}>
                  {profile.bedId ?? <em className={styles.unassigned}>Not assigned</em>}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* ── Timestamps ── */}
        {profile && (
          <footer className={styles.timestamps}>
            <span>
              Account created:{' '}
              <time dateTime={profile.createdAt}>
                {new Date(profile.createdAt).toLocaleString()}
              </time>
            </span>
            <span>
              Last updated:{' '}
              <time dateTime={profile.updatedAt}>
                {new Date(profile.updatedAt).toLocaleString()}
              </time>
            </span>
          </footer>
        )}

      </div>
    </div>
  );
}
