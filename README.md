# Tagesübersicht – News-PWA

Eine Web-App für die tägliche Nachrichtenübersicht mit den Rubriken Schweiz, Welt und KI & Technologie. Sie funktioniert offline und lässt sich auf dem Homescreen installieren.

## Starten

```bash
cd /home/box/news-app
nohup python3 -m http.server 8080 > /tmp/news-server.log 2>&1 &
# Für das Handy (HTTPS-Tunnel, die URL steht im Log):
nohup cloudflared tunnel --url http://localhost:8080 > /tmp/cloudflared.log 2>&1 &
grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cloudflared.log | head -1
```

Hinweis: Die Adresse des Quick-Tunnels ändert sich bei jedem Neustart.

## Daten aktualisieren

Ersetze einfach `news.json`, ohne die App neu zu bauen. Beim nächsten Öffnen oder Aktualisieren (Knopf oder Herunterziehen) lädt die App die neue Ausgabe.

Schema:

```json
{
  "datum": "YYYY-MM-DD",
  "aktualisiert": "2026-11-03T22:10:00+01:00",
  "rubriken": [
    {
      "id": "schweiz",
      "titel": "Schweiz",
      "meldungen": [
        {
          "titel": "Schlagzeile",
          "text": "Kurzer Absatz (3–5 Sätze) …",
          "ausfuehrlich": "Erster Absatz …\n\nZweiter Absatz …\n\nDritter Absatz …",
          "weitere_quellen": [{ "name": "NZZ", "url": "https://…" }],
          "datum": "YYYY-MM-DD",
          "quelle": { "name": "SRF", "url": "https://…" },
          "thema": "Ukraine-Krieg",
          "stichworte": ["Ukraine", "Russland", "Energie"],
          "kontinent": "Europa",
          "land": "Ukraine"
        }
      ]
    },
    { "id": "welt", "titel": "Welt", "meldungen": [] },
    { "id": "ki", "titel": "KI & Technologie", "meldungen": [] }
  ]
}
```

- Die Rubriken erscheinen in der Reihenfolge der Datei als Tabs, die «Übersicht» kommt automatisch dazu.
- Die Datei muss gültiges UTF-8-JSON sein. Prüfen kannst du das mit `python3 -m json.tool news.json`.
- Schreibe am besten in die Datei `news.json.tmp` und benenne sie danach mit `mv` um, damit nie eine halbe Datei ausgeliefert wird.
- `news.json` lädt die App immer zuerst aus dem Netz, nur offline aus dem Cache. Wenn sich die App selbst ändert (HTML/CSS/JS), erhöhe `VERSION` in `sw.js`.

## Ganze Meldung («ausfuehrlich»)

- `ausfuehrlich` (empfohlen): die ganze Meldung zum Lesen direkt in der App, **3–5 Absätze, etwa 250–450 Wörter**, Absätze durch eine Leerzeile (`\n\n`) getrennt. Aufbau: 1. Was ist passiert (Fakten, Zahlen, kurze markierte Zitate), 2. Hintergrund, 3. Reaktionen, 4. Einordnung und wie es weitergeht.
- **Eigene Worte, keine Kopien:** Originalartikel nicht abschreiben und keine längeren Passagen übernehmen. Stütze dich auf die Quelle plus 1–2 weitere seriöse Quellen. Schweizer Schreibweise (ss statt ß).
- **Nichts erfinden.** Unsicheres oder nur von einer Seite Behauptetes ausdrücklich kennzeichnen («laut …», «nicht unabhängig bestätigt»). Lässt sich eine Meldung nicht gut belegen, lieber kürzer schreiben.
- `weitere_quellen` (optional): `[{ "name": "…", "url": "https://…" }]`, werden unter dem langen Text zusammen mit `quelle` verlinkt.
- Die App zeigt bei jeder Karte den Knopf «Ganze Meldung lesen ▾» (fehlt das Feld, gibt es keinen Knopf). Das Vorlesen nutzt «Titel + ausfuehrlich», sonst «Titel + text».

## Themen & «Folgen»

