#!/usr/bin/env bash
#
# Automated PostgreSQL backup for Fenix.
#
#   ./scripts/backup-db.sh
#
# Reads DATABASE_URL from the environment, runs a compressed pg_dump, writes it
# to BACKUP_DIR (default ./backups), prunes backups older than BACKUP_RETENTION_DAYS
# (default 14), and — when S3 backup vars are present — uploads to object storage.
#
# Schedule with cron, e.g. daily at 02:30:
#   30 2 * * * cd /app && ./scripts/backup-db.sh >> /var/log/fenix-backup.log 2>&1
#
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${BACKUP_DIR}/fenix-${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[backup] dumping database -> ${FILE}"
pg_dump --no-owner --no-privileges --format=plain "${DATABASE_URL}" | gzip -9 > "${FILE}"
echo "[backup] wrote $(du -h "${FILE}" | cut -f1)"

# Optional: upload to S3-compatible storage if the AWS CLI + bucket are configured.
if [[ -n "${BACKUP_S3_BUCKET:-}" ]] && command -v aws >/dev/null 2>&1; then
  DEST="s3://${BACKUP_S3_BUCKET}/db-backups/fenix-${TIMESTAMP}.sql.gz"
  echo "[backup] uploading -> ${DEST}"
  AWS_ARGS=()
  [[ -n "${BACKUP_S3_ENDPOINT:-}" ]] && AWS_ARGS+=(--endpoint-url "${BACKUP_S3_ENDPOINT}")
  aws "${AWS_ARGS[@]}" s3 cp "${FILE}" "${DEST}"
  echo "[backup] upload complete"
fi

echo "[backup] pruning local backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -name 'fenix-*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -delete

echo "[backup] done"
