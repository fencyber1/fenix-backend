#!/usr/bin/env bash
#
# Restore a Fenix PostgreSQL backup produced by backup-db.sh.
#
#   ./scripts/restore-db.sh ./backups/fenix-YYYYMMDDTHHMMSSZ.sql.gz
#
# DANGER: this overwrites data in the target DATABASE_URL. Intended for disaster
# recovery and for periodically *testing* that backups actually restore.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
FILE="${1:?Usage: restore-db.sh <backup.sql.gz>}"

if [[ ! -f "${FILE}" ]]; then
  echo "Backup file not found: ${FILE}" >&2
  exit 1
fi

echo "[restore] restoring ${FILE} -> target database"
gunzip -c "${FILE}" | psql "${DATABASE_URL}"
echo "[restore] done"
