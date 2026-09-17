#!/usr/bin/env bash
cd "$(dirname "$0")"
PORT=8765
echo "Artefact Sim  http://127.0.0.1:${PORT}/index.html"
python3 -m http.server "$PORT"
