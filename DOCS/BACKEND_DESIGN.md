# Backend Design — Hostel Management & GatePass

**Stack:** Node.js 20+ · Express · PostgreSQL 15+ (node-pg / Prisma) · Socket.io · Razorpay · JWT (access+refresh) · Docker

Companion file: [`schema.sql`](./schema.sql) — all entities, enums, and indexes referenced below.

---

# 1. Architecture Overview

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Student App │  │ Warden App/ │  │ Guard App   │
│  (RN)       │  │  Web (React)│  │  (scanner)  │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │ REST/WS        │ REST/WS        │ REST (+offline queue)
       ▼                ▼                ▼
┌──────────────────────────────────────────────────────┐
│                 Express API (REST)                    │
│  auth · bookings · payments · gatepass · fees ·       │
│  messaging · admin · guard                            │
├──────────────────────────────────────────────────────┤
│               Socket.io Gateway                       │
│  rooms: hostel:{id} · user:{id} · guards:{hostelId}   │
├──────────────┬──────────────────┬─────────────────────┤
│  Services    │  Background Jobs │  External           │
│  (business   │  (node-cron /    │  Razorpay webhooks  │
│   logic)     │   BullMQ)        │  Email (SES)        │
├──────────────┴──────────────────┴─────────────────────┤
│              PostgreSQL (single source of truth)       │
└──────────────────────────────────────────────────────┘
```

**Design principles**
1. **DB enforces invariants** — race conditions (double-booking, double-pass) are stopped by partial unique indexes, not application checks.
2. **State machines only move forward via transition functions** — every status change writes a domain event row (`booking_events`, `scans`, `audit_logs`).
3. **WebSockets are a delivery layer, never the source of truth** — a client that misses a socket event resyncs via REST.
4. **Idempotency everywhere money or logs are touched** — `idempotency_key` on payments, `client_scan_id` on scans.

---

# 2. Project Structure

```
backend/
├── src/
│   ├── config/            # env, db pool, redis, razorpay client
│   ├── db/
│   │   ├── migrations/    # schema.sql + incremental migrations
│   │   └── repositories/  # one repo per aggregate (queries only, no logic)
│   ├── modules/
│   │   ├── auth/          # routes, controller, service
│   │   ├── users/
│   │   ├── hostels/       # hostels, floors, rooms, beds CRUD
│   │   ├── bookings/      # lock/release/pay/verify + round management
│   │   ├── payments/      # razorpay orders, webhook, receipts
│   │   ├── dues/          # dues, fines, disputes
│   │   ├── gatepass/      # requests, decisions, rules, holidays
│   │   ├── scans/         # guard scan sync, manual entries, offline queue
│   │   ├── messaging/     # conversations (extensions, disputes)
│   │   ├── notifications/ # push (FCM) + email (SES) fan-out
│   │   └── admin/         # import, data-integrity merge, RBAC, exports
│   ├── sockets/
│   │   ├── gateway.js     # auth middleware, room join logic
│   │   └── events.js      # emit helpers (typed payloads)
│   ├── jobs/
│   │   ├── lockExpiry.js      # every 30s: release expired soft locks
│   │   ├── verificationSweep.js # expire pending_assignment past deadline
│   │   ├── lateAlert.js       # every minute: grace-passed active passes
│   │   ├── paymentSweep.js    # stuck 'created' payments → Razorpay lookup
│   │   └── purge.js           # daily: profile purge (30-day rule)
│   ├── middleware/
│   │   ├── authenticate.js    # JWT verify
│   │   ├── authorize.js       # role + scope checks (see-permissions)
│   │   ├── validate.js        # zod request validation
│   │   └── audit.js           # audit_log writer helper
│   └── utils/
├── test/
├── Dockerfile
└── docker-compose.yml       # api + postgres + redis (local dev)
```

**Module anatomy** (every module follows this): `routes.js` → `controller.js` (HTTP in/out) → `service.js` (business logic, transactions) → `repository.js` (SQL).

---

# 3. Authentication & Sessions

| Aspect | Design |
|---|---|
| Access token | JWT, 15 min, claims: `sub`, `role`, `hostelIds[]` (wardens), `tokenVersion` |
| Refresh token | Opaque random, 7 days, **httpOnly Secure cookie**, rotated on every use; revocation = delete row |
| Passwords | argon2id hash |
| Guard login | Same flow; session implicitly defines "shift context" (login time → `scans.guard_id`) |
| Super Admin | Same + **TOTP MFA enforced** (speakeasy / otplib); no MFA → no token issue |
| Pending verification | `user.status` checked in auth middleware → token issued but with `restricted` scope (read-only profile only) |
| Biometrics | None in v1 |

**Permission scopes** (enforced in `authorize` middleware):
- `bookings:write` — student, active only
- `gatepass:approve` — warden AND student's `hostel_id ∈ warden's active assignments`
- `scans:write` — guard only
- `admin:*` — super_admin only

