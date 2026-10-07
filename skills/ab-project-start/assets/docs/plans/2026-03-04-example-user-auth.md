# User Authentication Implementation Plan

> **Status:** EXAMPLE — This is a template showing what a completed plan looks like. Delete this file when you start your project.

**Objective:** Users can sign up, log in, and stay signed in across visits without re-entering credentials
**Means:** JWT access tokens in memory with httpOnly refresh cookies
**Architecture:** Express middleware validates tokens on protected routes. Refresh tokens stored in httpOnly cookies. Access tokens in memory.
**Tech Stack:** jsonwebtoken, bcrypt, cookie-parser
**Estimated tasks:** 5 tasks, ~3 hours

---

### Task 1: Auth Database Schema

**Files:**
- Create `src/db/migrations/001-auth-tables.sql`
- Create `src/db/models/user.ts`

**Steps:**
1. Create users table migration:
   ```sql
   CREATE TABLE users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     email VARCHAR(255) UNIQUE NOT NULL,
     password_hash VARCHAR(255) NOT NULL,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```
2. Create User model with `findByEmail`, `create`, `verifyPassword` methods
3. Run migration: `npm run db:migrate`
4. Test: `npm test -- tests/db/user.test.ts`

### Task 2: JWT Token Utilities

**Files:**
- Create `src/auth/tokens.ts`
- Create `tests/auth/tokens.test.ts`

**Steps:**
1. Write failing tests for `generateAccessToken`, `generateRefreshToken`, `verifyToken`
2. Implement token utilities using jsonwebtoken
3. Access token: 15min expiry, refresh token: 7d expiry
4. Test: `npm test -- tests/auth/tokens.test.ts` — expect 3 passing

### Task 3: Auth Routes (Signup + Login)

**Files:**
- Create `src/auth/routes.ts`
- Create `tests/auth/routes.test.ts`

**Steps:**
1. Write failing integration tests for POST /auth/signup and POST /auth/login
2. Implement signup: validate input → hash password → create user → return tokens
3. Implement login: find user → verify password → return tokens
4. Set refresh token as httpOnly cookie
5. Test: `npm test -- tests/auth/routes.test.ts` — expect 6 passing

### Task 4: Auth Middleware

**Files:**
- Create `src/auth/middleware.ts`
- Create `tests/auth/middleware.test.ts`

**Steps:**
1. Write failing tests for `requireAuth` middleware
2. Implement: extract Bearer token → verify → attach user to req
3. Return 401 for missing/invalid/expired tokens
4. Test: `npm test -- tests/auth/middleware.test.ts` — expect 4 passing

### Task 5: Token Refresh Endpoint

**Files:**
- Create `src/auth/refresh.ts`
- Modify `src/auth/routes.ts` — add POST /auth/refresh

**Steps:**
1. Write failing test for refresh flow
2. Implement: read refresh cookie → verify → issue new access token
3. Handle expired refresh tokens (clear cookie, return 401)
4. Test full flow: `npm test -- tests/auth/` — expect all 15+ passing
