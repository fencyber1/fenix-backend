# Architecture

## Layering

```
HTTP → routes → middleware (auth → rbac → validate) → controller → service → Prisma → PostgreSQL
                                                              ↘ adapters (storage/email/sms/queue)
                                                              ↘ audit service (writes audit_logs)
```

- **routes** wire middleware + controllers. No logic.
- **controllers** translate HTTP ↔ service calls; build the response envelope.
- **services** hold all business logic and own transactions + audit writes.
- **schemas** (Zod) validate input server-side — duplicated from the frontend so
  the server is the source of truth.
- **adapters** isolate external systems behind interfaces with swappable drivers.

## Authentication & sessions

- Access token: stateless JWT, 15-minute expiry, carries `sub`, `role`,
  `schoolId`, `email`.
- Refresh token: opaque JWT with a `jti`, stored **hashed** in `refresh_tokens`
  and delivered as an HTTP-only, `SameSite=Strict` cookie scoped to `/auth`.
- Rotation: every `/auth/refresh` revokes the presented token and issues a new
  pair. Reuse of a rotated token fails (replay protection).
- Revocation: logout / password change / reset revoke tokens in the DB and add
  the `jti` to a Redis blacklist for O(1) checks.

## Authorization

Two layers, both server-side:

1. **Role guards** (`authorize(...roles)`) — coarse-grained per route.
2. **Row-level scoping** (`modules/shared/scope.ts`) — builds Prisma `where`
   clauses so each role only sees permitted rows:
   - `SUPER_ADMIN`: all
   - `ADMIN`: their school
   - `TEACHER`: students/classes they teach (class-teacher or subject teacher)
   - `PARENT`: their linked children
   - `STUDENT`: themselves

Sensitive fields (DOB, medical notes) are masked unless the role is admin.

## Data integrity

- Foreign keys enforced at the DB; `onDelete` chosen per relation
  (`Restrict` for school references, `Cascade` for owned children,
  `SetNull` for optional links).
- Indexes on `student_id`, `class_id`, attendance `date` (+ composite
  `class_id,date`), fee `due_date`, invoice `status`, user `email`, audit
  `table_name`/`record_id`/`created_at`.
- Soft deletes (`deleted_at`) on schools, users, students, staff, classes,
  fee structures, documents. List queries always filter `deletedAt: null`.
- Money is computed in integer minor units (`fee.calc.ts`) to avoid float drift.

## Audit logging

`writeAudit()` records actor, action, table, record id, before/after JSON, IP and
user-agent. It participates in the surrounding transaction when one is supplied,
and never throws (a failed audit must not break the primary operation, but within
a transaction the whole unit still commits atomically).

## Notifications

API requests never block on sending email/SMS. They enqueue a `NotificationJob`
(resolving the recipient's channel preferences first). The `bullmq` driver hands
jobs to the worker process; the `inline` driver (tests/dev) processes on the next
tick. The shared `notification.processor.ts` writes IN_APP rows and dispatches
EMAIL/SMS via adapters. The worker also runs an hourly sweep to mark overdue
invoices and queue fee reminders.

## File uploads

The frontend never holds storage credentials. It requests a presigned URL
(`/documents/presign`) — the server validates MIME type and size first — uploads
directly to storage, then calls `/documents/confirm` to persist metadata. The
local driver reproduces this exact contract on disk using HMAC-signed,
time-limited upload tokens, so switching to S3/R2 requires only env changes.

## Configuration

`config/env.ts` validates all environment variables with Zod at startup and
**fails fast** on missing/invalid values. Secrets are never hard-coded and are
redacted from logs by pino.

## Error handling

A single error middleware maps `AppError` subclasses, `ZodError`, and known
Prisma errors (`P2002` unique, `P2003` FK, `P2025` not found) to the structured
JSON envelope. 5xx errors are logged with the request id; details are hidden in
production.