---

# 4. REST API Reference (v1)

Base: `/api/v1`. Auth: `Authorization: Bearer <access>`.

## 4.1 Auth
| Method | Endpoint | Who | Notes |
|---|---|---|---|
| POST | `/auth/login` | all | rate-limited 5/min/IP |
| POST | `/auth/register` | public | creates `pending_verification` |
| POST | `/auth/refresh` | all | cookie-based rotation |
| POST | `/auth/logout` | all | revokes refresh |
| POST | `/auth/mfa/verify` | super_admin | TOTP step |
| POST | `/auth/forgot-password` · `/auth/reset-password` | all | token email |

## 4.2 Student — Beds & Bookings
| Method | Endpoint | Notes |
|---|---|---|
| GET | `/beds/availability?hostelId&floorId` | grid payload: rooms → beds + status + countdown |
| GET | `/booking-rounds/current` | active round + fee for student's target |
| POST | `/bookings` | body: `bedId`, `roommatePreference?` → creates soft lock (10 min). **DB unique indexes are the race guard** |
| POST | `/bookings/:id/extend-lock` | once only, if payment in progress/failed |
| DELETE | `/bookings/:id` | student releases own lock |
| GET | `/bookings/mine` | current + history |
| POST | `/bookings/:id/change-bed` | **room-change window only**: releases + rebooks in one tx |
| POST | `/bookings/:id/vacate` | starts vacate request → warden approval |

## 4.3 Payments & Dues
| Method | Endpoint | Notes |
|---|---|---|
| POST | `/payments/order` | body: `bookingId` or `dueId`, `idempotencyKey` → Razorpay order |
| POST | `/payments/verify` | checkout return: signature verify → mark captured → generate receipt PDF → emit `bed:unlock` / due paid |
| GET | `/payments/mine` | history + receipts |
| GET | `/dues/mine` | hostel fees, fines, deposits |

**Webhook:** `POST /webhooks/razorpay` (raw body signature verify) — handles `payment.captured` / `payment.failed` async settlements; idempotent on `razorpay_payment_id`.

## 4.4 Gatepass
| Method | Endpoint | Who | Notes |
|---|---|---|---|
| POST | `/gatepasses` | student | only when pass required (rules engine) or anytime-if-forced |
| GET | `/gatepasses/mine` | student | |
| GET | `/gatepasses/:id/qr` | student | returns signed JWT (cache on device) |
| POST | `/gatepasses/:id/cancel` | student | own, only if not `active` |
| GET | `/gatepasses/queue?status` | warden | **all hostels visible** |
| POST | `/gatepasses/:id/decision` | warden | approve (may modify return time) / reject; approval mints QR (`qr_jti`, `version=1`) |
| POST | `/gatepasses/:id/extension` | student | off-campus request → `extension_requested` |
| POST | `/gatepasses/:id/extension/decision` | warden | new return time → bump `version` (old JWT dies), recalc alert clock |
| GET | `/gatepass-rules` · PUT | super_admin | per-hostel day-class rules + holidays CRUD |

