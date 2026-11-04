// Vorlesen: Wiedergabeliste, Player-Leiste, Media Session, Wake Lock, speechSynthesis-Fallback
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const audio = $("#audio"), bar = $("#player"), sheet = $("#sheet");
  const RATES = [0.9, 1, 1.2, 1.5];
  let data = null, items = {}, sel = get("playlist", []), queue = [], idx = -1, playing = false, tts = false;
  let rate = get("rate", 1), wake = get("wake", true), lock = null, rootEl = null, tab = null;
  const save = () => localStorage.setItem("playlist", JSON.stringify(sel));
  const fmtMin = s => { const m = Math.round(s / 60); return m < 1 ? "< 1 Min" : m + " Min"; };
  const fmtT = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const estimate = m => m.dauer || Math.round(((m.titel || "") + " " + (m.text || "")).split(/\s+/).length / 2.4);
  const total = ids => ids.reduce((a, id) => a + (items[id] ? estimate(items[id]) : 0), 0);

  function index(d) {
    items = {};
    d.rubriken.forEach(r => r.meldungen.forEach(m => { if (m.id) items[m.id] = { ...m, rubrik: r.titel, rid: r.id }; }));
    sel = sel.filter(id => items[id]); save();
  }

  // ---------- Wake Lock ----------
  async function wakeOn() {
    if (!wake || !playing || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    try { if (!lock) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); } } catch { lock = null; }
  }
  function wakeOff() { try { lock && lock.release(); } catch {} lock = null; }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") wakeOn(); });

  // ---------- Media Session ----------
  const ms = "mediaSession" in navigator ? navigator.mediaSession : null;
  function meta(m) {
    if (!ms || !window.MediaMetadata) return;
    ms.metadata = new MediaMetadata({ title: m.titel, artist: m.kategorie || m.rubrik, album: "Tagesübersicht",
      artwork: [{ src: "./icons/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "./icons/icon-512.png", sizes: "512x512", type: "image/png" }] });
  }
  function posState() { try { if (ms && ms.setPositionState && audio.duration && isFinite(audio.duration)) ms.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) }); } catch {} }
  if (ms) {
    const h = (a, f) => { try { ms.setActionHandler(a, f); } catch {} };
    h("play", () => resume()); h("pause", () => pause());
    h("nexttrack", () => next()); h("previoustrack", () => prev());
    h("seekbackward", e => seek(audio.currentTime - (e.seekOffset || 15)));
    h("seekforward", e => seek(audio.currentTime + (e.seekOffset || 15)));
    h("seekto", e => seek(e.seekTime)); h("stop", () => stop());
  }

  // ---------- Wiedergabe ----------
  function voice() {
    const vs = speechSynthesis.getVoices();
    return vs.find(v => /de[-_]CH/i.test(v.lang)) || vs.find(v => /de[-_]DE/i.test(v.lang)) || vs.find(v => /^de/i.test(v.lang));
  }
  function playIdx(i) {
    if (i < 0 || i >= queue.length) { stop(); return; }
    idx = i; const m = items[queue[idx]]; if (!m) return next();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    meta(m); playing = true;
    if (m.audio) {
      tts = false; audio.src = m.audio; audio.playbackRate = rate;
      audio.play().catch(() => { playing = false; draw(); });
    } else if ("speechSynthesis" in window) {
      tts = true; audio.removeAttribute("src"); audio.load();
      const u = new SpeechSynthesisUtterance(`${m.titel}. ${m.text}`);
      u.lang = "de-CH"; const v = voice(); if (v) u.voice = v; u.rate = rate;
      u.onend = () => { if (playing && tts) setTimeout(next, 600); };
      speechSynthesis.speak(u);
    } else return next();
    if (ms) ms.playbackState = "playing";
    wakeOn(); draw(); mark();
  }
  function start(ids, from = 0) { queue = ids.filter(id => items[id]); if (!queue.length) return; closeSheet(); playIdx(from); }
  function pause() { playing = false; if (tts) speechSynthesis.pause(); else audio.pause(); if (ms) ms.playbackState = "paused"; wakeOff(); draw(); }
  function resume() { if (idx < 0) { if (sel.length) start(sel); return; } playing = true; if (tts) speechSynthesis.resume(); else audio.play().catch(() => {}); if (ms) ms.playbackState = "playing"; wakeOn(); draw(); }
  function next() { if (idx + 1 < queue.length) playIdx(idx + 1); else stop(); }
  function prev() { if (!tts && audio.currentTime > 4) { seek(0); return; } playIdx(Math.max(0, idx - 1)); }
  function seek(t) { if (tts || !audio.duration) return; audio.currentTime = Math.max(0, Math.min(audio.duration - 0.2, t)); posState(); }
  function stop() { playing = false; tts = false; if ("speechSynthesis" in window) speechSynthesis.cancel(); audio.pause(); audio.removeAttribute("src"); audio.load(); queue = []; idx = -1; if (ms) ms.playbackState = "none"; wakeOff(); draw(); mark(); }
  audio.addEventListener("ended", () => { if (playing) setTimeout(next, 700); });
  audio.addEventListener("timeupdate", () => { const p = $("#pl-prog"); if (p && audio.duration) { p.max = audio.duration; p.value = audio.currentTime; $("#pl-time").textContent = fmtT(audio.currentTime) + " / " + fmtT(audio.duration); } });
  audio.addEventListener("loadedmetadata", posState);
  audio.addEventListener("ratechange", posState);
  audio.addEventListener("error", () => { if (playing && audio.getAttribute("src")) setTimeout(next, 500); });

  // ---------- Auswahl ----------
  function toggle(id) { sel = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]; save(); mark(); draw(); if (!sheet.hidden) openSheet(); }
  function mark() {
    document.querySelectorAll(".pick").forEach(b => { const on = sel.includes(b.dataset.id); b.setAttribute("aria-pressed", on); b.classList.toggle("on", on); });
    const cur = idx >= 0 ? queue[idx] : null;
    document.querySelectorAll(".card[data-id]").forEach(c => c.classList.toggle("now", c.dataset.id === cur));
    document.querySelectorAll(".playone").forEach(b => b.textContent = b.dataset.id === cur && playing ? "❚❚" : "▶");
  }
  function visibleIds() { return [...(rootEl || document).querySelectorAll(".card[data-id]")].map(c => c.dataset.id); }

  // ---------- UI ----------
  function draw() {
    document.body.classList.toggle("has-player", !!(sel.length || idx >= 0));
    if (!sel.length && idx < 0) { bar.hidden = true; return; }
    bar.hidden = false;
    const m = idx >= 0 ? items[queue[idx]] : null;
    if (!m) {
      bar.innerHTML = `<div class="pl-idle"><button class="pl-list" id="pl-open">🎧 <b>${sel.length}</b> ausgewählt · ${fmtMin(total(sel))}</button><button class="pl-big primary" id="pl-startsel" aria-label="Wiedergabeliste abspielen">▶</button></div>`;
    } else {
      bar.innerHTML = `<div class="pl-top"><div class="pl-info"><span class="pl-r" data-r="${esc(m.rid)}">${esc(m.kategorie || m.rubrik)} · ${idx + 1}/${queue.length}</span><b class="pl-title">${esc(m.titel)}</b></div><button class="pl-small" id="pl-close" aria-label="Stopp">✕</button></div>
        ${tts ? `<div class="pl-hint">Ohne Audiodatei: Vorlesen per Systemstimme, nur bei offener App.</div>` : `<div class="pl-prog-row"><input type="range" id="pl-prog" min="0" max="${audio.duration || 1}" step="1" value="${audio.currentTime || 0}" aria-label="Fortschritt"><span id="pl-time">${fmtT(audio.currentTime)} / ${fmtT(audio.duration || m.dauer)}</span></div>`}
        <div class="pl-ctrl"><button class="pl-small" id="pl-rate" aria-label="Geschwindigkeit">${String(rate).replace(".", ",")}×</button><button class="pl-big" id="pl-prev" aria-label="Zurück">⏮</button><button class="pl-big primary" id="pl-pp" aria-label="${playing ? "Pause" : "Abspielen"}">${playing ? "❚❚" : "▶"}</button><button class="pl-big" id="pl-next" aria-label="Weiter">⏭</button><button class="pl-small" id="pl-open" aria-label="Wiedergabeliste">☰ ${sel.length}</button></div>`;
    }
    const on = (id, f) => { const e = bar.querySelector("#" + id); if (e) e.onclick = f; };
    on("pl-open", openSheet); on("pl-startsel", () => start(sel)); on("pl-close", stop);
    on("pl-prev", prev); on("pl-next", next); on("pl-pp", () => playing ? pause() : resume());
    on("pl-rate", () => { rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length] || 1; localStorage.setItem("rate", rate); audio.playbackRate = rate; draw(); });
    const p = bar.querySelector("#pl-prog"); if (p) p.oninput = () => seek(+p.value);
  }
  function openSheet() {
    sheet.hidden = false;
    sheet.innerHTML = `<div class="sh-head"><b>Wiedergabeliste</b><span>${sel.length} Meldungen · ${fmtMin(total(sel))}</span><button class="pl-small" id="sh-x" aria-label="Schliessen">✕</button></div>
      ${sel.length ? `<ol class="sh-list">${sel.map((id, i) => { const m = items[id]; return `<li data-r="${esc(m.rid)}"><div><span class="pl-r">${esc(m.kategorie || m.rubrik)} · ${fmtMin(estimate(m))}${m.audio ? "" : " · Systemstimme"}</span><b>${esc(m.titel)}</b></div><span class="sh-btns"><button data-a="up" data-i="${i}" aria-label="Nach oben" ${i ? "" : "disabled"}>▲</button><button data-a="down" data-i="${i}" aria-label="Nach unten" ${i < sel.length - 1 ? "" : "disabled"}>▼</button><button data-a="rm" data-i="${i}" aria-label="Entfernen">✕</button></span></li>`; }).join("")}</ol>`
        : `<p class="sh-empty">Noch nichts ausgewählt. Tippe bei einer Meldung auf 🎧.</p>`}
      <label class="sh-wake"><input type="checkbox" id="sh-wake" ${wake ? "checked" : ""}> Bildschirm während der Wiedergabe anlassen${"wakeLock" in navigator ? "" : " (von diesem Browser nicht unterstützt)"}</label>
      <div class="sh-actions"><button class="btn" id="sh-clear" ${sel.length ? "" : "disabled"}>Alle abwählen</button><button class="btn primary" id="sh-play" ${sel.length ? "" : "disabled"}>▶ Abspielen</button></div>`;
    sheet.querySelector("#sh-x").onclick = closeSheet;
    sheet.querySelector("#sh-clear").onclick = () => { sel = []; save(); mark(); draw(); openSheet(); };
    sheet.querySelector("#sh-play").onclick = () => start(sel);
    sheet.querySelector("#sh-wake").onchange = e => { wake = e.target.checked; localStorage.setItem("wake", wake); wake ? wakeOn() : wakeOff(); };
    sheet.querySelectorAll(".sh-btns button").forEach(b => b.onclick = () => {
      const i = +b.dataset.i, a = b.dataset.a;
      if (a === "rm") sel.splice(i, 1); else { const j = a === "up" ? i - 1 : i + 1; [sel[i], sel[j]] = [sel[j], sel[i]]; }
      save(); mark(); draw(); openSheet();
    });
  }
  function closeSheet() { sheet.hidden = true; }

  window.Player = {
    bind(root, current, d) {
      if (d !== data) { data = d; index(d); }
      rootEl = root; tab = current;
      root.querySelectorAll(".pick").forEach(b => b.onclick = () => toggle(b.dataset.id));
      root.querySelectorAll(".playone").forEach(b => b.onclick = () => {
        const id = b.dataset.id;
        if (idx >= 0 && queue[idx] === id) { playing ? pause() : resume(); return; }
        start([id]);
      });
      const ids = visibleIds();
      if (current !== "uebersicht" && ids.length) {
        const t = total(ids), wrap = document.createElement("div");
        wrap.className = "readall";
        wrap.innerHTML = `<button class="btn primary" id="readall">▶ Alle vorlesen <span>${ids.length} · ${fmtMin(t)}</span></button><button class="btn" id="pickall">🎧 Alle auswählen</button>`;
        root.prepend(wrap);
        wrap.querySelector("#readall").onclick = () => start(visibleIds());
        wrap.querySelector("#pickall").onclick = () => { visibleIds().forEach(id => sel.includes(id) || sel.push(id)); save(); mark(); draw(); };
      }
      mark(); draw();
    },
    state: () => ({ sel: [...sel], queue: [...queue], idx, playing, tts, src: audio.getAttribute("src") })
  };
})();
