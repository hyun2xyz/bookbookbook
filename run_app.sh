#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

if [ -x "$ROOT/.venv/bin/python3" ]; then
  PYTHON_BIN="$ROOT/.venv/bin/python3"
elif [ -x /opt/miniconda3/bin/python3 ]; then
  PYTHON_BIN=/opt/miniconda3/bin/python3
else
  PYTHON_BIN=python3
fi

cd "$ROOT"
PYTHONPATH="$ROOT/src" exec "$PYTHON_BIN" -m booklet_maker.server
