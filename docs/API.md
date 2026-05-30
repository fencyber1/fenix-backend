# API Reference — `/api/v1`

All responses use a consistent envelope.

**Success**

```json
{ "success": true, "message": "OK", "data": { } }
```

**Paginated**

```json
{
  "success": true,
  "message": "OK",
  "data": [ ],
  "meta": { "page": 1, "limit": 20, "total": 57, "totalPages": 3, "hasNext": true, "hasPrev": false }
}
```

**Error**

```json
{ "success": false, "message": "Validation failed", "errors": [ { "field": "email", "message": "A valid email is required" } ], "code": "VALIDATION_ERROR", "requestId": "..." }
```

Authentication: send `Authorization: Bearer <accessToken>`. The refresh token is
set as an HTTP-only cookie by `/auth/login` and consumed by `/auth/refresh`.

Roles: `SUPER_ADMIN`, `ADMIN`, `TEACHER`, `PARENT`, `STUDENT`.

---

## Auth

| Method | Path                       | Roles  | Notes                                  |
| ------ | -------------------------- | ------ | -------------------------------------- |
| POST   | `/auth/login`              | public | Rate-limited. Returns access token + refresh cookie. |
| POST   | `/auth/refresh`            | public | Rotates refresh token (cookie).        |
| POST   | `/auth/logout`             | public | Revokes refresh token.                 |
| POST   | `/auth/forgot-password`    | public | Always 200 (no enumeration).           |
| POST   | `/auth/reset-password`     | public | Single-use token; revokes all sessions.|
| POST   | `/auth/verify-email`       | public | Single-use token.                      |
| GET    | `/auth/me`                 | any    | Current user profile.                  |
| POST   | `/auth/change-password`    | any    | Requires current password.             |

## Students

| Method | Path                     | Roles                | Notes |
| ------ | ------------------------ | -------------------- | ----- |
| GET    | `/students`              | any (scoped)         | `?page&limit&search&classId&status&sortBy&sortOrder` |
| POST   | `/students`              | ADMIN+               | |
| GET    | `/students/:id`          | any (scoped)         | DOB/medical masked for non-admins |
| PUT    | `/students/:id`          | ADMIN+, TEACHER      | |
| DELETE | `/students/:id`          | ADMIN+               | Soft delete |
| POST   | `/students/import`       | ADMIN+               | CSV bulk import |

## Attendance

| Method | Path                    | Roles           | Notes |
| ------ | ----------------------- | --------------- | ----- |
| POST   | `/attendance`           | ADMIN+, TEACHER | Bulk mark for a class/date (idempotent). Queues alerts for absent/late. |
| GET    | `/attendance`           | scoped          | `?studentId&classId&from&to` |
| PUT    | `/attendance/:id`       | ADMIN+, TEACHER | Correction (audited) |
| GET    | `/attendance/report`    | ADMIN+, TEACHER | `?classId&month=YYYY-MM` aggregate stats |

## Grades

| Method | Path                    | Roles           | Notes |
| ------ | ----------------------- | --------------- | ----- |
| POST   | `/grades`               | ADMIN+, TEACHER | Upsert; computes letter + remark |
| GET    | `/grades`               | scoped          | `?studentId&subjectId&term` |
| PUT    | `/grades/:id`           | ADMIN+, TEACHER | |
| GET    | `/grades/report-card`   | scoped          | `?studentId&term` → report card data (PDF source) |

## Fees

| Method | Path                          | Roles      | Notes |
| ------ | ----------------------------- | ---------- | ----- |
| GET    | `/fees/structures`            | ADMIN+     | |
| POST   | `/fees/structures`            | ADMIN+     | |
| GET    | `/fees/invoices`              | scoped     | `?studentId&status&from&to` (includes `balance`) |
| POST   | `/fees/invoices`              | ADMIN+     | |
| GET    | `/fees/invoices/:id`          | scoped     | Includes payments + school for PDF invoice |
| POST   | `/fees/invoices/:id/waive`    | ADMIN+     | Reason required; audited |
| POST   | `/fees/payments`              | ADMIN+     | Validates against balance; updates status |
| GET    | `/fees/summary`               | ADMIN+, TEACHER | `?classId&academicYear` totals |

## Classes / Subjects

| Method | Path                       | Roles  |
| ------ | -------------------------- | ------ |
| GET    | `/classes`                 | any    |
| POST   | `/classes`                 | ADMIN+ |
| GET    | `/classes/:id`             | any    |
| GET    | `/classes/:id/roster`      | any    |
| PUT    | `/classes/:id`             | ADMIN+ |
| DELETE | `/classes/:id`             | ADMIN+ (soft) |
| POST   | `/classes/:id/enroll`      | ADMIN+ |
| GET    | `/subjects`                | any    |
| POST   | `/subjects`                | ADMIN+ |
| PUT    | `/subjects/:id`            | ADMIN+ |
| DELETE | `/subjects/:id`            | ADMIN+ |

## Staff / Users

| Method | Path             | Roles  | Notes |
| ------ | ---------------- | ------ | ----- |
| GET    | `/staff`         | ADMIN+ | |
| POST   | `/staff`         | ADMIN+ | Creates user + emails verification + temp password |
| GET    | `/staff/:id`     | ADMIN+ | |
| PUT    | `/staff/:id`     | ADMIN+ | |
| DELETE | `/staff/:id`     | ADMIN+ | Soft delete + deactivate user |
| POST   | `/users/invite`  | ADMIN+ | Invite ADMIN/TEACHER/PARENT/STUDENT |

## Documents (presigned uploads)

| Method | Path                   | Roles           | Notes |
| ------ | ---------------------- | --------------- | ----- |
| GET    | `/documents`           | scoped          | `?studentId` |
| POST   | `/documents/presign`   | ADMIN+, TEACHER | Validates MIME + size, returns presigned URL |
| POST   | `/documents/confirm`   | ADMIN+, TEACHER | Persists metadata after client uploads |
| DELETE | `/documents/:id`       | ADMIN+          | Soft delete |

Upload flow: `presign` → client `PUT`s the file to `uploadUrl` → `confirm`.

## Notifications / Settings / Admin

| Method | Path                                         | Roles  |
| ------ | -------------------------------------------- | ------ |
| GET    | `/notifications`                             | any    |
| PATCH  | `/notifications/:id/read`                     | any    |
| PATCH  | `/notifications/read-all`                     | any    |
| GET    | `/schools/me`                                | any    |
| PUT    | `/schools/me`                                | ADMIN+ |
| GET    | `/schools/me/notification-preferences`       | any    |
| PUT    | `/schools/me/notification-preferences`       | any    |
| GET    | `/dashboard`                                 | ADMIN+, TEACHER |
| GET    | `/audit-logs`                                | ADMIN+ |
