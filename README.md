# Student Management System — Backend

Production-ready REST API for schools. Node.js + Express + TypeScript (strict) +
Prisma + PostgreSQL + Redis. Real authentication, row-level security, audit
logging, presigned file uploads, and a background notification queue.

> **No mock data anywhere.** Every endpoint reads from / writes to PostgreSQL.
> The only "seed" is a one-time bootstrap of the first school + super admin,
> entirely from environment variables.

---

## Stack

| Concern        | Choice                                                        |
| -------------- | ------------------------------------------------------------ |
| Runtime        | Node.js 20, TypeScript 5 (`strict`, no `any`)                |
| Web            | Express 4, Helmet, CORS, cookie-parser                       |
| Validation     | Zod (server-side on **every** endpoint)                     |
| ORM / DB       | Prisma 5 / PostgreSQL 17 (FKs + indexes + soft deletes)      |
| Auth           | JWT access (15m) + HTTP-only refresh cookie (7d) + rotation  |
| Authorization  | Role guards + row-level scoping (teacher/parent/student)     |
| Cache / queue  | Redis (rate-limit store, refresh blacklist), BullMQ worker   |
| Files          | Presigned uploads — pluggable **local** or **S3/R2** driver  |
| Email / SMS    | Pluggable: console / Resend / SendGrid · console / Twilio / Africa's Talking |
| Tests          | Vitest + Supertest against a **real** Postgres test database |
| Logging        | pino (structured, secrets redacted)                         |

## Pluggable adapters (run locally with zero paid services)

Each external dependency is behind an interface with a local/dev driver that you
swap to a real provider via `.env` — the code paths are identical, no fakes.

| Adapter | Dev driver        | Production drivers          | Env var          |
| ------- | ----------------- | --------------------------- | ---------------- |
| Storage | `local` (disk)    | `s3` (AWS S3 / Cloudflare R2)| `STORAGE_DRIVER` |
| Email   | `console` (logs)  | `resend`, `sendgrid`        | `EMAIL_DRIVER`   |
| SMS     | `console` (logs)  | `twilio`, `africastalking`  | `SMS_DRIVER`     |
| Queue   | `inline` / `bullmq` | `bullmq` (Redis)          | `QUEUE_DRIVER`   |

---

## Quick start

### Option A — Docker (recommended)

```bash
cp .env.example .env          # then set strong JWT secrets
docker compose up --build     # starts db + redis + api + worker
# API on http://localhost:4000/api/v1
```

### Option B — Local toolchain

```bash
# 1. Start PostgreSQL and Redis (locally or via docker compose up db redis)
# 2. Configure env
cp .env.example .env

# 3. Install + migrate
npm install
npm run prisma:generate
npm run prisma:migrate          # creates tables in sms_dev

# 4. Bootstrap the first school + super admin (values from env)
BOOTSTRAP_SCHOOL_NAME="Greenfield Academy" \
BOOTSTRAP_ADMIN_EMAIL="admin@greenfield.test" \
BOOTSTRAP_ADMIN_PASSWORD="Sup3r!Admin2026" \
npm run db:seed

# 5. Run
npm run dev                     # API (tsx watch)
npm run worker                  # background worker (separate terminal)
```

Health check: `GET http://localhost:4000/health`.

---

## Scripts

| Script                  | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `npm run dev`           | Dev server with hot reload (tsx)                   |
| `npm run worker`        | BullMQ notification worker + overdue-fee sweep     |
| `npm run build`         | Compile to `dist/` (tsc + tsc-alias)               |
| `npm start`             | Run compiled server                                |
| `npm run typecheck`     | `tsc --noEmit` (strict)                            |
| `npm run lint`          | ESLint (bans `any`, unused vars, stray console)    |
| `npm test`              | Vitest (unit + integration vs real DB)             |
| `npm run test:coverage` | Coverage report                                    |
| `npm run prisma:migrate`| Create/apply a dev migration                       |
| `npm run prisma:deploy` | Apply migrations (CI / prod)                       |
| `npm run db:seed`       | Bootstrap first school + super admin from env      |

---

## Testing

Integration tests run against a **real** Postgres test database (no mocks),
using the `inline` queue driver so notifications process in-process.

```bash
createdb sms_test                       # once
DATABASE_URL=...sms_test npm run prisma:deploy
npm test                                # 100+ tests
npm run test:coverage                   # services ~89% coverage
```

`.env.test` already points at `sms_test` with `QUEUE_DRIVER=inline`.

---

## Security highlights

- All endpoints require a valid JWT except `/auth/login`, `/auth/refresh`,
  `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`.
- Role guards enforced **server-side**; row-level scoping ensures teachers only
  touch their classes, parents only their children, students only themselves.
- Passwords hashed with bcrypt (≥12 rounds in prod), never logged or returned.
- Auth endpoints rate-limited (5 / 15 min / IP, Redis-backed).
- CSRF guard validates Origin/Referer on cookie-bearing mutations.
- Parameterized queries only (Prisma); sort fields are allow-listed.
- Sensitive fields (DOB, medical notes) only returned to admins.
- File uploads validate MIME + size server-side before issuing a presigned URL.
- Soft deletes (`deleted_at`) — records are never hard-deleted.
- Every student change, fee adjustment, grade edit and auth event writes an
  `audit_logs` row (actor, before/after JSON, IP, user-agent).

See [`docs/API.md`](docs/API.md) for the full endpoint reference and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for design notes.

---

## Project layout

```
src/
  config/env.ts            validated environment (fail-fast)
  lib/                     prisma, redis, logger singletons
  middleware/              auth, rbac, validate, csrf, rateLimit, errorHandler
  adapters/                storage / email / sms / queue (pluggable drivers)
  modules/<feature>/       schemas (zod) · service · controller · routes
  routes.ts                /api/v1 router
  app.ts                   express app assembly
  server.ts                http bootstrap + graceful shutdown
  worker.ts                background queue consumer + scheduled sweeps
prisma/schema.prisma       normalized schema, enums, indexes, soft deletes
prisma/seed.ts             one-time bootstrap (env-driven, not demo data)
tests/                     unit (pure logic) + integration (real DB)
```