## 4.5 Guard (Scanner)
| Method | Endpoint | Notes |
|---|---|---|
| POST | `/guard/scan` | sync endpoint: batch of queued scans `{clientScanId, gatepassJwt, direction, scannedAt, gate, manual?}` → server validates (signature, `qr_jti` revocation, version, window, **anti-replay**) → inserts `scans` rows → returns verdicts → broadcasts |
| GET | `/guard/lookup/:rollNumber` | dead-phone fallback: photo + live passes |
| POST | `/guard/manual-entry` | reason code **required**; warden auto-notified; `is_manual_action` audit |
| GET | `/guard/sync-status` | pending queue acknowledgment |

> Guard devices **validate the JWT locally first** (instant green/red), then the `/guard/scan` sync is authoritative. Conflicts (e.g., cancelled pass scanned offline) → `sync_status='conflict'` → flagged to warden.

## 4.6 Warden
| Method | Endpoint | Notes |
|---|---|---|
| GET | `/warden/students?hostelId` | roster of assigned students |
| POST | `/bookings/:id/verify` | physical verification → `assigned` (checks system payment badge) |
| POST | `/bookings/:id/vacate-approve` | releases bed |
| GET | `/warden/bookings/pending` | pending_assignment queue for their hostels |
| POST | `/dues` | levy fine (own hostel students) |
| POST | `/dues/:id/waive` (admin) | |
| POST | `/dues/:id/dispute/respond` | dispute resolution |
| PUT | `/warden/alert-prefs` | grace minutes, criteria customization |

## 4.7 Messaging
| Method | Endpoint | Notes |
|---|---|---|
| GET | `/conversations` · POST `/conversations` | subject: extension / fine_dispute |
| GET | `/conversations/:id/messages` · POST | simple threaded chat; unread counts |

## 4.8 Super Admin
| Method | Endpoint | Notes |
|---|---|---|
| POST | `/admin/users/import` | CSV/Excel bulk roster; duplicate pre-check vs unique keys |
| GET | `/admin/users/pending` · POST `/admin/users/:id/approve` | |
| GET | `/admin/duplicates` · POST `/admin/users/merge` · `/admin/users/:id/delete` | Data Integrity module — **merge consolidates logs/fees; permanent audit** |
| POST | `/admin/booking-rounds` · `/admin/fee-structures` | open rounds; room-type pricing |
| POST | `/admin/warden-assignments` | date-ranged, acting flag |
| GET | `/admin/audit-logs?entityType&entityId` | filterable; manual actions never purged |
| GET | `/admin/export/scans` · `/admin/export/payments` | CSV export (audited) |
| CRUD | `/admin/hostels · /floors · /rooms · /beds` | inventory & floor plans |
| POST | `/admin/gatepass-rules` · `/admin/holidays` | enforcement schedule |

---

# 5. WebSocket Event Catalog

Connection: JWT-authenticated. Rooms: `user:{id}`, `hostel:{hostelId}` (wardens), `guards:{hostelId}`.

| Event (server →) | Payload | Recipients |
|---|---|---|
| `bed:lock` / `bed:unlock` | `{bedId, roomId, status, lockExpiresAt}` | all clients viewing that grid |
| `bed:assigned` | `{bedId, roomId}` | grid + student |
| `grid:invalidate` | `{hostelId, floorId}` | coarse resync signal |
| `gatepass:new` | `{gatepassId, student, hostelId, times}` | wardens of hostel |
| `gatepass:decided` | `{gatepassId, status, approvedReturnAt}` | student |
| `gatepass:revoked` | `{gatepassId, qrJti}` | guards of hostel (offline revocation list) |
| `scan:result` | `{gatepassId, verdict, student{photo,name,room}}` | scanning guard device |
| `alert:late` | `{gatepassId, student, minutesLate}` | wardens + super admin |
| `extension:requested` / `extension:decided` | `{gatepassId, newReturnAt?}` | warden / student |
| `notification:new` | `{type, title, body, data}` | user |
| `payment:status` | `{paymentId, status, receiptUrl?}` | student |
| `lock:countdown` | `{bookingId, secondsLeft}` | student (T-2min warning, also via push) |

Client → server: `grid:subscribe {hostelId, floorId}`, `grid:unsubscribe`.

---

# 6. Background Jobs

