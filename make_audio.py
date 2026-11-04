#!/usr/bin/env python3
"""Erzeugt pro Meldung eine MP3 (edge-tts, de-DE-ConradNeural, ruhig und tief) und schreibt audio/dauer/id in news.json."""
import asyncio, hashlib, json, os, re, shutil, subprocess, sys, tempfile, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
import stimmen
NAME, PRESET = stimmen.choose()
KEEP_DAYS = 3

def clean(t):
    t = re.sub(r"https?://\S+", "", t or "")
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"[*_`#>]+", "", t)
    return re.sub(r"\s+", " ", t).strip()

def speech(r, m):
    pre = m.get("kategorie") or r["titel"]
    if m.get("land") and m["land"] != "mehrere": pre += ", " + m["land"]
    body = m.get("ausfuehrlich") or m.get("text") or ""
    body = " ".join(clean(p) for p in re.split(r"\n\s*\n", body) if p.strip())
    warn = "Wichtige Meldung. " if m.get("wichtig") else ""
    return f"{warn}{clean(pre)}. {clean(m['titel'])}. {body}"

async def one(sem, text, out):
    async with sem:
        await stimmen.synth(text, out, PRESET)

def dur(p):
    return round(float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).decode().strip()))

async def main():
    path = os.path.join(HERE, "news.json")
    d = json.load(open(path, encoding="utf-8"))
    day = d["datum"]; outdir = os.path.join(HERE, "audio", day); os.makedirs(outdir, exist_ok=True)
    sem = asyncio.Semaphore(4); jobs = []; items = []
    for r in d["rubriken"]:
        for m in r["meldungen"]:
            m.setdefault("id", f"{r['id']}-{hashlib.sha1(m['titel'].encode()).hexdigest()[:8]}")
            text = speech(r, m)
            h = hashlib.sha1((stimmen.key(NAME, PRESET) + text).encode()).hexdigest()[:6]
            fn = f"{m['id']}-{h}.mp3"; out = os.path.join(outdir, fn)
            for old in os.listdir(outdir):  # veraltete Fassung derselben Meldung
                if old.startswith(m["id"] + "-") and old != fn: os.remove(os.path.join(outdir, old))
            if not os.path.exists(out): jobs.append(one(sem, text, out))
            items.append((m, out, f"audio/{day}/{fn}"))
    await asyncio.gather(*jobs)
    total = 0
    for m, out, rel in items:
        m["audio"] = rel; m["dauer"] = dur(out); total += m["dauer"]
    json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    cut = datetime.date.fromisoformat(day) - datetime.timedelta(days=KEEP_DAYS)
    for x in os.listdir(os.path.join(HERE, "audio")):
        try:
            if datetime.date.fromisoformat(x) < cut: shutil.rmtree(os.path.join(HERE, "audio", x)); print("gelöscht:", x)
        except ValueError: pass
    size = sum(os.path.getsize(os.path.join(outdir, f)) for f in os.listdir(outdir))
    print(f"{len(items)} Meldungen, {len(jobs)} neu, Gesamtdauer {total//60} Min {total%60} s, {size/1e6:.1f} MB (Stimme {NAME})")

asyncio.run(main())
