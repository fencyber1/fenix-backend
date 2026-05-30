# Fenix — Deployment & Operations Guide

This guide takes Fenix from a working build to a hardened production deployment.

## 1. Prerequisites

- Managed PostgreSQL 15+ (or self-hosted with backups).
- Managed Redis 6+ (required for refresh-token revocation, rate limiting, and the
  BullMQ notification queue).
- A host for the API + worker (Railway, Render, Fly.io, a VPS with Docker, or k8s).
- DNS + TLS (managed cert or Let's Encrypt via Nginx/Caddy).
- Provider accounts as needed: S3/R2 (files), Resend or SendGrid (email),
  Twilio or Africa's Talking (SMS).

## 2. Generate secrets

    openssl rand -base64 48   # JWT_ACCESS_SECRET
    openssl rand -base64 48   # JWT_REFRESH_SECRET (must differ)

Store secrets in your platform's secret manager — never commit them. The app
REFUSES TO BOOT in production if secrets are placeholders, identical, or if
CORS_ORIGINS / APP_PUBLIC_URL are not real https values (see src/config/env.ts).

## 3. Configure environment

Copy .env.example and set production values. Minimum production set:

    NODE_ENV=production
    DATABASE_URL=postgresql://USER:PASS@HOST:5432/DB?schema=public&sslmode=require
    REDIS_URL=rediss://default:PASS@HOST:6379
    JWT_ACCESS_SECRET=<48-byte secret>
    JWT_REFRESH_SECRET=<different 48-byte secret>
    CORS_ORIGINS=https://app.yourschool.edu
    APP_PUBLIC_URL=https://app.yourschool.edu
    BCRYPT_SALT_ROUNDS=12
    QUEUE_DRIVER=bullmq
    STORAGE_DRIVER=s3
    S3_BUCKET=fenix-prod
    S3_ENDPOINT=https://<acct>.r2.cloudflarestorage.com   # omit for AWS S3
    S3_ACCESS_KEY_ID=...
    S3_SECRET_ACCESS_KEY=...
    S3_PUBLIC_BASE_URL=https://files.yourschool.edu
    EMAIL_DRIVER=resend
    RESEND_API_KEY=...
    EMAIL_FROM=Fenix <no-reply@yourschool.edu>
    SMS_DRIVER=twilio
    TWILIO_ACCOUNT_SID=...
    TWILIO_AUTH_TOKEN=...
    TWILIO_FROM=+1555...
    SENTRY_DSN=...   # optional; then: npm i @sentry/node

### Verify provider connectivity before going live

    npm run verify:providers

Makes REAL calls to the configured database, Redis, storage, email, and SMS
providers and exits non-zero if any configured provider is unreachable. Use it
as a deploy-pipeline gate.

## 4. Database migrations

Applied automatically on container start (prisma migrate deploy). Manual:

    npm run prisma:deploy

Bootstrap the first school + super admin (once):

    BOOTSTRAP_SCHOOL_NAME="Your School" \
    BOOTSTRAP_ADMIN_EMAIL="admin@yourschool.edu" \
    BOOTSTRAP_ADMIN_PASSWORD="<strong-password>" \
    npm run db:seed

## 5. Run with Docker Compose

    JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... \
    CORS_ORIGINS=https://app.yourschool.edu APP_PUBLIC_URL=https://app.yourschool.edu \
    docker compose up -d --build

Starts db, redis, api (with a container HEALTHCHECK on /health/ready), and
worker. Put Nginx/Caddy in front of api for TLS.

## 6. Health & readiness probes

| Endpoint           | Purpose                              | Status      |
|--------------------|--------------------------------------|-------------|
| GET /health/live   | Liveness — process is up (cheap)     | 200         |
| GET /health/ready  | Readiness — DB + Redis reachable     | 200 / 503   |
| GET /health        | Full — adds storage/email/sms checks | 200 / 503   |

- Load balancer -> /health/ready (gates traffic on DB+Redis).
- Orchestrator liveness -> /health/live.
- /health reports "degraded" (still 200) when a provider is misconfigured, so
  dashboards can alert without taking the app down.

## 7. Backups

scripts/backup-db.sh runs a compressed pg_dump, prunes old local copies, and
optionally uploads to S3-compatible storage.

    npm run db:backup                         # manual
    30 2 * * * cd /app && ./scripts/backup-db.sh >> /var/log/fenix-backup.log 2>&1   # cron

Test restores regularly into a scratch database:

    DATABASE_URL=postgresql://.../scratch ./scripts/restore-db.sh ./backups/fenix-<ts>.sql.gz

Enable point-in-time recovery on managed Postgres too.

## 8. Scaling

- The API is stateless — scale horizontally behind a load balancer. Redis holds
  shared rate-limit + refresh-token-revocation state.
- Run one or more worker processes for notifications and the overdue-fee sweep;
  BullMQ distributes jobs across them.
- Tune GLOBAL_RATE_LIMIT_MAX / AUTH_RATE_LIMIT_MAX for your traffic.

## 9. Pre-launch security checklist

- [ ] Strong, unique JWT secrets in a secret manager
- [ ] NODE_ENV=production (enables CSP, HSTS, strict env guards)
- [ ] TLS everywhere; APP_PUBLIC_URL and CORS_ORIGINS are https
- [ ] DATABASE_URL uses sslmode=require; Redis uses rediss://
- [ ] npm run verify:providers passes against prod credentials
- [ ] Automated daily backups + a tested restore
- [ ] SENTRY_DSN (or equivalent) wired for error tracking
- [ ] Dependency audit clean (npm audit)
- [ ] Rate limits tuned; load test performed
