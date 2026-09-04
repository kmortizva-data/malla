/* Shared behaviour for every page: theme, toasts, one storage interface with two backends
   (the local server's JSON API on the PC, localStorage on the phone copy), "open on disk"
   buttons, the course-map drawer, date helpers, module checkpoints, document task lists. No framework. */
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

  // ---- storage: one interface, two backends ---------------------------------
  // On the PC the server owns notes.json and progress.json; if it is down, or on the
  // phone copy (M.static), the same data lives in this browser's localStorage.
  const LS = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
  };
  M.ls = LS;
  const emptyProgress = () => ({ checkpoints: {}, quiz_attempts: [], flags: [] });
  M.store = {
    local: M.static,                         // true once the server proved unreachable, always on the phone
    async notes() {
      if (!M.static) {
        try { const n = await M.api("/api/notes"); this.local = false; return n; } catch (e) { this.local = true; }
      }
      return LS.get("malla.notes", { days: {}, weeks: {} });
    },
    async saveNotes(payload, merged) {
      if (!M.static) {
        try { await M.api("/api/notes", payload); this.local = false; return "server"; } catch (e) { this.local = true; }
      }
      LS.set("malla.notes", merged);
      return "local";
    },
    async progress() {
      if (!M.static) {
        try { const p = await M.api("/api/progress"); this.local = false; return p; } catch (e) { this.local = true; }
      }
      return LS.get("malla.progress", emptyProgress());
    },
    async update(op) {                       // {op: set_checkpoint | add_attempt | flag, ...}
      if (!M.static) {
        try { await M.api("/api/progress", op); this.local = false; return "server"; } catch (e) { this.local = true; }
      }
      const p = LS.get("malla.progress", emptyProgress());
      p.checkpoints = p.checkpoints || {};
      if (op.op === "set_checkpoint") {
        const byCourse = (p.checkpoints[op.course] = p.checkpoints[op.course] || {});
        const arr = (byCourse[String(op.module)] = byCourse[String(op.module)] || []);
        arr[op.index] = !!op.value;
      } else if (op.op === "add_attempt") {
        (p.quiz_attempts = p.quiz_attempts || []).push(op.attempt);
      } else if (op.op === "flag") {
        const flag = { ...op }; delete flag.op;
        (p.flags = p.flags || []).push(flag);
      }
      LS.set("malla.progress", p);
      return "local";
    },
    savedLabel(where, when) {
      const t = `${M.pad(when.getHours())}:${M.pad(when.getMinutes())}`;
      if (where === "server") return "Saved " + t;
      return M.static ? "Saved on this device " + t : "Server off: kept in this browser only";
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
  M.pad = (n) => String(n).padStart(2, "0");
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
        const st = ((p.checkpoints || {})[b.dataset.course] || {})[b.dataset.module] || [];
        b.checked = !!st[+b.dataset.index];
      });
      counters.forEach((c) => {
        const st = ((p.checkpoints || {})[c.dataset.course] || {})[c.dataset.module] || [];
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
  fetch(P + "data/hub.json").then((r) => r.json()).then((h) => {
    const f = document.getElementById("foot-built");
    if (f && h.built_at) f.textContent = "Pages built " + h.built_at.replace("T", " ").slice(0, 16) + ".";
  }).catch(() => {});
})();
