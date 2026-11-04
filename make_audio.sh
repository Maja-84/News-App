#!/usr/bin/env bash
# Erzeugt die Vorlese-MP3s für news.json. Aufruf vor ./publish.sh
set -euo pipefail
cd "$(dirname "$0")"
PY=/workspace/pwenv/bin/python
[ -x "$PY" ] || PY=python3
"$PY" -c "import edge_tts" 2>/dev/null || "$PY" -m pip install -q edge-tts
grep -q "^STIMME=opa4" stimme.conf 2>/dev/null && { "$PY" -c "import piper" 2>/dev/null || "$PY" -m pip install -q piper-tts; }
exec "$PY" make_audio.py
