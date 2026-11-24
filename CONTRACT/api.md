# Project Living Contract: API Specifications

Frozen endpoints and envelopes.

## 1. System Endpoints

### GET /api/v1/health
Health check endpoint returning system status and uptime.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Opendoor API is running",
  "data": {
    "status": "healthy",
    "timestamp": "2026-11-24T11:00:00.000Z",
    "env": "development",
    "uptime": "12s"
  }
}
```

### GET /api/v1/ping
Ping-pong verification endpoint.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Pong",
  "data": {
    "pong": true,
    "timestamp": "2026-11-24T11:00:00.000Z"
  }
}
```

## 2. Authentication Endpoints

### POST /api/v1/auth/login
User authentication endpoint returning access token and setting httpOnly refresh cookie.

**Request Body:**
```json
{
  "email": "user@univ.edu",
  "password": "SecurePassword123!"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "user": {
      "id": "uuid",
      "email": "user@univ.edu",
      "role": "student"
    },
    "requiresMfa": false
  }
}
```
