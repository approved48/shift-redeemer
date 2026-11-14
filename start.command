#!/usr/bin/env bash
# macOS / Linux launcher. On macOS you can also double-click start.command.
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Node.js 18 or newer is required: https://nodejs.org"; exit 1; }
exec node server.js "$@"
