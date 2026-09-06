/* The dashboard: banner, what-is-next strip, editable week (hour grid on wide screens, a day-by-day
   agenda on phones), semester timeline, course cards. Everything is computed here from
   data/schedule.json, so the page is right every day without a rebuild. Notes and progress go
   through M.store (server on the PC, localStorage on the phone copy). */
(async function () {
  const M = window.malla, P = window.MALLA_PREFIX || "";
  const $ = (id) => document.getElementById(id);
  const [sched, hub] = await Promise.all([
    fetch(P + "data/schedule.json").then((r) => r.json()),
    fetch(P + "data/hub.json").then((r) => r.json()),
  ]);
  const courses = hub.courses;                       // active courses with modules, primers, quizzes
  const allCourses = hub.all_courses || courses;     // every course for the timeline and cards
  const courseByCode = Object.fromEntries(courses.map((c) => [c.code, c]));
  const shortName = (code) => ((allCourses.find((c) => c.code === code) || {}).short) || code || "";
  const events = sched.events.map((e) => ({ ...e, s: M.parseDate(e.start), en: M.parseDate(e.end) }));
  const now = new Date();
  const CLASS_KINDS = new Set(["lecture", "lab", "exercise", "project", "seminar", "exam", "other"]);
  const BREAK_WEEKS = new Set([43, 44, 51, 52, 53, 1]);
  const courseVar = (code) => (code ? `var(--c-${code})` : "var(--k-holiday)");
  const mobile = matchMedia("(max-width: 760px)");

  M.sync.config = hub.sync || false;                 // the private repository the phone syncs with (no token here)
  let notes = await M.store.notes();
  notes.days = notes.days || {}; notes.weeks = notes.weeks || {};
  let progress = await M.store.progress();
  progress.checkpoints = progress.checkpoints || {};
  const serverOff = () => M.store.local && !M.static;

  const endOf = (e) => {
    if (e.precision === "datetime") return e.en;
    const d = M.parseDate(e.end); d.setHours(23, 59, 59); return d;
  };
  const nextOf = (pred) => events.filter((e) => pred(e) && (e.precision === "datetime" ? e.s > now : endOf(e) > now))
    .sort((a, b) => a.s - b.s)[0];
  const shortTitle = (e) => {
    if (e.kind === "release") return `A${e.assignment} released`;
    if (e.kind === "deadline") return `A${e.assignment} due`;
    if (e.kind === "quiz_checkpoint") return `Quiz M${(e.modules || []).join(",")}`;
    if (e.kind === "trip") return e.title;
    return e.title;
  };
  const overlapsDay = (e, d) => { const ds = M.isoDate(d); return e.start.slice(0, 10) <= ds && ds <= e.end.slice(0, 10); };
  const primerFor = (e) => {
    const c = courseByCode[e.course];
    if (!c) return null;
    return (c.primers || []).find((p) => p.event === e.id) || (c.primers || []).find((p) => p.date === e.start.slice(0, 10)) || null;
  };
  const teachersOf = (e) => (e.teachers && e.teachers.length ? " · " + M.esc(e.teachers.join(", ")) : "");
  const pill = (e) =>
    `<span class="pill${e.verified ? "" : " derived"}" style="--pill:${e.course ? courseVar(e.course) : "var(--k-holiday)"}" title="${M.esc(e.title)}${e.notes ? " · " + M.esc(e.notes) : ""}">` +
    `${e.kind === "deadline" ? "⚑ " : e.kind === "quiz_checkpoint" ? "◆ " : e.kind === "release" ? "↑ " : ""}${M.esc(shortTitle(e))}</span>`;

  // ---------------------------------------------------------------- banner
  function renderBanner() {
    const items = [];
    const live = sched.meta.sources.timeedit_live || {};
    const staleDays = sched.meta.stale_after_days || 7;
    if (live.urls && live.urls.length && !live.ok) {
      items.push(["bad", `<strong>Live schedule fetch failed.</strong> ${M.esc((live.errors || []).join(" · "))}. Showing the last good data.`]);
    }
    if (live.fetched_at && (now - new Date(live.fetched_at)) / 86400000 > staleDays) {
      items.push(["bad", `<strong>Schedule not refreshed since ${M.esc(live.fetched_at.slice(0, 10))}.</strong> ` +
        (M.static ? "Redeploy from the PC to update this copy." : "Press “Refresh schedule”.")]);
    }
    if (serverOff()) items.push(["bad", "<strong>The local server is not running.</strong> Notes stay in this browser only; folder buttons will not work. Start <code>site/serve.py</code>."]);
    const seedCourses = Object.entries(sched.meta.coverage || {}).filter(([, how]) => how === "seed").map(([c]) => c);
    if (seedCourses.length) {
      items.push(["warn", `<strong>${seedCourses.join(", ")}</strong> come from the manual TimeEdit export of ${M.esc(sched.meta.sources.timeedit_seed.exported_at)}. ` +
        (M.static ? "Their live TimeEdit links are configured on the PC copy." : `Paste their TimeEdit links into <code>data/schedule/timeedit_urls.txt</code> to refresh them automatically.`)]);
    }
    if (now >= M.mondayOf(2026, 42)) {
      for (const c of courses) {
        const last = events.filter((e) => e.course === c.code && e.source.startsWith("timeedit")).map((e) => e.s).sort((a, b) => b - a)[0];
        if (last && last < M.mondayOf(2026, 45)) {
          items.push(["warn", `<strong>${c.code}:</strong> study period 2 (weeks 45 to 2) is not in TimeEdit yet; last published session ${M.fmtDay(last)}.`]);
        }
      }
    }
    const el = $("banner");
    if (!items.length) { el.hidden = true; return; }
    el.hidden = false;
    el.className = "banner " + (items.some((i) => i[0] === "bad") ? "banner-bad" : "banner-warn");
    el.innerHTML = items.map((i) => `<div>${i[1]}</div>`).join("");
  }

  // ---------------------------------------------------------------- strip
  function fill(id, e, tpl) {
    const card = $(id), body = card.querySelector(".next-body");
    if (!e) { body.innerHTML = '<span class="muted">Nothing ahead in the schedule.</span>'; return; }
    body.classList.remove("muted");
    body.innerHTML = tpl(e);
    if (e.course) { card.dataset.course = e.course; card.style.setProperty("--accent", courseVar(e.course)); }
  }
  function renderStrip() {
    const nc = nextOf((e) => CLASS_KINDS.has(e.kind) && e.course && e.precision === "datetime");
    fill("next-class", nc, (e) => {
      const pr = primerFor(e);
      return `<div class="big">${M.esc(e.activity)} · ${M.esc(shortName(e.course))}</div>` +
        `<div class="count">${M.countdown(e.s)}</div>` +
        `<div class="meta">${M.fmtDay(e.s)} ${M.fmtTime(e.s)}–${M.fmtTime(e.en)} · ${M.esc(e.location || "room tba")}${teachersOf(e)}</div>` +
        (pr ? `<div class="meta"><a href="${P + pr.url}">Primer: ${M.esc(pr.title)}</a>${pr.minutes ? ` · ${M.esc(pr.minutes)} min` : ""}</div>`
            : '<div class="meta muted">No primer written for this session yet.</div>');
    });
    const nd = nextOf((e) => e.kind === "deadline");
    fill("next-deadline", nd, (e) =>
      `<div class="big">${M.esc(e.title)}</div><div class="count">${M.countdown(e.precision === "datetime" ? e.s : endOf(e))}</div>` +
      `<div class="meta">${M.fmtWhen(e.start, e.precision)}${e.location ? " · " + M.esc(e.location) : ""} ` +
      (e.verified ? "" : '<span class="tag tag-derived" title="Study plan week + TimeEdit seminar; not confirmed by the teacher">derived</span>') + `</div>` +
      (e.canvas_url ? `<div class="meta"><a href="${e.canvas_url}" target="_blank" rel="noopener">Assignment in Canvas</a></div>` : ""));
    const nq = nextOf((e) => e.kind === "quiz_checkpoint");
    fill("next-quiz", nq, (e) => {
      const c = courseByCode[e.course];
      const links = (e.modules || []).map((m) => {
        const q = ((c || {}).quizzes || []).find((q) => q.module === m);
        return q ? `<a href="${P + q.url}">practice M${m}</a>` : `M${m}: no practice bank yet`;
      }).join(" · ");
      return `<div class="big">${M.esc(e.title)}</div><div class="count">${M.countdown(endOf(e))}</div>` +
        `<div class="meta">${M.fmtWhen(e.start, "week")} · take it in Canvas by Sunday</div><div class="meta">${links}</div>`;
    });
    const { week } = M.isoWeek(now);
    const body = $("plan-week").querySelector(".next-body");
    const parts = [];
    for (const c of courses) {
      const w = (sched.plan_weeks[c.code] || {})[String(week)];
      if (!w) continue;
      const list = w.sessions.length ? `<ul class="plan-list">${w.sessions.map((x) => `<li>${M.esc(x)}</li>`).join("")}</ul>` : "";
      parts.push(`<div class="big">${M.esc(c.short)} · week ${week}</div>${w.note ? `<div class="meta">${M.esc(w.note)}</div>` : ""}${list}` +
        (w.modules.length ? `<div class="meta">Canvas module ${w.modules.join(", ")}</div>` : ""));
    }
    body.classList.remove("muted");
    body.innerHTML = parts.join("") || '<span class="muted">Nothing in the study plan for this week.</span>';
  }

  // ---------------------------------------------------------------- week: shared state
  const H0 = 8, H1 = 19;
  function mondayOfDate(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay() || 7;
    x.setDate(x.getDate() - day + 1);
    return x;
  }
  let monday = mondayOfDate(now);
  const params = new URLSearchParams(location.search);
  if (params.get("week")) {
    const [y, w] = params.get("week").split("-W").map(Number);
    if (y && w) monday = M.mondayOf(y, w);
  }
  function layout(items) {
    items.sort((a, b) => a.s - b.s);
    const clusters = [];
    for (const e of items) {
      const last = clusters[clusters.length - 1];
      if (last && last.end > e.s) { last.items.push(e); if (e.en > last.end) last.end = e.en; }
      else clusters.push({ items: [e], end: e.en });
    }
    const out = [];
    for (const c of clusters) {
      const laneEnd = [];
      const placed = [];
      for (const e of c.items) {
        let lane = laneEnd.findIndex((end) => end <= e.s);
        if (lane < 0) { lane = laneEnd.length; laneEnd.push(e.en); } else laneEnd[lane] = e.en;
        placed.push({ e, lane });
      }
      for (const p of placed) out.push({ ...p, lanes: laneEnd.length });
    }
    return out;
  }
  function renderWeek() {
    const days = [...Array(7)].map((_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
    const sunday = days[6];
    const { year, week } = M.isoWeek(monday);
    const wk = `${year}-W${M.pad(week)}`;
    $("week-title").textContent = `Week ${week}`;
    $("week-sub").textContent = `${M.fmtDay(monday)} – ${M.fmtDay(sunday)} ${sunday.getFullYear()}`;
    history.replaceState(null, "", `?week=${wk}`);
    const agenda = mobile.matches;
    $("grid-wrap").hidden = agenda; $("notes").hidden = agenda; $("agenda").hidden = !agenda;
    if (agenda) { $("grid").innerHTML = ""; $("notes").innerHTML = ""; renderAgenda(days, wk); }
    else { $("agenda").innerHTML = ""; renderGrid(days, wk); }
    document.querySelectorAll("#notes textarea, #agenda textarea").forEach((t) => t.addEventListener("input", () => queueSave(t)));
    $("save-state").textContent = serverOff() ? "Server off: notes kept in this browser only" : "";
  }

  // ---------------------------------------------------------------- week: the hour grid (wide screens)
  function renderGrid(days, wk) {
    let h = '<div class="g-corner"></div>';
    for (const d of days) {
      h += `<div class="g-head${M.sameDay(d, now) ? " today" : ""}"><div class="dow">${M.dow3(d)}</div><div class="dom">${d.getDate()} ${M.mon3(d)}</div></div>`;
    }
    const weekItems = events.filter((e) => e.precision === "week" && overlapsDay(e, days[0]));
    h += '<div class="g-allday-label">this week</div>';
    h += `<div class="g-allday g-weekrow">${weekItems.map(pill).join("") || '<span class="muted small">nothing week-wide in the study plan</span>'}</div>`;
    h += '<div class="g-allday-label">all day</div>';
    for (const d of days) {
      const items = events.filter((e) => e.precision === "day" && overlapsDay(e, d));
      h += `<div class="g-allday">${items.map(pill).join("")}</div>`;
    }
    h += `<div class="g-hours">${[...Array(H1 - H0)].map((_, i) => `<span style="top:calc(var(--hour) * ${i})">${M.pad(H0 + i)}</span>`).join("")}</div>`;
    for (const d of days) {
      const items = layout(events.filter((e) => e.precision === "datetime" && M.sameDay(e.s, d)));
      const today = M.sameDay(d, now), weekend = d.getDay() === 0 || d.getDay() === 6;
      let cell = `<div class="g-day${today ? " today" : ""}${weekend ? " weekend" : ""}">`;
      for (const it of items) {
        const e = it.e;
        const top = ((e.s.getHours() + e.s.getMinutes() / 60) - H0) * 100 / (H1 - H0);
        const bottom = ((e.en.getHours() + e.en.getMinutes() / 60) - H0) * 100 / (H1 - H0);
        const w = 100 / it.lanes;
        cell += `<div class="ev ${e.kind}${e.en < now ? " past" : ""}" style="--ev:${courseVar(e.course)};top:${top}%;height:${Math.max(bottom - top, 4)}%;` +
          `left:calc(${it.lane * w}% + 3px);right:calc(${(it.lanes - it.lane - 1) * w}% + 3px)" title="${M.esc(e.title)}${teachersOf(e)}">` +
          `<div class="ev-t">${M.fmtTime(e.s)}–${M.fmtTime(e.en)}</div><div class="ev-k">${M.esc(e.activity)} · ${M.esc(shortName(e.course) || "")}</div>` +
          `<div class="ev-r">${M.esc(e.location || "")}</div></div>`;
      }
      if (today) {
        const y = ((now.getHours() + now.getMinutes() / 60) - H0) * 100 / (H1 - H0);
        if (y > 0 && y < 100) cell += `<div class="now-line" style="top:${y}%"></div>`;
      }
      h += cell + "</div>";
    }
    $("grid").innerHTML = h;

    const wnotes = notes.weeks[wk] || {};
    let n = `<div class="n-label">week</div><div class="n-week"><textarea data-kind="week" data-key="${wk}" ` +
      `placeholder="Mandatory this week, every day (your OBLIGADO row): e.g. Lee Maestria">${M.esc(M.noteText(wnotes.mandatory))}</textarea></div>`;
    n += '<div class="n-label">to do</div>';
    for (const d of days) {
      const key = M.isoDate(d);
      n += `<div class="n-day"><textarea data-kind="day" data-key="${key}" placeholder="${M.dow3(d)} ${d.getDate()}: pending…">${M.esc(M.noteText(notes.days[key]))}</textarea></div>`;
    }
    $("notes").innerHTML = n;
  }

  // ---------------------------------------------------------------- week: the agenda (phones)
  function renderAgenda(days, wk) {
    const wnotes = notes.weeks[wk] || {};
    let h = `<div class="day week-row"><div class="day-head"><span>Mandatory this week</span><span class="muted small">every day</span></div>` +
      `<textarea data-kind="week" data-key="${wk}" placeholder="Mandatory this week, every day (your OBLIGADO row): e.g. Lee Maestria">${M.esc(M.noteText(wnotes.mandatory))}</textarea></div>`;
    const weekItems = events.filter((e) => e.precision === "week" && overlapsDay(e, days[0]));
    if (weekItems.length) h += `<div class="day-pills week-pills">${weekItems.map(pill).join("")}</div>`;
    for (const d of days) {
      const today = M.sameDay(d, now), weekend = d.getDay() === 0 || d.getDay() === 6, key = M.isoDate(d);
      const timed = events.filter((e) => e.precision === "datetime" && M.sameDay(e.s, d)).sort((a, b) => a.s - b.s);
      const allDay = events.filter((e) => e.precision === "day" && overlapsDay(e, d));
      h += `<section class="day${today ? " today" : ""}${weekend ? " weekend" : ""}">` +
        `<div class="day-head"><span>${M.dow3(d)} ${d.getDate()} ${M.mon3(d)}</span>${today ? '<span class="tag">today</span>' : ""}</div>`;
      if (timed.length) {
        h += `<ul class="day-events">${timed.map((e) =>
          `<li class="day-ev${e.en < now ? " past" : ""}" style="--ev:${courseVar(e.course)}"><span class="t">${M.fmtTime(e.s)}–${M.fmtTime(e.en)}</span>` +
          `<span><b>${M.esc(e.activity)} · ${M.esc(shortName(e.course) || "")}</b><br><span class="muted small">${M.esc(e.location || "room tba")}${teachersOf(e)}</span></span></li>`).join("")}</ul>`;
      }
      if (allDay.length) h += `<div class="day-pills">${allDay.map(pill).join("")}</div>`;
      h += `<textarea data-kind="day" data-key="${key}" placeholder="${M.dow3(d)} ${d.getDate()}: pending…">${M.esc(M.noteText(notes.days[key]))}</textarea></section>`;
    }
    $("agenda").innerHTML = h;
  }

  const dirty = new Map();
  let saveTimer;
  function queueSave(t) {
    dirty.set(t.dataset.kind + ":" + t.dataset.key, t);
    $("save-state").textContent = "Editing…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 800);
  }
  async function flush() {
    if (!dirty.size) return;
    const payload = { days: {}, weeks: {} };
    for (const [, t] of dirty) {
      if (t.dataset.kind === "day") payload.days[t.dataset.key] = t.value;
      else payload.weeks[t.dataset.key] = { mandatory: t.value };
    }
    dirty.clear();
    const where = await M.store.saveNotes(payload);
    notes = M.store.cache.notes || notes;
    $("save-state").textContent = M.store.savedLabel(where, new Date());
    if (where === "github") renderSync();
  }
  window.addEventListener("beforeunload", () => { if (dirty.size) flush(); });
  $("week-prev").addEventListener("click", () => { monday.setDate(monday.getDate() - 7); renderWeek(); });
  $("week-next").addEventListener("click", () => { monday.setDate(monday.getDate() + 7); renderWeek(); });
  $("week-today").addEventListener("click", () => { monday = mondayOfDate(new Date()); renderWeek(); });
  mobile.addEventListener("change", () => { if (dirty.size) flush(); renderWeek(); });

  // ---------------------------------------------------------------- timeline
  function weeksList() {
    const [y0, w0] = hub.hub.weeks.start, [y1, w1] = hub.hub.weeks.end;
    const list = [];
    let d = M.mondayOf(y0, w0);
    const end = M.mondayOf(y1, w1);
    while (d <= end) {
      const iw = M.isoWeek(d);
      list.push({ year: iw.year, week: iw.week, monday: new Date(d) });
      d = new Date(d); d.setDate(d.getDate() + 7);
    }
    return list;
  }
  function renderTimeline() {
    const weeks = weeksList(), n = weeks.length;
    const idx = (date) => { const { year, week } = M.isoWeek(date); return weeks.findIndex((w) => w.year === year && w.week === week); };
    const todayIdx = idx(now);
    const cells = (extra) => weeks.map((w, i) =>
      `<div class="tl-cell${i === todayIdx ? " today" : ""}${extra && BREAK_WEEKS.has(w.week) ? " break" : ""}" data-week="${w.year}-W${M.pad(w.week)}" style="grid-column:${i + 1}"></div>`).join("");

    let h = `<div class="tl-label">week</div><div class="tl-row tl-head" style="--n:${n}">`;
    let lastMon = "";
    weeks.forEach((w, i) => {
      const mon = M.mon3(w.monday), show = mon !== lastMon; lastMon = mon;
      h += `<div class="tl-cell${i === todayIdx ? " today" : ""}" data-week="${w.year}-W${M.pad(w.week)}"><span class="mon">${show ? mon : ""}</span>${w.week}</div>`;
    });
    h += "</div>";

    for (const c of allCourses) {
      const code = c.code, cc = courseByCode[code];
      h += `<div class="tl-label" style="--row:${courseVar(code)}"><span class="dot"></span>${M.esc(c.short)}</div><div class="tl-row" style="--n:${n};--row:${courseVar(code)}">${cells(true)}`;
      weeks.forEach((w, i) => {
        const cnt = events.filter((e) => e.course === code && CLASS_KINDS.has(e.kind) && e.precision === "datetime" && idx(e.s) === i).length;
        if (cnt) h += `<div class="tl-classes" style="grid-column:${i + 1}" title="${cnt} session(s)">${"<i></i>".repeat(Math.min(cnt, 8))}</div>`;
      });
      for (const a of ((cc || {}).assignments || [])) {
        const r = events.find((e) => e.course === code && e.kind === "release" && e.assignment === a.n);
        const d = events.find((e) => e.course === code && e.kind === "deadline" && e.assignment === a.n);
        if (!r || !d) continue;
        const i0 = idx(r.s), i1 = idx(d.s);
        if (i0 < 0 || i1 < 0) continue;
        h += `<div class="tl-band${d.verified ? "" : " soft"}" style="grid-column:${i0 + 1} / ${i1 + 2}" title="A${a.n}: ${M.esc(a.title)} · ${M.fmtWhen(d.start, d.precision)}"></div>`;
      }
      for (const e of events.filter((e) => e.course === code && e.kind === "quiz_checkpoint")) {
        const i = idx(e.s);
        if (i >= 0) h += `<div class="tl-mark" style="grid-column:${i + 1}" title="${M.esc(e.title)}"></div>`;
      }
      for (const e of events.filter((e) => e.course === code && e.kind === "trip")) {
        const i0 = idx(e.s), i1 = idx(e.en);
        if (i0 >= 0) h += `<div class="tl-trip" style="grid-column:${i0 + 1} / ${Math.max(i1, i0) + 2}" title="${M.esc(e.title)}"></div>`;
      }
      h += "</div>";
    }
    h += `<div class="tl-label" style="--row:var(--k-holiday)"><span class="dot"></span>holidays</div><div class="tl-row" style="--n:${n};--row:var(--k-holiday)">${cells(false)}`;
    for (const e of events.filter((e) => e.kind === "holiday")) {
      const i = idx(e.s);
      if (i >= 0) h += `<div class="tl-holiday" style="grid-column:${i + 1}" title="${M.esc(e.title)}">✕</div>`;
    }
    h += "</div>";
    $("timeline").innerHTML = h;
    $("timeline").querySelectorAll(".tl-cell[data-week]").forEach((c) => c.addEventListener("click", () => {
      const [y, w] = c.dataset.week.split("-W").map(Number);
      monday = M.mondayOf(y, w);
      renderWeek();
      $("week").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    $("legend").innerHTML =
      '<span><i style="background:var(--c-M7001K)"></i> one square per session</span>' +
      '<span><i style="background:color-mix(in oklab, var(--c-M7001K) 40%, var(--bg-2));border:1px solid var(--c-M7001K)"></i> assignment: release → seminar (dot = deadline)</span>' +
      '<span><i style="background:var(--k-quiz);transform:rotate(45deg)"></i> quiz checkpoint week</span>' +
      '<span><i style="border:1px dashed var(--ink-3)"></i> study trip</span><span>✕ public holiday</span>' +
      '<span><i style="background:repeating-linear-gradient(135deg, transparent 0 3px, var(--ink-3) 3px 4px)"></i> break weeks</span>';
  }

  // ---------------------------------------------------------------- course cards
  function renderCourses() {
    $("course-cards").innerHTML = allCourses.map((c) => {
      const cc = courseByCode[c.code];
      const next = nextOf((e) => e.course === c.code && CLASS_KINDS.has(e.kind) && e.precision === "datetime");
      const nd = nextOf((e) => e.course === c.code && e.kind === "deadline");
      let mods = "";
      if (cc) {
        mods = `<div class="mods">${cc.modules.map((m) => {
          const st = M.states(((progress.checkpoints || {})[c.code] || {})[String(m.n)]);
          const total = m.checkpoint.length;
          const pct = total ? Math.round(100 * st.filter(Boolean).length / total) : 0;
          return `<i title="Module ${m.n}: ${M.esc(m.title)} · ${total ? pct + "% of checkpoints" : "no checkpoint"}"><b style="width:${pct}%"></b></i>`;
        }).join("")}</div>`;
      }
      const last = cc ? M.lastNode(c.code) : null;
      const resume = last && last.kind !== "course"
        ? `<div class="meta small">Last opened: <a href="${P + last.url}">${M.esc(last.title)}</a></div>` : "";
      const actions = cc
        ? `<div class="actions">` +
          (M.static || !cc.folder ? "" : `<button class="btn btn-small open" data-path="${M.esc(cc.folder)}" type="button">Open folder</button>`) +
          (M.static || !cc.king_file ? "" : `<button class="btn btn-small open" data-path="${M.esc(cc.king_file)}" type="button">King (PDF)</button>`) +
          `<a class="btn btn-small btn-ghost" href="${P + c.code}/index.html">Course page</a>` +
          (last && last.kind !== "course" ? `<a class="btn btn-small btn-primary" href="${P + last.url}">Continue</a>` : "") +
          (c.canvas_url ? `<a class="btn btn-small btn-ghost" href="${c.canvas_url}" target="_blank" rel="noopener">Canvas</a>` : "") + "</div>"
        : '<p class="muted small">Not set up yet. Comes after Simulation is running.</p>';
      return `<article class="card course-card${cc ? "" : " inactive"}" style="--accent:${courseVar(c.code)}">` +
        `<div class="card-eyebrow">${M.esc(c.code)} · ${M.esc(c.teacher || "")}</div>` +
        `<h3>${cc ? `<a href="${P + c.code}/index.html">${M.esc(c.name)}</a>` : M.esc(c.name)}</h3>${mods}` +
        `<div class="meta small">${next ? `Next: ${M.esc(next.activity)} · ${M.fmtDay(next.s)} ${M.fmtTime(next.s)} · ${M.esc(next.location || "")}` : "No upcoming session in TimeEdit."}</div>` +
        `<div class="meta small">${nd ? `Deadline: ${M.esc(nd.title)} · ${M.fmtWhen(nd.start, nd.precision)}` : (cc ? "No deadline derived yet." : "")}</div>${resume}${actions}</article>`;
    }).join("");
  }

  // ---------------------------------------------------------------- sync line (notes and progress between PC and phone)
  const localTime = (iso) => (iso ? M.fmtTime(new Date(iso)) : "");
  async function renderSync() {
    const el = $("sync");
    if (!el) return;
    if (M.static) {
      const cfg = M.sync.config;
      if (!cfg || !cfg.repo) { el.innerHTML = ""; return; }
      if (M.sync.ready()) {
        const st = M.sync.state, last = st.last.notes || st.last.progress;
        el.innerHTML = (st.error ? `<span class="bad">Sync error: ${M.esc(st.error)}</span>`
          : `<span>Synced with the PC through GitHub (<code>${M.esc(cfg.repo)}</code>)${last ? " · " + localTime(last) : ""}</span>`) +
          `<button class="btn btn-small btn-ghost" id="sync-off" type="button">Disconnect</button>`;
        $("sync-off").addEventListener("click", () => { M.sync.setToken(null); renderSync(); });
      } else {
        el.innerHTML = `<form id="sync-form" class="sync-form"><span>Sync notes and progress with the PC: paste the GitHub token for <code>${M.esc(cfg.repo)}</code></span>` +
          `<input type="password" id="sync-token" placeholder="paste the token here" autocomplete="off" spellcheck="false" aria-label="GitHub token">` +
          `<button class="btn btn-small btn-primary" type="submit">Connect</button></form>`;
        $("sync-form").addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const v = $("sync-token").value.trim();
          if (!v) return;
          M.sync.setToken(v);
          notes = await M.store.notes(); progress = await M.store.progress();
          if (M.sync.state.error) { M.sync.setToken(null); M.toast("GitHub refused that token: " + M.esc(M.sync.state.error), 8000); }
          else M.toast("Connected. Notes and progress now travel through GitHub.", 5000);
          renderWeek(); renderCourses(); renderSync();
        });
      }
      return;
    }
    try {
      const s = await M.api("/api/sync");
      if (!s.enabled) {
        el.innerHTML = `<span class="muted">Notes stay on this PC. To sync with the phone, put a GitHub token for <code>${M.esc(s.repo || "the private repo")}</code> in <code>${M.esc(s.token_file)}</code> and restart the server.</span>`;
      } else {
        const last = s.last_pull.notes || s.last_push.notes;
        el.innerHTML = s.error ? `<span class="bad">Sync error: ${M.esc(s.error)}</span>`
          : `<span class="muted">Synced with the phone through GitHub (<code>${M.esc(s.repo)}</code>)${last ? " · " + localTime(last) : ""}</span>`;
      }
    } catch (e) { el.innerHTML = ""; }
  }
  M.sync.onchange = () => renderSync();

  renderBanner(); renderStrip(); renderWeek(); renderTimeline(); renderCourses(); renderSync();
  setInterval(renderStrip, 30000);
})();
