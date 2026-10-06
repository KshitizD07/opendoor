-- ============================================================================
-- Hostel Management & GatePass — PostgreSQL Schema v1
-- Targets: PostgreSQL 15+
-- Conventions: uuid PKs (gen_random_uuid), timestamptz everywhere,
-- money as integer paise/cents (NEVER float), soft-delete avoided — use status.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- ENUMS (state machines — the SRS v2 state machines live here)
-- ============================================================================

CREATE TYPE user_role          AS ENUM ('student', 'warden', 'guard', 'super_admin');
CREATE TYPE user_status        AS ENUM ('pending_verification', 'active', 'suspended', 'departed');

CREATE TYPE hostel_type        AS ENUM ('boys', 'girls');

CREATE TYPE room_type          AS ENUM ('double', 'triple');

-- Bed lifecycle: available → soft_locked → pending_assignment → assigned
CREATE TYPE bed_status         AS ENUM ('available', 'soft_locked', 'pending_assignment', 'assigned', 'blocked');
-- 'blocked' = admin-side hold (renovation, quarantine, etc.)

CREATE TYPE booking_status     AS ENUM ('soft_locked', 'payment_pending', 'pending_assignment', 'assigned', 'released', 'expired', 'cancelled');
-- released   = let go by student / payment never came
-- expired    = verification window passed without warden confirmation
-- cancelled  = admin/warden cancelled (with audit reason)

CREATE TYPE round_type         AS ENUM ('semester', 'room_change');

CREATE TYPE payment_status     AS ENUM ('created', 'authorized', 'captured', 'failed', 'refunded');
CREATE TYPE payment_purpose    AS ENUM ('hostel_fee', 'misc_due');

CREATE TYPE due_type           AS ENUM ('hostel_fee', 'fine', 'deposit', 'other');
CREATE TYPE due_status         AS ENUM ('pending', 'paid', 'waived', 'void');

CREATE TYPE gatepass_status    AS ENUM
  ('pending', 'approved', 'active', 'returned', 'rejected',
   'expired', 'cancelled', 'no_show', 'extension_requested');
-- pending   → warden decides
-- approved  → QR live, student not yet exited
-- active    → exit scan done, awaiting return
-- returned  → entry scan done (QR dies 60 min later)
-- extension_requested → warden deciding on new return time

CREATE TYPE scan_direction     AS ENUM ('exit', 'entry');
CREATE TYPE scan_mode          AS ENUM ('qr', 'manual');
CREATE TYPE scan_sync_status   AS ENUM ('pending', 'synced', 'conflict');

CREATE TYPE notification_channel AS ENUM ('push', 'email', 'both');
CREATE TYPE conv_subject_type  AS ENUM ('gatepass_extension', 'fine_dispute', 'general');

-- ============================================================================
-- 1. IDENTITY & HOSTEL STRUCTURE
-- ============================================================================

CREATE TABLE universities (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hostels (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id   uuid NOT NULL REFERENCES universities(id),
    name            text NOT NULL,
    type            hostel_type NOT NULL,
    address         text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (university_id, name)
);

CREATE TABLE floors (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hostel_id       uuid NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    floor_number    int  NOT NULL CHECK (floor_number > 0),
    UNIQUE (hostel_id, floor_number)
);

CREATE TABLE rooms (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_id        uuid NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    hostel_id       uuid NOT NULL REFERENCES hostels(id),          -- denormalized for fast filtering
    room_number     text NOT NULL,
    type            room_type NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (floor_id, room_number)
);

CREATE TABLE beds (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id         uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    hostel_id       uuid NOT NULL REFERENCES hostels(id),          -- denormalized
    label           text NOT NULL,                                  -- e.g. 'A', 'B', 'C'
    status          bed_status NOT NULL DEFAULT 'available',
    current_booking_id uuid,                                        -- set when soft_locked/pending_assignment/assigned
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (room_id, label)
);

-- Partial unique index: a bed can have at most ONE active holder.
-- This is the database-level guarantee against double-booking races.
CREATE UNIQUE INDEX one_active_booking_per_bed
    ON beds (id) WHERE status IN ('soft_locked', 'pending_assignment', 'assigned');

CREATE TABLE users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id   uuid NOT NULL REFERENCES universities(id),
    roll_number     text NOT NULL,                                -- unique per university
    email           citext NOT NULL,
    phone           text,
    full_name       text NOT NULL,
    password_hash   text NOT NULL,
    role            user_role  NOT NULL,
    status          user_status NOT NULL DEFAULT 'pending_verification',
    photo_url       text,                                         -- from admin bulk import only
    gender          text,
    hostel_id       uuid REFERENCES hostels(id),                  -- assigned hostel (set on assignment)
    room_id         uuid REFERENCES rooms(id),
    bed_id          uuid REFERENCES beds(id),
    -- password reset / verification
    reset_token_hash text,
    reset_expires_at timestamptz,
    -- departure / purge tracking
    departed_at     timestamptz,
    purge_after     timestamptz,                                  -- departed_at + 30 days
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (university_id, roll_number),
    UNIQUE (university_id, email)
);

