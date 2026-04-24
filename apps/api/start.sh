#!/bin/sh
set -e

echo "==> ENV check: DATABASE_URL is ${DATABASE_URL:+SET}${DATABASE_URL:-NOT SET}"
echo "==> ENV check: SECRET_KEY is ${SECRET_KEY:+SET}${SECRET_KEY:-NOT SET}"
echo "==> ENV check: ENVIRONMENT is ${ENVIRONMENT:-not defined}"

echo "==> Running database migrations..."
alembic upgrade head

if [ "$SEED_DATA" = "true" ]; then
  echo "==> Seeding demo data..."
  python seed.py
fi

echo "==> Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${API_PORT:-8000}" --workers "${WORKERS:-2}"
