#!/usr/bin/env bash
# Start IntelliTwin on http://localhost:8090   (INTELLITWIN_CITY=dubai ./run.sh to start in another city)
set -e
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
if [ ! -x .venv/bin/uvicorn ]; then "$PY" -m venv .venv && .venv/bin/pip install -q -r requirements.txt; fi
exec .venv/bin/uvicorn intellitwin.app:app --host 0.0.0.0 --port "${PORT:-8090}"
