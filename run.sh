#!/usr/bin/env bash
# Start IntelliTwin on http://localhost:8090   (INTELLITWIN_CITY=dubai ./run.sh to start the simulator in another city)
# Settings: copy .env.example to .env (TOMTOM_KEY, INTELLITWIN_ADMIN_PASSWORD, ...). .env is git-ignored.
set -e
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
[ -f frontend/index.html ] || tools/fetch_frontend.sh
if [ ! -x .venv/bin/uvicorn ]; then "$PY" -m venv .venv && .venv/bin/pip install -q -r requirements.txt; fi
exec .venv/bin/uvicorn intellitwin.app:app --host "${HOST:-0.0.0.0}" --port "${PORT:-8090}"
