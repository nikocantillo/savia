#!/bin/sh
set -e

echo "==> Running database migrations..."
alembic upgrade head

if [ "$SEED_DATA" = "true" ]; then
  echo "==> Seeding demo data..."
  python seed.py
fi

echo "==> Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${API_PORT:-8000}" --workers "${WORKERS:-2}"