- `thema` (Pflicht für die Folgen-Funktion): ein kurzes, **stabiles** Label, zum Beispiel «Ukraine-Krieg», «US-Wahlen 2026», «Strasse von Hormus», «Israel», «Armee Schweiz», «Energie & Treibstoff» oder «KI-Unternehmen».
- `stichworte` (optional): 2–5 Begriffe. Über sie findet die App Meldungen auch dann, wenn das Label leicht abweicht. Gross-/Kleinschreibung spielt keine Rolle.
- `kontinent` (Pflicht in der Rubrik `welt`, optional bei Schweiz/KI): genau einer von `Europa`, `Afrika`, `Asien`, `Naher Osten`, `Nordamerika`, `Südamerika`, `Ozeanien`, `Global`. Mittel- und Lateinamerika werden zu `Südamerika` gezählt, Iran, Israel, die Golfstaaten und Ägypten-Gaza-Themen zu `Naher Osten`.
- `land` (Pflicht in `welt`, sonst optional): das wichtigste Land, z. B. `"Sudan"`, `"China"`, `"Brasilien"`; betrifft es mehrere gleichwertig, `"mehrere"`.
- Rubrik `extra` (Titel «Extra», steht in `rubriken` nach `welt`): Hintergrund-Meldungen nach festen Kategorien. Jede Meldung braucht `kategorie` mit genau einem dieser Werte: `Präsidenten & Regierungen`, `Rohstoffe`, `Wahlen weltweit`, `Wirtschaft & Börse`, `Klima & Umwelt`, `Wissenschaft & Weltraum`, `Migration & Flucht`, `Menschenrechte`. **Keine Gesundheits- oder Sportthemen.** Pro Kategorie etwa 1–2 Meldungen aus den letzten 24–48 Stunden. Keine Meldung darf eine Schweiz- oder Welt-Meldung desselben Tages doppeln. Zusätzlich wie überall `titel`, `text`, `datum`, `quelle`, `thema`, `stichworte` und, wo es passt, `kontinent`/`land`. Die erlaubten Kategorien stehen auch in `themen.json` unter `kategorien_extra`.

Im Reiter Welt erscheint daraus eine Filterleiste (Alle + jeder vorkommende Kontinent mit Anzahl). In der Ansicht «Alle» sind die Meldungen nach Kontinent gruppiert, und jede Karte zeigt einen Länder-Chip (z. B. «🌍 Afrika · Sudan»). Die tägliche Routine soll in `welt` möglichst auch Afrika, Lateinamerika, Asien und Südasien abdecken.
- **Die tägliche Routine soll die Labels aus `themen.json` wiederverwenden.** Nur wenn kein bestehendes Label passt, kommt ein neues dazu, das dann in `themen.json` unter `themen` ergänzt wird. Bestehende Labels nie umbenennen, sonst verlieren Leserinnen und Leser ihre gefolgten Themen.
- Gefolgte Themen (`folgen`) und ein Archiv der letzten 14 Ausgaben (`archiv`) speichert die App nur lokal im Browser (localStorage).

## Auf dem Handy installieren

Die App braucht HTTPS, zum Beispiel über die trycloudflare-URL.

- **iPhone (Safari):** URL öffnen, dann **Teilen** (Quadrat mit Pfeil) und **«Zum Home-Bildschirm»** wählen.
- **Android (Chrome):** URL öffnen, dann auf das Banner **«Installieren»** tippen oder im Menü ⋮ **«App installieren»** bzw. **«Zum Startbildschirm hinzufügen»** wählen.

## Vorlesen (Autofahren)
- Jede Meldung hat 🎧 (zur Wiedergabeliste) und ▶ (sofort abspielen); pro Rubrik/Filter «▶ Alle vorlesen».
- Wiedergabeliste mit Gesamtdauer, Reihenfolge ▲▼, Entfernen; Auswahl bleibt gespeichert (localStorage).
- Playerleiste mit ⏮ ⏯ ⏭, Fortschritt, Tempo 0.9/1/1.2/1.5, Media-Session (Sperrbildschirm/Auto), «Bildschirm anlassen» (Wake Lock).
- Audio: vorproduzierte MP3s (edge-tts, Stimme `de-DE-ConradNeural`, rate −10 %, pitch −12 Hz, mono 48 kbit/s) unter `audio/<datum>/`; Ausgaben älter als 3 Tage werden gelöscht. Ohne MP3 springt die Systemstimme ein (nur im Vordergrund).
- Stimme wählen: in `stimme.conf` `STIMME=conrad|opa1|opa2|opa3|opa4` setzen (Varianten in `stimmen.py`), dann `./make_audio.sh` – alle MP3s werden mit der neuen Stimme neu erzeugt.

**Befehl für die tägliche Routine (nach dem Schreiben von news.json):**
```
./make_audio.sh && ./publish.sh "Ausgabe $(date +%F)"
```

## Verlauf bereinigen (wöchentlich)

Die täglichen MP3s lassen das Repo wachsen. Darum ersetzt `./squash.sh` einmal pro Woche die ganze Git-History durch einen einzigen Commit «Stand JJJJ-MM-TT (Verlauf bereinigt)» und macht einen Force-Push nach `origin main` (von Maria erlaubt).

- Vorher: news.json wird geprüft, offene Änderungen werden committet, das Arbeitsverzeichnis muss sauber sein.
- Danach: `git reflog expire --expire=now --all && git gc --prune=now --aggressive`. Dann wird der Pages-Build per API geprüft (bei einem Fehler wird einmal ein Rebuild ausgelöst), und die Live-Seite muss HTTP 200 liefern.
- Der Token kommt nur aus `GITHUB_NEWS_APP_TOKEN` und wird nie ausgegeben oder gespeichert. Exit-Code ≠ 0 bei einem Fehler.
- `./squash.sh --dry-run` prüft nur und pusht nichts.
- Achtung: Alte Versionen sind danach weg, auch auf GitHub.
