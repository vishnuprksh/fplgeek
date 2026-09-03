#!/bin/bash
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "======================================"
echo "  FPL Geek - Local Environment Setup  "
echo "======================================"

fail() { echo "ERROR: $1" >&2; exit 1; }
warn() { echo "WARNING: $1"; }

# ---------- Step 1: Prerequisites ----------
echo "--- Step 1: Checking prerequisites ---"

command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install Node.js v18+ and try again."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js v18+ is required (found $(node -v))."
echo "  node $(node -v)  /  npm $(npm -v)"

command -v python3 >/dev/null 2>&1 || fail "python3 is not installed. Install Python 3.10+ and try again."
echo "  python3 $(python3 --version | cut -d' ' -f2)"

# ---------- Step 2: Node dependencies ----------
echo "--- Step 2: Installing Node dependencies (root) ---"
npm install

if [ -f frontend/package.json ]; then
  echo "--- Step 2b: Installing Node dependencies (frontend) ---"
  (cd frontend && npm install)
fi

# ---------- Step 3: Python virtualenv for the backend ----------
echo "--- Step 3: Setting up backend Python virtualenv ---"
if [ ! -x backend/venv/bin/python ]; then
  python3 -m venv backend/venv || fail "Could not create backend/venv. On Debian/Ubuntu, install python3-venv (sudo apt install python3-venv) and retry."
else
  echo "  backend/venv already exists - reusing it"
fi
backend/venv/bin/python -m pip install --quiet --upgrade pip
backend/venv/bin/pip install -r backend/requirements.txt

# ---------- Step 4: Data directory ----------
echo "--- Step 4: Wiring up the data directory ---"
# main.py, fetch_data.py, preprocess.py and train_predict.py all default
# DATA_DIR to <repo-root>/data, while the SQLite dataset produced locally
# lives in backend/data. A symlink keeps both locations pointing at the
# same files so the backend and the update pipeline stay in sync.
ROOT_DATA="$REPO_ROOT/data"
BACKEND_DATA="$REPO_ROOT/backend/data"

if [ ! -e "$ROOT_DATA" ] && [ ! -L "$ROOT_DATA" ]; then
  if [ -f "$BACKEND_DATA/fpl.sqlite" ]; then
    ln -s backend/data "$ROOT_DATA"
    echo "  Linked data -> backend/data"
  else
    mkdir -p "$ROOT_DATA"
    echo "  Created empty data/ directory"
  fi
else
  echo "  data/ directory already present - leaving it untouched"
fi

WITH_DATA=false
if [ "${1:-}" = "--with-data" ]; then
  WITH_DATA=true
fi

if [ ! -f "$ROOT_DATA/fpl.sqlite" ]; then
  warn "No fpl.sqlite dataset found in $ROOT_DATA."
  if [ "$WITH_DATA" = true ]; then
    echo "  Fetching FPL data (this can take several minutes)..."
    npm run update:data
  else
    echo "  Run 'npm run update:data' (or this script with --with-data) to fetch and preprocess it."
  fi
else
  echo "  Dataset found: $ROOT_DATA/fpl.sqlite"
  [ -d "$ROOT_DATA/models" ] || warn "ML models missing at $ROOT_DATA/models - AI predictions need 'npm run update:data' to (re)train."
fi

# ---------- Step 5: Environment file ----------
echo "--- Step 5: Checking .env ---"
if [ ! -f "$REPO_ROOT/.env" ]; then
  warn ".env not found - it is optional for local development."
else
  echo "  .env found"
fi

# ---------- Done ----------
echo ""
echo "======================================"
echo "  Setup complete!"
echo "======================================"
echo ""
echo "Next steps (run each in its own terminal):"
echo "  1. Backend  : npm run dev:backend   -> http://localhost:3000  (health check: /health)"
echo "  2. Frontend : npm run dev           -> http://localhost:5173"
echo ""
echo "Other useful commands:"
echo "  npm run update:data   # refresh FPL data + retrain models"
echo "  npm run build         # production build"
echo "  npm run lint          # lint frontend sources"
