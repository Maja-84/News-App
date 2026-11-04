#!/usr/bin/env bash
# Bereinigt die Git-History: aktueller Stand als einziger Commit, Force-Push nach origin main.
# Aufruf: ./squash.sh            (echt)
#         ./squash.sh --dry-run  (nur prüfen, nichts pushen)
# Token nur zur Laufzeit aus $GITHUB_NEWS_APP_TOKEN, nie ausgegeben oder gespeichert.
set -euo pipefail
cd "$(dirname "$0")"
REPO=Maja-84/News-App; LIVE=https://maja-84.github.io/News-App/
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
fail(){ echo "FEHLER: $*" >&2; exit 1; }
: "${GITHUB_NEWS_APP_TOKEN:?GITHUB_NEWS_APP_TOKEN ist nicht gesetzt}"
api(){ curl -fsS -H "Authorization: Bearer $GITHUB_NEWS_APP_TOKEN" -H "Accept: application/vnd.github+json" "$@"; }
size_api(){ api "https://api.github.com/repos/$REPO" | python3 -c 'import json,sys;print(json.load(sys.stdin)["size"])'; }

[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || fail "nicht auf Branch main"
python3 -m json.tool news.json >/dev/null || { echo "FEHLER: news.json ist ungültig" >&2; exit 2; }
echo "Vorher: lokal .git $(du -sh .git | cut -f1), API size $(size_api) KB, $(git rev-list --count HEAD) Commits"
git add -A
if ! git diff --cached --quiet; then git commit -q -m "Ausgabe aktualisiert $(date '+%Y-%m-%d %H:%M')"; echo "Offene Änderungen committet."; fi
[ -z "$(git status --porcelain)" ] || fail "Arbeitsverzeichnis nicht sauber"
if [ $DRY = 1 ]; then echo "Dry-run: alles bereit, nichts geändert."; exit 0; fi

AUTH=$(printf 'x-access-token:%s' "$GITHUB_NEWS_APP_TOKEN" | base64 -w0)
OLD=$(git rev-parse HEAD)
git checkout -q --orphan squash-tmp
git add -A
git commit -q -m "Stand $(date +%F) (Verlauf bereinigt)"
git branch -M squash-tmp main
git -c http.extraheader="AUTHORIZATION: basic $AUTH" push -q --force origin main \
  || { echo "Push fehlgeschlagen; alter Stand: $OLD (bis reflog expire noch lokal vorhanden)" >&2; exit 1; }
echo "Force-Push ok: $(git rev-parse --short HEAD)"
git reflog expire --expire=now --all && git gc -q --prune=now --aggressive

NEW=$(git rev-parse HEAD); st=""; rebuilt=0
for i in $(seq 1 40); do
  sleep 15
  read -r st sha < <(api "https://api.github.com/repos/$REPO/pages/builds/latest" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("status"),d.get("commit"))') || st=unknown
  echo "Pages-Build: $st"
  [ "$st" = built ] && [ "$sha" = "$NEW" ] && break
  if [ "$st" = errored ] && [ $rebuilt = 0 ]; then api -X POST "https://api.github.com/repos/$REPO/pages/builds" >/dev/null; rebuilt=1; echo "Rebuild ausgelöst."; fi
  [ "$st" = errored ] && [ $rebuilt = 1 ] && [ $i -gt 4 ] && fail "Pages-Build fehlgeschlagen"
done
[ "$st" = built ] || fail "Pages-Build nicht fertig (Status: $st)"
code=$(curl -s -o /dev/null -w '%{http_code}' "$LIVE?n=$RANDOM")
[ "$code" = 200 ] || fail "Live-Seite liefert $code"
sleep 20
echo "Nachher: lokal .git $(du -sh .git | cut -f1), API size $(size_api) KB (API-Wert aktualisiert sich teils verzögert), 1 Commit"
echo "OK: Verlauf bereinigt, live $LIVE (HTTP 200)"