| Job | Schedule | Behavior |
|---|---|---|
| `lockExpiry` | every 30s | `lock_expires_at < now()` and no captured payment → release bed + booking (`released`), emit `bed:unlock`, notify student |
| `verificationSweep` | hourly | `pending_assignment` past round's `verification_deadline` → `expired`, bed released (no refund — policy) |
| `lateAlert` | every minute | `active` passes where `now() > approved_return_at + grace` and no entry scan → emit `alert:late` (warden-configurable grace, no auto-action) |
| `paymentSweep` | every 5 min | payments stuck `created` > 15 min → Razorpay Orders API lookup → reconcile or fail |
| `qrExpiry` | hourly | `returned` passes: hard-expire QR at `qr_expires_at` (return + 60 min) |
| `purge` | daily 02:00 | profiles past 30-day departure → anonymize + delete; manual audit rows (`is_manual_action`) never touched |
| `reminders` | daily 09:00 | dues due in 48h → push + email |

---

# 7. Key Transaction Flows

### 7.1 Bed lock (concurrency-proof)
```sql
BEGIN;
-- partial unique indexes guarantee: 1 active booking/student, 1 active holder/bed
UPDATE beds SET status='soft_locked', current_booking_id=$1 WHERE id=$2 AND status='available';
-- if rowcount=0 → bed taken between check and write → 409 to client
INSERT INTO bookings (...) VALUES (...);
INSERT INTO booking_events (..., 'system', {locked: true});
COMMIT;
-- after commit: socket emit bed:lock
```

### 7.2 Payment capture (webhook path)
```
payment.captured webhook (idempotent on razorpay_payment_id)
  → tx: payment → captured; due → paid; booking → pending_assignment
  → generate receipt PDF → S3
  → emit payment:status + bed:lock (hold continues until warden verifies)
```

### 7.3 Scan validation (server-authoritative)
```
/guard/scan batch → per scan:
  1. idempotent insert via (device_id, client_scan_id) — retries safe
  2. verify JWT signature + qr_jti not revoked + version current + now ∈ valid window
  3. anti-replay: existing scan same gatepass+direction with scanned_at within window → replay_flagged
  4. state transition: approved → active (exit) / active → returned (entry; qr_expires_at = now+60min)
  5. emit scan:result to guard + update warden dashboards
```

---

# 8. Security Notes

- **scans table**: app DB role granted INSERT/SELECT only — immutability enforced by grants, not convention.
- **JWT secret** per environment; `qr_secret_version` allows global gatepass invalidation (key leak drill).
- **Razorpay webhook**: raw-body HMAC verification; reject replays via timestamp window.
- **Rate limits**: login 5/min/IP; scan sync 60/min/device; booking endpoints 20/min/user.
- **Photo access**: S3 pre-signed URLs, short TTL; guard app caches with encrypted storage.
- **Exports**: every `/admin/export/*` call writes an `audit_logs` row (who, what filter, when).

---

# 9. Environment / Config

```env
DATABASE_URL=postgres://...
REDIS_URL=redis://...          # socket.io adapter + job queue
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
QR_JWT_SECRET=...              # separate from auth JWT
RAZORPAY_KEY_ID / KEY_SECRET / WEBHOOK_SECRET
AWS_S3_BUCKET / SES credentials
FCM_SERVER_KEY               # push
```

**docker-compose** (dev): `api`, `postgres:15`, `redis:7`, `migrate` (one-shot).

---

# 10. Testing Checklist (backend)

- [ ] 500 concurrent locks on same bed → exactly 1 succeeds (partial unique index proof)
- [ ] Double webhook delivery → single state transition (idempotency)
- [ ] Offline scan queue → batch sync → no duplicates on retry (client_scan_id)
- [ ] Cancelled pass scanned offline → `conflict` + warden flag
- [ ] Lock TTL expiry while payment in-flight → single extension honored, then release
- [ ] Extension bumps `version` → old QR JWT rejected
- [ ] Warden A (Hostel 1) attempts approving Hostel 2 pass → 403
- [ ] Acting warden assignment expires → approvals rejected automatically
- [ ] Razorpay signature failure → 400, no state change
