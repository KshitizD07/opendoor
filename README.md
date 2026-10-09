# 🚪 Opendoor — Hostel Management & GatePass System

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/framework-Express_4.x-blue.svg)](https://expressjs.com/)
[![Database](https://img.shields.io/badge/database-PostgreSQL_15%2B-blue.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/license-ISC-lightgrey.svg)](LICENSE)

**Opendoor** is a modern, enterprise-grade **Hostel Management and GatePass Platform** designed for university campuses. It automates end-to-end residential life operations across four core personas: **Students**, **Wardens**, **Security Guards**, and **Super Admins**.

---

## 📑 Table of Contents

- [Core Capabilities by Role](#-core-capabilities-by-role)
- [Key Engineering & Security Highlights](#-key-engineering--security-highlights)
- [Tech Stack & Architecture](#-tech-stack--architecture)
- [Project Directory Structure](#-project-directory-structure)
- [Getting Started (Local Development)](#-getting-started-local-development)
- [Environment Variables](#-environment-variables)
- [API Health Check & Endpoints](#-api-health-check--endpoints)
- [Architecture & Design Documents](#-architecture--design-documents)
- [Work Logging Protocol](#-work-logging-protocol)
- [Implementation Roadmap](#-implementation-roadmap)

---

## 👥 Core Capabilities by Role

### 🎓 1. Students
- **Visual Bed Booking**: Interactive room & bed selection with concurrency-safe 10-minute soft-locks.
- **Digital GatePass**: Automated exit/entry requests with signed offline-ready QR codes.
- **Dues & Payments**: Seamless hostel fee, deposit, and fine payments via Razorpay with instant receipt generation.
- **In-App Messaging & Extensions**: Direct request threads for pass extensions and fine disputes.

### 🛡️ 2. Wardens
- **Student Verification**: Final in-person check-in verification before bed occupancy.
- **GatePass Management Queue**: Real-time pass approval dashboard with custom return times and late-return alerts.
- **Dues & Fines**: Levying damage fines, handling dispute resolution, and reviewing waiver requests.
- **Hostel Oversight**: Live student occupancy rosters scoped strictly to assigned hostels.

### 👮 3. Security Guards
- **High-Speed QR Scanner**: Instant green/red gate pass validation using cryptographically signed JWT payloads.
- **Offline Sync Queue**: Resilient gate scanning with automatic batch synchronization when network connectivity drops.
- **Dead-Phone Fallback**: Roll-number photo and status lookup for dead/forgotten student devices.
- **Anti-Replay Protection**: Prevents double-exit or reused expired QR passes.

### ⚙️ 4. Super Admins
- **Inventory Management**: University, hostel, floor, room, and bed configuration.
- **Roster Ingestion & Integrity**: Bulk student CSV/Excel import with duplicate conflict resolution and permanent audit history.
- **Booking Rounds**: Semester allocation rounds and room-change configuration.
- **High-Security TOTP 2FA**: Mandatory Google Authenticator 2-Factor Authentication for all administrative actions.

---

## 🔐 Key Engineering & Security Highlights

```
┌────────────────────────────────────────────────────────────────────────┐
│                        OPENDOOR CORE PILLARS                           │
├──────────────────┬──────────────────┬──────────────────┬───────────────┤
│ Concurrency-Safe │ Cryptographic QR │ Dual-Token Auth  │ Database-     │
│ Soft-Locks (10m) │ JWT GatePasses   │ & Argon2id + 2FA │ Enforced Rules│
└──────────────────┴──────────────────┴──────────────────┴───────────────┘
```

1. **Concurrency-Proof Bed Allocation**: Database-enforced partial unique indexes prevent double-booking collisions under high traffic.
2. **Offline-Ready GatePass QR**: JWTs signed with `QR_JWT_SECRET` embed `qr_jti`, student ID, validity window, and version numbers.
3. **Enterprise Authentication**:
   - **Argon2id** password hashing.
   - **15-minute Access Tokens** (JWT in memory).
   - **7-day Refresh Tokens** (Opaque random hex strings, SHA-256 hashed in DB, stored in `httpOnly` secure cookies with automatic rotation).
   - **TOTP MFA** using standard RFC 6238 time-based tokens for Super Admins.
4. **Real-time Synchronization**: Socket.io event gateway for live bed grid locks, late gatepass alarms, and instant status updates.
5. **Background Sweeper Schedulers**: Automated cron jobs for soft-lock expirations, overdue gatepass flags, and payment reconciliation.

---

## 🛠️ Tech Stack & Architecture

- **Runtime**: Node.js (v20+ LTS) with ES Modules (`"type": "module"`)
- **Web Framework**: Express 4.x
- **Security**: Helmet, CORS, Argon2id, JSON Web Tokens (`jsonwebtoken`), `otplib` (TOTP 2FA)
- **Validation**: Zod (Fail-fast runtime schema validation)
- **Database (Target)**: PostgreSQL 15+ (`pg` connection pool with pure SQL repositories)
- **Real-Time Gateway**: Socket.io
- **Background Jobs**: Node-cron / Worker sweepers
- **Payment Processing**: Razorpay (HMAC SHA-256 webhook verification)

---

## 📁 Project Directory Structure

The backend follows a **domain-driven, feature-based modular architecture**:

```
opendoor/
├── DOCS/                              # Architectural blueprints & SQL schemas
│   ├── BACKEND_DESIGN.md              # REST API reference, WebSockets, & jobs
│   ├── schema.sql                     # PostgreSQL schema DDL, enums, indexes
│   └── Hostel_Management_GatePass_SRS_v2.pdf
├── logs/                              # Daily session logs & architectural records
│   ├── instruction.txt                # Logging protocol guidelines
│   └── backend/                       # Dated task logs
└── server/                            # Node.js Express Backend
    ├── .env.example                   # Environment configuration template
    ├── package.json
    └── src/
        ├── app.js                     # Express app, security middleware & routes
        ├── server.js                  # HTTP server & graceful shutdown handlers
        ├── config/                    # Zod-validated environment config
        ├── middleware/                # Error handler, validate, authenticate, authorize
        ├── modules/                   # Domain Modules (Feature-based)
        │   ├── admin/                 # Bulk roster import, duplicate merge, audit
        │   ├── auth/                  # Login, registration, token refresh, TOTP MFA
        │   ├── bookings/              # Bed soft-locks, room-change, rounds
        │   ├── dues/                  # Fee dues, fines, dispute resolution
        │   ├── gatepass/              # Pass issuance, rules engine, QR minting
        │   ├── hostels/               # Hostels, floors, rooms, beds inventory
        │   ├── messaging/             # In-app chat threads
        │   ├── notifications/         # FCM push & SES email dispatchers
        │   ├── payments/              # Razorpay orders, webhooks, receipts
        │   ├── scans/                 # Guard offline sync, anti-replay validation
        │   └── users/                 # Profiles & warden assignments
        ├── sockets/                   # Socket.io gateway & event catalog
        ├── jobs/                      # Background cron sweeper jobs
        └── utils/                     # AppError, logger, response helpers, crypto
```

---

## 🚀 Getting Started (Local Development)

### Prerequisites
- [Node.js](https://nodejs.org/) v20.x or higher
- [npm](https://www.npmjs.com/) v10.x or higher
- [Git](https://git-scm.com/)

### 1. Clone & Navigate
```bash
git clone https://github.com/your-username/opendoor.git
cd opendoor/server
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Environment Variables
Create your local `.env` file from the template:
```bash
cp .env.example .env
```

### 4. Start the Development Server
```bash
npm run dev
```
The server will start at: `http://localhost:5000`

---

## ⚙️ Environment Variables

Key configuration variables in `server/.env`:

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | API Server listening port | `5000` |
| `NODE_ENV` | Application environment | `development` |
| `CLIENT_URL` | Frontend URL for CORS configuration | `http://localhost:3000` |
| `JWT_ACCESS_SECRET` | Secret key for access JWT tokens (min 16 chars) | `your_access_secret_here` |
| `JWT_REFRESH_SECRET` | Secret key for refresh tokens (min 16 chars) | `your_refresh_secret_here` |
| `QR_JWT_SECRET` | Secret key for gatepass QR tokens | `your_qr_jwt_secret_here` |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifespan | `15m` |
| `JWT_REFRESH_EXPIRES_IN_DAYS`| Refresh token lifespan | `7` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/opendoor` |
| `RAZORPAY_KEY_ID` | Razorpay API Key ID | `rzp_test_...` |
| `RAZORPAY_KEY_SECRET` | Razorpay Secret Key | `...` |

---

## 📡 API Health Check & Endpoints

- **Root Route**: `GET /` → Returns API metadata and version.
- **Health Check**: `GET /api/v1/health`
  ```json
  {
    "success": true,
    "message": "Opendoor API is running",
    "data": {
      "status": "healthy",
      "timestamp": "2026-10-09T18:00:00.000Z",
      "env": "development",
      "uptime": "42s"
    },
    "error": null
  }
  ```

---

## 📚 Architecture & Design Documents

For deep-dive specifications, refer to the documentation in [`DOCS/`](file:///C:/Users/kshit/cs/project/opendoor/DOCS):
- **[BACKEND_DESIGN.md](DOCS/BACKEND_DESIGN.md)**: Full REST API route catalog, WebSocket event specs, background sweepers, and key transaction flows.
- **[schema.sql](DOCS/schema.sql)**: Complete PostgreSQL 15+ DDL including custom ENUMs, composite keys, and triggers.

---

## 📝 Work Logging Protocol

This project follows a strict daily logging protocol recorded in [`logs/`](file:///C:/Users/kshit/cs/project/opendoor/logs):
- Standard operating instructions are defined in [`logs/instruction.txt`](logs/instruction.txt).
- Every major feature, refactor, or architectural decision is logged with clear **"WHY behind the change"** and **"WHY NOT the alternatives"** rationale.

---

## 🗺️ Implementation Roadmap

- [x] **Core Server Foundation**: Express ESM setup, Zod env loader, standardized response formatters, centralized error handler.
- [x] **Security & Cryptographic Utilities**: Argon2id password hashing, JWT token rotation helpers, Super Admin TOTP MFA.
- [ ] **Auth & RBAC Module**: Register, Login, Refresh, Logout, and Role/Hostel Authorization Middleware.
- [ ] **GatePass & Rules Engine**: Offline QR minting, warden queue, pass extension state machine.
- [ ] **Guard Scanner & Sync Processing**: Anti-replay validation, batch sync, dead-phone roll lookup.
- [ ] **Visual Bed Booking Module**: 10-minute soft-lock management and room-change workflows.
- [ ] **Payments & Webhooks**: Razorpay order minting, HMAC verification, PDF receipts.
- [ ] **Real-Time WebSockets**: Socket.io event catalog implementation.
- [ ] **Database Persistence**: PostgreSQL `pg` repository wiring and migrations.
