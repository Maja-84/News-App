"""Stimm-Varianten fürs Vorlesen. Auswahl über stimme.conf (STIMME=...) oder Umgebungsvariable STIMME."""
import asyncio, os, re, subprocess, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
WARM = "lowshelf=f=180:g=3,equalizer=f=2500:t=q:w=1:g=1.5,highshelf=f=6000:g=-6"
ROOM = "aecho=0.8:0.6:35|60:0.12|0.07"
END = "highpass=f=60,alimiter=limit=0.89,loudnorm=I=-17:TP=-1.5:LRA=11"
PRESETS = {
  # klassisch (bisheriger Standard)
  "conrad": dict(engine="edge", voice="de-DE-ConradNeural", rate="-10%", pitch="-12Hz", pause=0, fx=""),
  # Opa 1: nur stark verlangsamt/abgesenkt, warmer EQ, Satzpausen
  "opa1": dict(engine="edge", voice="de-DE-ConradNeural", rate="-20%", pitch="-20Hz", pause=650, fx=f"{WARM},{ROOM}"),
  # Opa 2: Conrad + formantschonende Tonhöhensenkung (rubberband) + leichtes Zittern
  "opa2": dict(engine="edge", voice="de-DE-ConradNeural", rate="-16%", pitch="-10Hz", pause=700,
               fx=f"rubberband=pitch=0.89:formant=preserved ; vibrato=f=5:d=0.03,{WARM},{ROOM}"),
  # Opa 3: Killian sehr langsam + Senkung + etwas stärkeres Zittern + gedämpfte Höhen
  "opa3": dict(engine="edge", voice="de-DE-KillianNeural", rate="-22%", pitch="-22Hz", pause=750,
               fx=f"rubberband=pitch=0.93:formant=preserved ; vibrato=f=4.5:d=0.04,{WARM},lowpass=f=7000,{ROOM}"),
  # Opa 4: Piper Thorsten «sleepy» (offline), gesenkt + warm
  "opa4": dict(engine="piper", model="de_DE-thorsten_emotional-medium", speaker=5, length=1.12, pause=700,
               fx=f"rubberband=pitch=0.88:formant=preserved ; vibrato=f=5:d=0.025,{WARM},{ROOM}"),
}
def choose():
    name = os.environ.get("STIMME")
    conf = os.path.join(HERE, "stimme.conf")
    if not name and os.path.exists(conf):
        for l in open(conf):
            if l.strip().startswith("STIMME="): name = l.split("=", 1)[1].strip().strip('"')
    name = name or "conrad"
    return name, PRESETS[name]
def key(name, p): return name + repr(sorted(p.items()))
def sentences(t):
    return [s for s in re.split(r"(?<=[.!?…])\s+", t) if s.strip()] or [t]
MODELDIR = os.environ.get("PIPER_DIR", os.path.join(HERE, ".piper"))
def piper_model(m):
    os.makedirs(MODELDIR, exist_ok=True); f = os.path.join(MODELDIR, m + ".onnx")
    if not os.path.exists(f):
        base = "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/" + "/".join(m.split("-")[1:2]) + "/" + m.split("-")[2] + "/" + m
        for ext in (".onnx", ".onnx.json"): subprocess.run(["curl", "-sLfo", f[:-5] + ext, base + ext], check=True)
    return f
async def _edge(text, out, p):
    import edge_tts
    for a in range(3):
        try: return await edge_tts.Communicate(text, p["voice"], rate=p["rate"], pitch=p["pitch"]).save(out)
        except Exception:
            if a == 2: raise
            await asyncio.sleep(3)
async def synth(text, out, p):
    with tempfile.TemporaryDirectory() as td:
        parts = sentences(text) if p.get("pause") else [text]
        files = []
        for i, s in enumerate(parts):
            f = os.path.join(td, f"{i}.wav")
            if p["engine"] == "edge":
                await _edge(s, f + ".mp3", p); f += ".mp3"
            else:
                import sys
                piper = os.path.join(os.path.dirname(sys.executable), "piper")
                await asyncio.to_thread(subprocess.run, [piper, "-m", piper_model(p["model"]), "--speaker", str(p["speaker"]),
                    "--length-scale", str(p["length"]), "-f", f], input=s.encode(), check=True, capture_output=True)
            files.append(f)
        inp = sum((["-i", f] for f in files), [])
        pad = p.get("pause", 0) / 1000
        chain = "".join(f"[{i}:a]aresample=24000,aformat=channel_layouts=mono,apad=pad_dur={pad}[a{i}];" for i in range(len(files)))
        chain += "".join(f"[a{i}]" for i in range(len(files))) + f"concat=n={len(files)}:v=0:a=1"
        mix = os.path.join(td, "mix.wav")
        await asyncio.to_thread(subprocess.run, ["ffmpeg", "-y", "-loglevel", "error", *inp, "-filter_complex", chain, mix], check=True)
        passes = [x.strip() for x in (p.get("fx") or "").split(";") if x.strip()]
        for j, f in enumerate(passes[:-1]):  # rubberband in eigenem Durchgang (sonst NaN in Folgefiltern)
            nxt = os.path.join(td, f"fx{j}.wav")
            await asyncio.to_thread(subprocess.run, ["ffmpeg", "-y", "-loglevel", "error", "-i", mix, "-af", f, nxt], check=True); mix = nxt
        fx = ",".join(x for x in (passes[-1] if passes else "", END, "aresample=24000") if x)
        await asyncio.to_thread(subprocess.run, ["ffmpeg", "-y", "-loglevel", "error", "-i", mix, "-af", fx,
            "-ac", "1", "-ar", "24000", "-b:a", "48k", out], check=True)
