(() => {
  const $ = s => document.querySelector(s);
  const root = document.documentElement;
  const fmtDate = (iso, opts) => { try { return new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("de-CH", opts); } catch { return iso; } };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  // Theme
  const saved = localStorage.getItem("theme");
  if (saved) root.dataset.theme = saved;
  const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const syncThemeColor = () => document.querySelectorAll('meta[name=theme-color]').forEach(m => { if (root.dataset.theme) { m.content = isDark() ? "#131920" : "#f7f4ef"; m.removeAttribute("media"); } });
  syncThemeColor();
  $("#theme").onclick = () => { root.dataset.theme = isDark() ? "light" : "dark"; localStorage.setItem("theme", root.dataset.theme); syncThemeColor(); };

  let data = null, current = localStorage.getItem("tab") || "uebersicht";
  const getJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  let follows = getJSON("folgen", []);
  const saveFollows = () => localStorage.setItem("folgen", JSON.stringify(follows));
  const norm = s => String(s || "").toLocaleLowerCase("de-CH").trim();
  const isFollowed = t => follows.some(f => norm(f) === norm(t));
  const toggleFollow = t => { follows = isFollowed(t) ? follows.filter(f => norm(f) !== norm(t)) : [...follows, t]; saveFollows(); render(); };
  // Welches gefolgte Thema passt zur Meldung? Exakt über "thema", sonst unscharf über Stichworte.
  function matchTopic(m) {
    const exact = follows.find(f => norm(f) === norm(m.thema)); if (exact) return exact;
    const words = [m.thema, ...(m.stichworte || [])].map(norm).filter(Boolean);
    return follows.find(f => {
      const toks = norm(f).split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 4);
      return words.some(w => w.includes(norm(f)) || norm(f).includes(w) || toks.some(t => w.split(/[^\p{L}\p{N}]+/u).includes(t)));
    }) || null;
  }
  const KONT = ["Europa", "Naher Osten", "Asien", "Afrika", "Nordamerika", "Südamerika", "Ozeanien", "Global"];
  const KICON = { "Europa": "🌍", "Afrika": "🌍", "Naher Osten": "🌍", "Asien": "🌏", "Ozeanien": "🌏", "Nordamerika": "🌎", "Südamerika": "🌎", "Global": "🌐" };
  let kfilter = localStorage.getItem("kontinent") || "Alle";
  const geoChip = m => m.kontinent ? `<span class="geo">${KICON[m.kontinent] || "🌐"} ${esc(m.kontinent)}${m.land ? ` · ${esc(m.land)}` : ""}</span>` : "";
  function renderWelt(r) {
    const counts = {}; r.meldungen.forEach(m => { const k = m.kontinent || "Global"; counts[k] = (counts[k] || 0) + 1; });
    const ks = KONT.filter(k => counts[k]);
    if (kfilter !== "Alle" && !counts[kfilter]) kfilter = "Alle";
    let h = `<div class="kfilter" role="toolbar" aria-label="Nach Kontinent filtern">${["Alle", ...ks].map(k => `<button class="kchip" data-k="${esc(k)}" aria-pressed="${k === kfilter}">${esc(k)} <span>${k === "Alle" ? r.meldungen.length : counts[k]}</span></button>`).join("")}</div>`;
    const of = k => r.meldungen.filter(m => (m.kontinent || "Global") === k);
    h += kfilter === "Alle" ? ks.map(k => `<div class="section-title"><span>${KICON[k]} ${esc(k)}</span><span>${counts[k]}</span></div>${of(k).map(m => card(m)).join("")}`).join("")
      : of(kfilter).map(m => card(m)).join("");
    return h;
  }
  const KAT = ["Präsidenten & Regierungen", "Rohstoffe", "Wahlen weltweit", "Wirtschaft & Börse", "Klima & Umwelt", "Wissenschaft & Weltraum", "Migration & Flucht", "Menschenrechte"];
  const KATICON = { "Präsidenten & Regierungen": "🏛️", "Rohstoffe": "⛏️", "Wahlen weltweit": "🗳️", "Wirtschaft & Börse": "📈", "Klima & Umwelt": "🌱", "Wissenschaft & Weltraum": "🔭", "Migration & Flucht": "🧳", "Menschenrechte": "⚖️" };
  let katfilter = localStorage.getItem("kategorie") || "Alle";
  function renderExtra(r) {
    const counts = {}; r.meldungen.forEach(m => { counts[m.kategorie] = (counts[m.kategorie] || 0) + 1; });
    const ks = KAT.filter(k => counts[k]);
    if (katfilter !== "Alle" && !counts[katfilter]) katfilter = "Alle";
    let h = `<div class="kfilter" role="toolbar" aria-label="Nach Kategorie filtern">${["Alle", ...ks].map(k => `<button class="kchip" data-g="kat" data-k="${esc(k)}" aria-pressed="${k === katfilter}">${k === "Alle" ? "" : KATICON[k] + " "}${esc(k)} <span>${k === "Alle" ? r.meldungen.length : counts[k]}</span></button>`).join("")}</div>`;
    const of = k => r.meldungen.filter(m => m.kategorie === k);
    h += katfilter === "Alle" ? ks.map(k => `<div class="section-title"><span>${KATICON[k]} ${esc(k)}</span><span>${counts[k]}</span></div>${of(k).map(m => card(m)).join("")}`).join("")
      : of(katfilter).map(m => card(m)).join("");
    return h;
  }
  const allMeldungen = d => d.rubriken.flatMap(r => r.meldungen.map(m => ({ ...m, rubrik: r.titel })));
  function archive() {
    const a = getJSON("archiv", {});
    a[data.datum] = allMeldungen(data).filter(m => m.thema).map(({ id, titel, text, ausfuehrlich, weitere_quellen, datum, quelle, thema, stichworte, rubrik, kontinent, land, kategorie }) => ({ id, titel, text, ausfuehrlich, weitere_quellen, datum, quelle, thema, stichworte, rubrik, kontinent, land, kategorie }));
    const keep = Object.keys(a).sort().reverse().slice(0, 14);
    const out = {}; keep.forEach(k => out[k] = a[k]);
    try { localStorage.setItem("archiv", JSON.stringify(out)); } catch {}
    return out;
  }
  const followHits = () => allMeldungen(data).filter(matchTopic);

  function renderTabs() {
    const n = followHits().length;
    const tabs = [{ id: "uebersicht", titel: "Übersicht" }, ...data.rubriken.map(r => ({ id: r.id, titel: r.titel })), { id: "folgen", titel: "Folgen", badge: n }];
    if (!tabs.some(t => t.id === current)) current = "uebersicht";
    $("#tabs").innerHTML = tabs.map(t => `<button role="tab" data-id="${esc(t.id)}" aria-selected="${t.id === current}">${esc(t.titel)}${t.badge ? ` <span class="badge">${t.badge}</span>` : ""}</button>`).join("");
    $("#tabs").querySelectorAll("button").forEach(b => b.onclick = () => { current = b.dataset.id; localStorage.setItem("tab", current); render(); scrollTo({ top: 0 }); });
  }

  const rid = m => { const r = m.rubrik && data.rubriken.find(x => x.titel === m.rubrik); return r ? r.id : ""; };
  function fullBlock(m) {
    if (!m.ausfuehrlich) return "";
    const paras = String(m.ausfuehrlich).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join("");
    const qs = [m.quelle, ...(m.weitere_quellen || [])].filter(q => q && q.url);
    const links = qs.length ? `<div class="full-src"><span>Quellen:</span> ${qs.map(q => `<a href="${esc(q.url)}" target="_blank" rel="noopener noreferrer">${esc(q.name || "Quelle")}</a>`).join(" · ")}</div>` : "";
    return `<button class="full-toggle" aria-expanded="false">Ganze Meldung lesen ▾</button><div class="full" aria-hidden="true"><div class="full-inner">${paras}${links}</div></div>`;
  }
  function card(m, rubrik, showFollow = true) {
    const long = !m.ausfuehrlich && (m.text || "").length > 280;
    const f = m.thema && isFollowed(m.thema);
    return `<article class="card"${rid(m) ? ` data-r="${rid(m)}"` : ""}${m.id ? ` data-id="${esc(m.id)}"` : ""}>
      <div class="meta">${rubrik ? `<span class="tag">${esc(rubrik)}</span>·` : ""}<time datetime="${esc(m.datum)}">${esc(fmtDate(m.datum, { day: "numeric", month: "long", year: "numeric" }))}</time>${geoChip(m)}</div>
      <h2>${esc(m.titel)}</h2>
      <p class="text${long ? " clamp" : ""}">${esc(m.text)}</p>
      ${long ? `<button class="more" aria-expanded="false">Weiterlesen</button>` : ""}
      ${fullBlock(m)}
      <div class="card-foot">
        ${m.id ? `<span class="listen"><button class="pick" data-id="${esc(m.id)}" aria-pressed="false" aria-label="Zur Wiedergabeliste">🎧</button><button class="playone" data-id="${esc(m.id)}" aria-label="Jetzt vorlesen">▶</button></span>` : ""}
        ${m.quelle?.url ? `<a class="source" href="${esc(m.quelle.url)}" target="_blank" rel="noopener noreferrer">${esc(m.quelle.name || "Quelle")}</a>` : "<span></span>"}
        ${m.thema && showFollow ? `<button class="follow${f ? " on" : ""}" data-thema="${esc(m.thema)}" aria-pressed="${!!f}"><span class="chip">${esc(m.thema)}</span>${f ? "★ Folge ich" : "☆ Folgen"}</button>` : ""}
      </div>
    </article>`;
  }

  function renderFolgen(arch) {
    if (!follows.length) return `<div class="empty-follow"><div class="big">☆</div><b>Du folgst noch keinem Thema.</b><p>Tippe bei einer Meldung auf «☆ Folgen». Dann siehst du hier alle Meldungen zu diesem Thema, auch an den nächsten Tagen.</p></div>`;
    let h = `<div class="section-title"><span>Gefolgte Themen</span><span>${follows.length}</span></div><div class="chips">${follows.map(f => `<span class="chip big">${esc(f)}<button class="unfollow" data-thema="${esc(f)}" aria-label="${esc(f)} entfolgen">×</button></span>`).join("")}</div>`;
    const hits = followHits(), groups = {};
    hits.forEach(m => (groups[matchTopic(m)] ||= []).push(m));
    h += hits.length ? follows.filter(f => groups[f]).map(f => `<div class="section-title"><span>${esc(f)}</span><span>${groups[f].length}</span></div>${groups[f].map(m => card(m, m.rubrik)).join("")}`).join("")
      : `<div class="empty">In der heutigen Ausgabe gibt es keine Meldung zu deinen Themen.</div>`;
    const older = Object.keys(arch).filter(k => k !== data.datum).sort().reverse().flatMap(k => arch[k].filter(matchTopic).map(m => ({ ...m, ausgabe: k })));
    if (older.length) h += `<div class="section-title"><span>Frühere Meldungen</span><span>${older.length}</span></div>` + older.map(m => `<div class="past"><time>${esc(fmtDate(m.ausgabe, { day: "numeric", month: "short" }))}</time><div><span class="chip">${esc(m.thema)}</span> ${m.quelle?.url ? `<a href="${esc(m.quelle.url)}" target="_blank" rel="noopener noreferrer">${esc(m.titel)}</a>` : esc(m.titel)}${fullBlock(m)}</div></div>`).join("");
    return h;
  }

  function render() {
    const arch = archive();
    renderTabs();
    document.body.dataset.r = current;
    $("#ausgabe").textContent = fmtDate(data.datum, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    let html = "";
    if (current === "uebersicht") {
      html = data.rubriken.map(r => `<div data-r="${esc(r.id)}"><div class="section-title"><span>${esc(r.titel)}</span><span>${r.meldungen.length}</span></div>
        <div class="card">${r.meldungen.map((m, i) => `<button class="overview-item" data-r="${esc(r.id)}" data-i="${i}">${esc(m.titel)}</button>`).join("")}</div></div>`).join("");
    } else if (current === "folgen") {
      html = renderFolgen(arch);
    } else {
      const r = data.rubriken.find(r => r.id === current);
      html = r.id === "welt" && r.meldungen.length ? renderWelt(r) : r.id === "extra" && r.meldungen.length ? renderExtra(r) : r.meldungen.length ? r.meldungen.map(m => card(m)).join("") : `<div class="empty">Keine Meldungen.</div>`;
    }
    const upd = data.aktualisiert ? new Date(data.aktualisiert).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Zurich" }) : "";
    $("#content").innerHTML = html + `<div class="footer">Stand: ${esc(upd)} (Schweizer Zeit)</div>`;
    $("#content").querySelectorAll(".more").forEach(b => b.onclick = () => {
      const p = b.previousElementSibling, open = p.classList.toggle("clamp");
      b.textContent = open ? "Weiterlesen" : "Weniger"; b.setAttribute("aria-expanded", !open);
    });
    $("#content").querySelectorAll(".full-toggle").forEach(b => b.onclick = () => {
      const f = b.nextElementSibling, open = !f.classList.contains("open");
      f.classList.toggle("open", open); f.setAttribute("aria-hidden", !open);
      b.textContent = open ? "Weniger ▴" : "Ganze Meldung lesen ▾"; b.setAttribute("aria-expanded", open);
      if (!open) { const c = b.closest(".card,.past"); c && c.getBoundingClientRect().top < 0 && c.scrollIntoView({ behavior: "smooth", block: "start" }); }
    });
    $("#content").querySelectorAll(".follow").forEach(b => b.onclick = () => toggleFollow(b.dataset.thema));
    const kf = $(".kfilter"), ka = kf && kf.querySelector('[aria-pressed="true"]');
    if (ka) kf.scrollLeft = ka.offsetLeft - (kf.clientWidth - ka.offsetWidth) / 2;
    $("#content").querySelectorAll(".kchip").forEach(b => b.onclick = () => { if (b.dataset.g === "kat") { katfilter = b.dataset.k; localStorage.setItem("kategorie", katfilter); } else { kfilter = b.dataset.k; localStorage.setItem("kontinent", kfilter); } render(); });
    $("#content").querySelectorAll(".unfollow").forEach(b => b.onclick = () => toggleFollow(b.dataset.thema));
    $("#content").querySelectorAll(".overview-item").forEach(b => b.onclick = () => {
      current = b.dataset.r; localStorage.setItem("tab", current); render();
      if (current === "welt" && kfilter !== "Alle") { kfilter = "Alle"; localStorage.setItem("kontinent", "Alle"); render(); }
      if (current === "extra" && katfilter !== "Alle") { katfilter = "Alle"; localStorage.setItem("kategorie", "Alle"); render(); }
      const m = data.rubriken.find(x => x.id === current).meldungen[+b.dataset.i];
      const el = [...$("#content").querySelectorAll(".card")].find(c => c.querySelector("h2")?.textContent === m.titel);
      el && el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    window.Player && Player.bind($("#content"), current, data);
  }

  async function load() {
    const btn = $("#refresh"); btn.classList.add("spin");
    try {
      const res = await fetch("./news.json?ts=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      data = await res.json();
      $("#offline").hidden = res.headers.get("X-From-Cache") !== "1" && navigator.onLine;
    } catch (e) {
      const c = window.caches && await caches.match("./news.json", { ignoreSearch: true });
      if (c) { data = await c.json(); $("#offline").hidden = false; }
      else if (!data) { $("#content").innerHTML = `<div class="empty">Die Nachrichten konnten nicht geladen werden.</div>`; }
    } finally { btn.classList.remove("spin"); }
    if (data) render();
  }
  $("#refresh").onclick = load;

  // Pull-to-refresh
  let startY = null, pulled = false; const ptr = $("#ptr");
  addEventListener("touchstart", e => { startY = scrollY <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  addEventListener("touchmove", e => { if (startY == null) return; const d = e.touches[0].clientY - startY; pulled = d > 80; ptr.style.opacity = Math.min(1, Math.max(0, d / 80)); ptr.style.transform = `translate(-50%,${Math.min(d, 100) - 60}px)`; }, { passive: true });
  addEventListener("touchend", () => { if (pulled) load(); startY = null; pulled = false; ptr.style.opacity = 0; ptr.style.transform = "translate(-50%,-60px)"; });

  // Install-Banner
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const dismissed = localStorage.getItem("installDismissed");
  let deferred = null;
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; if (!dismissed) { $("#install-btn").hidden = false; $("#install").hidden = false; } });
  $("#install-btn").onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $("#install").hidden = true; };
  $("#install-close").onclick = () => { $("#install").hidden = true; localStorage.setItem("installDismissed", "1"); };
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (ios && !standalone && !dismissed) { $("#install-text").innerHTML = "Zum Homescreen hinzufügen: Tippe auf <b>Teilen</b> und dann auf <b>«Zum Home-Bildschirm»</b>."; $("#install").hidden = false; }

  addEventListener("online", load);
  addEventListener("offline", () => { $("#offline").hidden = false; });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  load();
})();