CREATE INDEX users_status_idx   ON users (status) WHERE status = 'pending_verification';
CREATE INDEX users_hostel_idx   ON users (hostel_id);

-- Warden ↔ hostel: date-ranged, supports acting wardens & multi-hostel wardens
CREATE TABLE warden_hostel_assignments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    warden_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hostel_id       uuid NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    start_date      date NOT NULL,
    end_date        date NOT NULL,
    is_acting       boolean NOT NULL DEFAULT false,               -- true = temporary leave coverage
    assigned_by     uuid NOT NULL REFERENCES users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date)
);

CREATE INDEX wha_warden_idx ON warden_hostel_assignments (warden_id);
CREATE INDEX wha_hostel_idx ON warden_hostel_assignments (hostel_id);
CREATE INDEX wha_active_idx ON warden_hostel_assignments (warden_id, hostel_id)
    WHERE end_date >= CURRENT_DATE;  -- note: evaluated at query time, app enforces date logic

-- ============================================================================
-- 2. BOOKING ROUNDS, FEE STRUCTURES, BOOKINGS
-- ============================================================================

CREATE TABLE booking_rounds (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type                    round_type NOT NULL,
    name                    text NOT NULL,                        -- "Fall 2026 Allotment"
    starts_at               timestamptz NOT NULL,
    ends_at                 timestamptz NOT NULL,
    verification_deadline   timestamptz NOT NULL,                 -- pending_assignment must clear by then
    collect_payment         boolean NOT NULL DEFAULT true,        -- false for room_change rounds
    is_payment_step_required boolean NOT NULL DEFAULT true,       -- room_change: false (no-op)
    created_by              uuid NOT NULL REFERENCES users(id),
    created_at              timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at),
    CHECK (verification_deadline >= ends_at)
);

CREATE TABLE fee_structures (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id        uuid NOT NULL REFERENCES booking_rounds(id) ON DELETE CASCADE,
    hostel_id       uuid NOT NULL REFERENCES hostels(id),
    room_type       room_type NOT NULL,
    amount_paise    bigint NOT NULL CHECK (amount_paise > 0),
    UNIQUE (round_id, hostel_id, room_type)
);

