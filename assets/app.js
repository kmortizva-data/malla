/* Shared behaviour for every page: theme, toasts, one storage interface with two backends
   (the local server's JSON API on the PC, localStorage on the phone copy), an optional two-way
   sync of notes and progress through a private GitHub repository, "open on disk" buttons, the
   course-map drawer, date helpers, module checkpoints, document task lists. No framework. */
(function () {
  const P = window.MALLA_PREFIX || "";
  const M = (window.malla = {});
  M.static = !!window.MALLA_STATIC;           // the phone copy: no server behind the pages
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  M.esc = esc;
  M.pad = (n) => String(n).padStart(2, "0");
  M.hub = fetch(P + "data/hub.json").then((r) => r.json()).catch(() => ({}));

  // ---- theme ----------------------------------------------------------------
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("malla.theme", t); } catch (e) { /* private mode */ }
  }
  const themeBtn = document.getElementById("theme-btn");
  if (themeBtn) themeBtn.addEventListener("click", () =>
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));

  // ---- toast ----------------------------------------------------------------
  let toastTimer;
  M.toast = function (html, ms = 3500) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.innerHTML = html;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  };

  // ---- api (the local server) -----------------------------------------------
  M.api = async function (path, body, method) {
    const opts = { method: method || (body ? "POST" : "GET"), headers: {} };
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    const r = await fetch(path, opts);
    let data = null;
    try { data = await r.json(); } catch (e) { /* no body */ }
    if (!r.ok) throw new Error((data && data.error) || ("HTTP " + r.status));
    return data;
  };

  // ---- data format, version 2 ------------------------------------------------
  // Every note and every checkpoint list carries the time it was written, so two devices merge
  // without asking: the newest entry per key wins, an emptied note stays as a dated tombstone.
  // Mirrors site/notes_sync.py.
  const EPOCH = "2000-01-01T00:00:00Z";
  const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const emptyOf = (kind) => (kind === "notes" ? { version: 2, days: {}, weeks: {} }
    : { version: 2, checkpoints: {}, quiz_attempts: [], flags: [] });
  M.noteText = (e) => (typeof e === "string" ? e : (e && e.text) || "");
  M.states = (e) => (Array.isArray(e) ? e : (e && e.states) || []);
  function upgrade(kind, data) {
    if (!data || typeof data !== "object") return emptyOf(kind);
    if (data.version === 2) return data;
    const out = emptyOf(kind);
    if (kind === "notes") {
      for (const [day, v] of Object.entries(data.days || {})) out.days[day] = typeof v === "object" ? v : { text: String(v), at: EPOCH };
      for (const [wk, fields] of Object.entries(data.weeks || {})) {
        out.weeks[wk] = {};
        for (const [k, v] of Object.entries(fields || {})) out.weeks[wk][k] = typeof v === "object" && !Array.isArray(v) ? v : { text: String(v), at: EPOCH };
      }
    } else {
      for (const [course, mods] of Object.entries(data.checkpoints || {})) {
        out.checkpoints[course] = {};
        for (const [m, st] of Object.entries(mods || {})) out.checkpoints[course][m] = Array.isArray(st) ? { states: st.map(Boolean), at: EPOCH } : st;
      }
      out.quiz_attempts = [...(data.quiz_attempts || [])];
      out.flags = [...(data.flags || [])];
    }
    return out;
  }
  function newer(a, b) {
    if (!a) return b; if (!b) return a;
    if ((a.at || "") !== (b.at || "")) return (a.at || "") > (b.at || "") ? a : b;
    const size = (e) => String(e.text !== undefined ? e.text : (e.states || "")).length;
    return size(a) >= size(b) ? a : b;
  }
  function mergeNotes(a, b) {
    const out = emptyOf("notes");
    for (const day of new Set([...Object.keys(a.days || {}), ...Object.keys(b.days || {})])) out.days[day] = newer((a.days || {})[day], (b.days || {})[day]);
    for (const wk of new Set([...Object.keys(a.weeks || {}), ...Object.keys(b.weeks || {})])) {
      const fa = (a.weeks || {})[wk] || {}, fb = (b.weeks || {})[wk] || {};
      out.weeks[wk] = {};
      for (const k of new Set([...Object.keys(fa), ...Object.keys(fb)])) out.weeks[wk][k] = newer(fa[k], fb[k]);
    }
    return out;
  }
  function mergeProgress(a, b) {
    const out = emptyOf("progress");
    for (const course of new Set([...Object.keys(a.checkpoints || {}), ...Object.keys(b.checkpoints || {})])) {
      const ma = (a.checkpoints || {})[course] || {}, mb = (b.checkpoints || {})[course] || {};
      out.checkpoints[course] = {};
      for (const m of new Set([...Object.keys(ma), ...Object.keys(mb)])) out.checkpoints[course][m] = newer(ma[m], mb[m]);
    }
    const seen = new Set();
    for (const t of [...(a.quiz_attempts || []), ...(b.quiz_attempts || [])]) {
      const key = `${t.finished}|${t.course}|${t.module}`;
      if (!seen.has(key)) { seen.add(key); out.quiz_attempts.push(t); }
    }
    out.quiz_attempts.sort((x, y) => String(x.finished || "").localeCompare(String(y.finished || "")));
    out.quiz_attempts = out.quiz_attempts.slice(-500);
    const seenF = new Set();
    for (const f of [...(a.flags || []), ...(b.flags || [])]) {
      const key = `${f.at}|${f.question_id}`;
      if (!seenF.has(key)) { seenF.add(key); out.flags.push(f); }
    }
    return out;
  }
  const mergeOf = (kind, a, b) => (kind === "notes" ? mergeNotes(a, b) : mergeProgress(a, b));
  M.merge = mergeOf;

  // ---- localStorage ---------------------------------------------------------
  const LS = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
  };
  M.ls = LS;

  // ---- sync through a private GitHub repository (phone copy only) -----------
  // The PC server does the same job in site/notes_sync.py. The token is typed once on the
  // phone and kept in its localStorage; it is never part of the pages.
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(String(b64 || "").replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }
  M.sync = {
    config: null,
    state: { last: {}, error: null },
    onchange: null,
    token() { return LS.get("malla.sync.token", null); },
    setToken(t) { LS.set("malla.sync.token", (t || "").trim() || null); this.state.error = null; },
    ready() { return M.static && !!(this.config && this.config.repo) && !!this.token(); },
    async init() {
      if (this.config === null) { const h = await M.hub; this.config = (h && h.sync) || false; }
    },
    url(kind) {
      const files = this.config.files || {};
      return `https://api.github.com/repos/${this.config.repo}/contents/${files[kind] || kind + ".json"}`;
    },
    headers(json) {
      const h = { Authorization: `Bearer ${this.token()}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
      if (json) h["Content-Type"] = "application/json";
      return h;
    },
    async get(kind) {
      const r = await fetch(`${this.url(kind)}?ref=${encodeURIComponent(this.config.branch || "main")}`, { headers: this.headers(false) });
      if (r.status === 404) return { data: null, sha: null };
      if (r.status === 401 || r.status === 403) throw new Error("GitHub rejected the token (expired, or not allowed on this repository)");
      if (!r.ok) throw new Error("GitHub " + r.status);
      const meta = await r.json();
      let data = null;
      try { data = upgrade(kind, JSON.parse(b64decode(meta.content) || "{}")); } catch (e) { data = emptyOf(kind); }
      return { data, sha: meta.sha };
    },
    async put(kind, data, sha) {
      const body = { message: `${kind}: Malla phone ${nowIso()}`, branch: this.config.branch || "main", content: b64encode(JSON.stringify(data, null, 1)) };
      if (sha) body.sha = sha;
      const r = await fetch(this.url(kind), { method: "PUT", headers: this.headers(true), body: JSON.stringify(body) });
      if (r.status === 409 || r.status === 422) return "conflict";
      if (r.status === 401 || r.status === 403) throw new Error("GitHub rejected the token (expired, or not allowed on this repository)");
      if (!r.ok) throw new Error("GitHub " + r.status);
      return "ok";
    },
    notify() { if (typeof this.onchange === "function") this.onchange(this.state); },
    async pull(kind, local) {
      try {
        const remote = await this.get(kind);
        const merged = mergeOf(kind, local, remote.data || emptyOf(kind));
        LS.set("malla." + kind, merged);
        if (!remote.data || JSON.stringify(merged) !== JSON.stringify(remote.data)) await this.put(kind, merged, remote.sha);
        this.state.last[kind] = nowIso(); this.state.error = null; this.notify();
        return merged;
      } catch (e) { this.state.error = e.message; this.notify(); return local; }
    },
    async push(kind, local) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const remote = await this.get(kind);
          const merged = mergeOf(kind, local, remote.data || emptyOf(kind));
          LS.set("malla." + kind, merged);
          M.store.cache[kind] = merged;
          const res = await this.put(kind, merged, remote.sha);
          if (res === "conflict") continue;
          this.state.last[kind] = nowIso(); this.state.error = null; this.notify();
          return true;
        } catch (e) { this.state.error = e.message; this.notify(); return false; }
      }
      this.state.error = "GitHub kept changing under us; will retry on the next save"; this.notify();
      return false;
    },
  };

  // ---- storage: one interface, two backends ---------------------------------
  // On the PC the server owns notes.json and progress.json (and syncs them with GitHub itself);
  // if it is down, or on the phone copy, the same data lives in this browser's localStorage,
  // synced with GitHub when a token is present.
  M.store = {
    local: M.static,                         // true once the server proved unreachable, always on the phone
    cache: { notes: null, progress: null },
    async load(kind) {
      let data = null;
      if (!M.static) {
        try { data = await M.api("/api/" + kind); this.local = false; } catch (e) { this.local = true; }
      }
      if (!data) data = LS.get("malla." + kind, emptyOf(kind));
      data = upgrade(kind, data);
      if (M.static) { await M.sync.init(); if (M.sync.ready()) data = await M.sync.pull(kind, data); }
      this.cache[kind] = data;
      return data;
    },
    notes() { return this.load("notes"); },
    progress() { return this.load("progress"); },
    async saveNotes(payload) {               // {days: {date: text}, weeks: {isoWeek: {mandatory: text}}}
      const notes = this.cache.notes || upgrade("notes", LS.get("malla.notes", emptyOf("notes"))), at = nowIso();
      for (const [day, text] of Object.entries(payload.days || {})) notes.days[day] = { text, at };
      for (const [wk, fields] of Object.entries(payload.weeks || {})) {
        notes.weeks[wk] = notes.weeks[wk] || {};
        for (const [k, text] of Object.entries(fields || {})) notes.weeks[wk][k] = { text, at };
      }
      this.cache.notes = notes;
      if (!M.static) {
        try { await M.api("/api/notes", payload); this.local = false; return "server"; } catch (e) { this.local = true; }
      }
      LS.set("malla.notes", notes);
      if (M.sync.ready() && await M.sync.push("notes", notes)) return "github";
      return "local";
    },
    async update(op) {                       // {op: set_checkpoint | add_attempt | flag, ...}
      if (!M.static) {
        try { await M.api("/api/progress", op); this.local = false; return "server"; } catch (e) { this.local = true; }
      }
      const p = this.cache.progress || upgrade("progress", LS.get("malla.progress", emptyOf("progress")));
      if (op.op === "set_checkpoint") {
        const byCourse = (p.checkpoints[op.course] = p.checkpoints[op.course] || {});
        const entry = { states: [...M.states(byCourse[String(op.module)])], at: nowIso() };
        while (entry.states.length <= op.index) entry.states.push(false);
        entry.states[op.index] = !!op.value;
        byCourse[String(op.module)] = entry;
      } else if (op.op === "add_attempt") {
        (p.quiz_attempts = p.quiz_attempts || []).push(op.attempt);
      } else if (op.op === "flag") {
        const flag = { ...op }; delete flag.op;
        (p.flags = p.flags || []).push(flag);
      }
      this.cache.progress = p;
      LS.set("malla.progress", p);
      if (M.sync.ready() && await M.sync.push("progress", p)) return "github";
      return "local";
    },
    savedLabel(where, when) {
      const t = `${M.pad(when.getHours())}:${M.pad(when.getMinutes())}`;
      if (where === "server") return "Saved " + t;
      if (where === "github") return "Saved and synced " + t;
      return M.static ? "Saved on this device " + t + (M.sync.ready() ? " (sync failed)" : " (not synced)")
        : "Server off: kept in this browser only";
    },
  };

  // ---- open on disk (delegated; never rendered on the phone copy) ----------
  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest(".open[data-path]");
    if (!b) return;
    ev.preventDefault();
    const path = b.dataset.path, mode = b.dataset.mode || "auto";
    b.disabled = true;
    try {
      const r = await M.api("/api/open", { path, mode });
      M.toast(`Opened (${esc(r.action)})`);
    } catch (e) {
      M.toast(`Could not open: ${esc(e.message)}<br><code>${esc(path)}</code>`, 8000);
    } finally { b.disabled = false; }
  });

  // ---- refresh schedule (PC only) -------------------------------------------
  const rb = document.getElementById("refresh-btn");
  if (rb) rb.addEventListener("click", async () => {
    rb.disabled = true; rb.textContent = "Refreshing…";
    try {
      const r = await M.api("/api/refresh", {});
      const sync = r.steps && r.steps[0];
      M.toast(sync && sync.returncode ? "TimeEdit fetch failed; the banner explains" : "Schedule refreshed", 5000);
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      M.toast("Refresh failed: " + esc(e.message), 6000);
      rb.disabled = false; rb.textContent = "Refresh schedule";
    }
  });

  // ---- course map: a sidebar on wide screens, a drawer behind a button on small ones
  const railBtn = document.getElementById("rail-toggle"), rail = document.getElementById("rail");
  if (railBtn && rail) {
    const setOpen = (open) => {
      document.body.classList.toggle("rail-open", open);
      railBtn.setAttribute("aria-expanded", String(open));
    };
    railBtn.addEventListener("click", (ev) => { ev.stopPropagation(); setOpen(!document.body.classList.contains("rail-open")); });
    document.addEventListener("click", (ev) => {
      if (document.body.classList.contains("rail-open") && !rail.contains(ev.target)) setOpen(false);
    });
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") setOpen(false); });
  }
  if (rail) {
    const cur = rail.querySelector(".rail-item.current");
    if (cur && rail.scrollHeight > rail.clientHeight) rail.scrollTop = Math.max(0, cur.offsetTop - rail.clientHeight / 2);
  }

  // ---- where you are on the study path (feeds "Continue" on the dashboard) --
  if (window.MALLA_NODE && window.MALLA_NODE.course) {
    LS.set("malla.last." + window.MALLA_NODE.course, { ...window.MALLA_NODE, at: new Date().toISOString() });
  }
  M.lastNode = (code) => LS.get("malla.last." + code, null);

  // ---- dates ----------------------------------------------------------------
  M.parseDate = (s) => {
    if (!s) return null;
    if (s.length === 10) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
    return new Date(s);
  };
  M.isoDate = (d) => `${d.getFullYear()}-${M.pad(d.getMonth() + 1)}-${M.pad(d.getDate())}`;
  M.dow3 = (d) => DOW[d.getDay()];
  M.mon3 = (d) => MON[d.getMonth()];
  M.fmtDay = (d) => `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
  M.fmtTime = (d) => `${M.pad(d.getHours())}:${M.pad(d.getMinutes())}`;
  M.sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  M.isoWeek = (d) => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const year = t.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    return { year, week: Math.ceil(((t - yearStart) / 86400000 + 1) / 7) };
  };
  M.mondayOf = (year, week) => {
    const jan4 = new Date(year, 0, 4);          // always inside ISO week 1
    const day = jan4.getDay() || 7;
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - day + 1 + (week - 1) * 7);
    return monday;
  };
  M.fmtWhen = (start, precision) => {
    const d = M.parseDate(start);
    if (!d) return "date unknown";
    if (precision === "week") {
      const end = new Date(d); end.setDate(d.getDate() + 6);
      return `week ${M.isoWeek(d).week} · ${d.getDate()} ${MON[d.getMonth()]}–${end.getDate()} ${MON[end.getMonth()]}`;
    }
    if (precision === "day") return M.fmtDay(d);
    return `${M.fmtDay(d)} ${M.fmtTime(d)}`;
  };
  M.countdown = (to) => {
    const ms = to - Date.now();
    if (ms < 0) return "now";
    const m = Math.round(ms / 60000);
    if (m < 60) return `in ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 48) return `in ${h} h ${m % 60} min`;
    const d = Math.floor(h / 24);
    return `in ${d} d ${h % 24} h`;
  };
  document.querySelectorAll(".when[data-start]").forEach((el) => {
    if (el.dataset.start) el.textContent = M.fmtWhen(el.dataset.start, el.dataset.precision);
  });

  // ---- clock ----------------------------------------------------------------
  const clock = document.getElementById("clock");
  function tick() {
    if (!clock) return;
    const n = new Date();
    clock.textContent = `${M.fmtDay(n)} ${M.fmtTime(n)} · week ${M.isoWeek(n).week}`;
  }
  tick(); setInterval(tick, 30000);

  // ---- module checkpoints ---------------------------------------------------
  const boxes = document.querySelectorAll("input[type=checkbox][data-course][data-module][data-index]");
  const counters = document.querySelectorAll(".progress[data-course]");
  if (boxes.length || counters.length) {
    M.store.progress().then((p) => {
      boxes.forEach((b) => {
        const st = M.states(((p.checkpoints || {})[b.dataset.course] || {})[b.dataset.module]);
        b.checked = !!st[+b.dataset.index];
      });
      counters.forEach((c) => {
        const st = M.states(((p.checkpoints || {})[c.dataset.course] || {})[c.dataset.module]);
        c.textContent = `${st.filter(Boolean).length}/${c.dataset.total} checkpoints`;
      });
      if (boxes.length && M.store.local && !M.static) M.toast("Progress server not reachable; checkpoints stay in this browser", 5000);
    });
    boxes.forEach((b) => b.addEventListener("change", async () => {
      const where = await M.store.update({ op: "set_checkpoint", course: b.dataset.course, module: +b.dataset.module,
        index: +b.dataset.index, value: b.checked });
      if (where === "local" && !M.static) M.toast("Server off: kept in this browser only");
    }));
  }

  // ---- task lists inside documents (this browser only) ----------------------
  const doc = document.querySelector(".doc[data-doc]");
  if (doc) {
    const key = "malla.tasks." + doc.dataset.doc;
    let saved = LS.get(key, {});
    doc.querySelectorAll(".tasklist input").forEach((b, i) => {
      if (saved[i] !== undefined) b.checked = saved[i];
      b.addEventListener("change", () => { saved[i] = b.checked; LS.set(key, saved); });
    });
  }

  // ---- footer ---------------------------------------------------------------
  M.hub.then((h) => {
    const f = document.getElementById("foot-built");
    if (f && h.built_at) f.textContent = "Pages built " + h.built_at.replace("T", " ").slice(0, 16) + ".";
  });
})();
