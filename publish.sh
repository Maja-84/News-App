#!/usr/bin/env bash
# Committet Änderungen (z. B. news.json) und pusht nach GitHub Pages.
# Token wird nur zur Laufzeit aus $GITHUB_NEWS_APP_TOKEN gelesen, nie gespeichert.
set -euo pipefail
cd "$(dirname "$0")"
: "${GITHUB_NEWS_APP_TOKEN:?GITHUB_NEWS_APP_TOKEN ist nicht gesetzt}"
if [ -f news.json ]; then python3 -m json.tool news.json >/dev/null || { echo "news.json ist ungültig" >&2; exit 2; }; fi
git add -A
if git diff --cached --quiet; then echo "Keine Änderungen – nichts zu tun."; exit 0; fi
git commit -q -m "${1:-Ausgabe aktualisiert $(date '+%Y-%m-%d %H:%M')}"
AUTH=$(printf 'x-access-token:%s' "$GITHUB_NEWS_APP_TOKEN" | base64 -w0)
git -c http.extraheader="AUTHORIZATION: basic $AUTH" push -q origin main
echo "Veröffentlicht: https://maja-84.github.io/News-App/"