CREATE TABLE bookings (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id                uuid NOT NULL REFERENCES booking_rounds(id),
    student_id              uuid NOT NULL REFERENCES users(id),
    hostel_id               uuid NOT NULL REFERENCES hostels(id),     -- denormalized
    bed_id                  uuid NOT NULL REFERENCES beds(id),
    roommate_preference     text,                                   -- free-text roll number / name
    status                  booking_status NOT NULL DEFAULT 'soft_locked',
    locked_at               timestamptz NOT NULL DEFAULT now(),
    lock_expires_at         timestamptz NOT NULL,                   -- locked_at + 10 min (+ one 10-min extension)
    lock_extended_once      boolean NOT NULL DEFAULT false,
    payment_id              uuid,                                   -- set when payment succeeds
    assigned_at             timestamptz,
    verified_by             uuid REFERENCES users(id),              -- warden who flipped to assigned
    verification_note       text,
    released_at             timestamptz,
    release_reason          text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

-- One active booking per student (partial unique — enforced at DB).
CREATE UNIQUE INDEX one_active_booking_per_student
    ON bookings (student_id)
    WHERE status IN ('soft_locked', 'payment_pending', 'pending_assignment', 'assigned');

CREATE INDEX bookings_bed_idx    ON bookings (bed_id);
CREATE INDEX bookings_round_idx  ON bookings (round_id, status);
CREATE INDEX bookings_expiry_idx ON bookings (lock_expires_at)
    WHERE status IN ('soft_locked', 'payment_pending');

-- Bed.current_booking_id FK added after bookings exists:
ALTER TABLE beds
    ADD CONSTRAINT beds_current_booking_fk
    FOREIGN KEY (current_booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

-- Full transition history (who did what, when, from→to)
CREATE TABLE booking_events (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id      uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    from_status     booking_status,
    to_status       booking_status NOT NULL,
    actor_id        uuid REFERENCES users(id),                    -- NULL = system job
    actor_label     text NOT NULL DEFAULT 'system',               -- 'system', 'razorpay-webhook', user name snapshot
    meta            jsonb NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_events_booking_idx ON booking_events (booking_id, created_at);

-- ============================================================================
-- 3. PAYMENTS (Razorpay) & DUES
-- ============================================================================

CREATE TABLE payments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          uuid NOT NULL REFERENCES users(id),
    due_id              uuid,                                     -- filled when linked to a due
    purpose             payment_purpose NOT NULL,
    amount_paise        bigint NOT NULL CHECK (amount_paise > 0),
    currency            char(3) NOT NULL DEFAULT 'INR',
    status              payment_status NOT NULL DEFAULT 'created',
    -- Razorpay fields
    razorpay_order_id   text UNIQUE,
    razorpay_payment_id text UNIQUE,
    razorpay_signature  text,
    method              text,                                     -- upi | card | netbanking (from webhook)
    receipt_url         text,                                     -- generated PDF in S3
    failure_reason      text,
    -- idempotency: client-generated key so retried clicks never double-charge
    idempotency_key     text UNIQUE,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payments_student_idx ON payments (student_id, created_at DESC);
CREATE INDEX payments_status_idx  ON payments (status) WHERE status = 'created'; -- stuck-payment sweeper

CREATE TABLE dues (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      uuid NOT NULL REFERENCES users(id),
    type            due_type NOT NULL,
    description     text NOT NULL,
    amount_paise    bigint NOT NULL CHECK (amount_paise > 0),
    due_date        date,
    status          due_status NOT NULL DEFAULT 'pending',
    booking_id      uuid REFERENCES bookings(id),                 -- hostel_fee dues tied to booking
    created_by      uuid NOT NULL REFERENCES users(id),
    dispute_status  text,                                         -- NULL | 'open' | 'resolved'
    resolved_by     uuid REFERENCES users(id),
    resolved_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dues_student_idx ON dues (student_id, status);

CREATE TABLE due_payments (                                       -- many-to-many: one payment can cover multiple dues
    due_id      uuid NOT NULL REFERENCES dues(id) ON DELETE CASCADE,
    payment_id  uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    amount_paise bigint NOT NULL CHECK (amount_paise > 0),
    PRIMARY KEY (due_id, payment_id)
);

-- ============================================================================
-- 4. GATEPASS SYSTEM
-- ============================================================================

-- Enforcement schedule: global row (hostel_id NULL) + per-hostel overrides.
-- Semantics per SRS: pass REQUIRED after 18:00 on weekdays; required ALL DAY
-- on weekends/holidays. Modelled as "pass-free window" per day class.
CREATE TYPE day_class AS ENUM ('weekday', 'weekend', 'holiday');

CREATE TABLE gatepass_rules (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hostel_id       uuid REFERENCES hostels(id) ON DELETE CASCADE,  -- NULL = university-wide default
    day_class       day_class NOT NULL,
    -- Pass-free window: outside this window a pass is required. NULLs = pass required all day.
    pass_free_from  time,                                           -- e.g. 08:00
    pass_free_to    time,                                           -- e.g. 18:00
    updated_by      uuid REFERENCES users(id),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (hostel_id, day_class)
);

CREATE TABLE holidays (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    date        date NOT NULL,
    name        text NOT NULL,
    hostel_id   uuid REFERENCES hostels(id) ON DELETE CASCADE,      -- NULL = university-wide
    created_by  uuid NOT NULL REFERENCES users(id),
    UNIQUE (date, hostel_id)
);

CREATE TABLE gatepasses (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          uuid NOT NULL REFERENCES users(id),
    hostel_id           uuid NOT NULL REFERENCES hostels(id),       -- student's home hostel
    reason              text NOT NULL,
    expected_exit_at    timestamptz NOT NULL,
    expected_return_at  timestamptz NOT NULL,
    -- warden decision
    approved_return_at  timestamptz,                                -- warden may modify; NULL until decided
    status              gatepass_status NOT NULL DEFAULT 'pending',
    decided_by          uuid REFERENCES users(id),
    decided_at          timestamptz,
    decision_note       text,
    -- QR / token
    qr_jti              uuid UNIQUE DEFAULT gen_random_uuid(),      -- JWT ID: revocation + anti-replay
    qr_secret_version   int NOT NULL DEFAULT 1,                     -- bump to mass-invalidate
    valid_from          timestamptz,                                -- = decided_at on approval
    valid_until         timestamptz,                                -- = approved_return_at + grace
    qr_expires_at       timestamptz,                                -- return scan + 60 min (set on entry scan)
    extension_grace_minutes int,                                    -- warden-customizable; default 30
    version             int NOT NULL DEFAULT 1,                     -- bumps on extension (JWT invalidation)
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (expected_return_at > expected_exit_at)
);

CREATE INDEX gatepass_queue_idx  ON gatepasses (status, hostel_id) WHERE status IN ('pending', 'extension_requested');
CREATE INDEX gatepass_student_idx ON gatepasses (student_id, created_at DESC);
CREATE INDEX gatepass_active_idx ON gatepasses (student_id)
    WHERE status IN ('approved', 'active', 'extension_requested');  -- one live pass per student
-- Enforce it:
CREATE UNIQUE INDEX one_live_gatepass_per_student
    ON gatepasses (student_id)
    WHERE status IN ('approved', 'active', 'extension_requested');

-- IMMUTABLE security log. Append-only by policy (no UPDATE/DELETE grants for app role).
CREATE TABLE scans (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gatepass_id     uuid REFERENCES gatepasses(id),                 -- NULL for manual entries w/o pass
    student_id      uuid NOT NULL REFERENCES users(id),
    direction       scan_direction NOT NULL,
    scanned_at      timestamptz NOT NULL DEFAULT now(),
    gate_name       text NOT NULL,
    guard_id        uuid NOT NULL REFERENCES users(id),
    mode            scan_mode NOT NULL DEFAULT 'qr',
    -- offline sync fields
    device_id       text NOT NULL,
    client_scan_id  text NOT NULL,                                  -- idempotency: unique per device scan
    sync_status     scan_sync_status NOT NULL DEFAULT 'synced',
    synced_at       timestamptz,
    -- anti-replay server verdict at sync time
    replay_flagged  boolean NOT NULL DEFAULT false,
    -- manual fallback
    manual_reason   text,
    manual_warden_notified boolean NOT NULL DEFAULT false,
    UNIQUE (device_id, client_scan_id)                              -- offline retries never double-log
);

CREATE INDEX scans_student_idx   ON scans (student_id, scanned_at DESC);
CREATE INDEX scans_gatepass_idx  ON scans (gatepass_id, scanned_at);
CREATE INDEX scans_pending_idx   ON scans (sync_status) WHERE sync_status = 'pending';

-- ============================================================================
-- 5. MESSAGING (extension requests & fine disputes)
-- ============================================================================

CREATE TABLE conversations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      uuid NOT NULL REFERENCES users(id),
    warden_id       uuid NOT NULL REFERENCES users(id),
    subject_type    conv_subject_type NOT NULL,
    subject_id      uuid,                                           -- gatepass_id or due_id
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       uuid NOT NULL REFERENCES users(id),
    body            text NOT NULL,
    sent_at         timestamptz NOT NULL DEFAULT now(),
    read_at         timestamptz
);

CREATE INDEX messages_conv_idx ON messages (conversation_id, sent_at);

-- ============================================================================
-- 6. NOTIFICATIONS
-- ============================================================================

CREATE TABLE notifications (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            text NOT NULL,                                  -- e.g. 'gatepass.approved'
    title           text NOT NULL,
    body            text NOT NULL,
    channel         notification_channel NOT NULL,
    data            jsonb NOT NULL DEFAULT '{}',
    sent_at         timestamptz NOT NULL DEFAULT now(),
    read_at         timestamptz
);

CREATE INDEX notifications_user_idx ON notifications (user_id, sent_at DESC);

-- ============================================================================
-- 7. AUDIT LOG (separate from domain logs — retention 10y / permanent for manual)
-- ============================================================================

CREATE TABLE audit_logs (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id        uuid REFERENCES users(id),                      -- NULL = system
    actor_role      user_role,
    actor_name      text,                                           -- snapshot (survives profile purge)
    action          text NOT NULL,                                  -- e.g. 'bed.assign', 'profile.merge'
    entity_type     text NOT NULL,                                  -- 'booking' | 'gatepass' | 'user' ...
    entity_id       text NOT NULL,
    before_json     jsonb,
    after_json     jsonb,
    is_manual_action boolean NOT NULL DEFAULT false,                -- true → NEVER purged (permanent)
    ip_address      inet,
    user_agent      text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_entity_idx ON audit_logs (entity_type, entity_id, created_at);
CREATE INDEX audit_actor_idx  ON audit_logs (actor_id, created_at);
CREATE INDEX audit_manual_idx ON audit_logs (created_at) WHERE is_manual_action;

-- ============================================================================
-- 8. SYSTEM / RETENTION
-- ============================================================================

-- Purge tracking: profiles auto-purged 30 days after departure
CREATE TABLE purge_queue (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         uuid NOT NULL,
    purge_after     timestamptz NOT NULL,
    purged_at       timestamptz,
    purged_by       text NOT NULL DEFAULT 'system'
);

CREATE INDEX purge_queue_due_idx ON purge_queue (purge_after) WHERE purged_at IS NULL;

-- ============================================================================
-- HELPER: updated_at trigger (applied to mutable tables)
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated      BEFORE UPDATE ON users      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_beds_updated       BEFORE UPDATE ON beds       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bookings_updated   BEFORE UPDATE ON bookings   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payments_updated   BEFORE UPDATE ON payments   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_dues_updated       BEFORE UPDATE ON dues       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_gatepasses_updated BEFORE UPDATE ON gatepasses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
