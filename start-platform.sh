#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Please install Node.js 22 or newer.'
  exit 1
fi
echo 'Open http://127.0.0.1:3000 after the server starts (or the PORT set in .env).'
if [[ -f .env ]]; then
  exec node --env-file=.env src/server.js
else
  exec node src/server.js
fi
