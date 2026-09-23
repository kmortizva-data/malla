/* The queue (CLAUDE.md block 60): every open item of the three courses, regrouped live against today's date and the
   steps the student ticks (stored like checkpoints: the PC server, or this browser and the GitHub sync on the phone).
   The cards arrive pre-rendered in their build-time groups; this script moves them, rewrites their date and next
   step, and keeps the filters. M.queue.view in app.js does the arithmetic, the same as malla_queue.py. */
(function () {
  const M = window.malla;
  const dataEl = document.getElementById("queue-data");
  if (!M || !M.queue || !dataEl) return;
  const items = JSON.parse(dataEl.textContent);
  const FILTER_KEY = "malla.queue.filter";
  const ORDER = ["overdue", "week", "later", "nodate", "waiting", "practice", "done"];
  let filter = { course: "all", kind: "all", owner: "any", ...(M.ls.get(FILTER_KEY, {}) || {}) };
  let ticks = {};

  const matches = (item, view) =>
    (filter.course === "all" || item.course === filter.course) &&
    (filter.kind === "all" || item.kind === filter.kind) &&
    (filter.owner === "any" || (view[filter.owner] && view[filter.owner].state !== "blocked"));

  function nextHtml(view) {
    const lines = [];
    for (const [owner, who] of [["you", "You"], ["malla", "Malla"]]) {
      const s = view[owner];
      if (!s) continue;
      const extra = s.state === "blocked" ? " (blocked)" : s.state === "active" ? " (in progress)" : "";
      lines.push(`<span class="q-who q-${owner}">${who}</span> ${M.esc(s.label)}${extra}`);
    }
    return lines.join("<br>") || "Nothing left.";
  }

  function paint(card, item, view, now) {
    const due = card.querySelector("[data-due]");
    if (due) due.textContent = M.queue.dueText(item, now);
    const next = card.querySelector("[data-next]");
    if (next) next.innerHTML = view.closed ? "Done." : nextHtml(view);
    const pct = view.total ? Math.round((100 * view.done) / view.total) : 0;
    const bar = card.querySelector("[data-bar]");
    if (bar) bar.style.width = pct + "%";
    const count = card.querySelector("[data-count]");
    if (count) count.textContent = `${view.done} of ${view.total} steps`;
    card.classList.toggle("is-overdue", view.group === "overdue");
    for (const s of view.steps) {
      const box = card.querySelector(`input[data-step="${s.id}"]`);
      if (!box) continue;
      box.checked = s.done;
      const li = box.closest(".pg-step");
      if (li) li.classList.toggle("done", s.done);
    }
  }

  function render() {
    const now = new Date();
    const lists = {}, shown = {};
    document.querySelectorAll(".q-group").forEach((g) => {
      lists[g.dataset.group] = g.querySelector(".q-list");
      shown[g.dataset.group] = [];
    });
    const tiles = { overdue: 0, week: 0, you: 0, waiting: 0 };
    for (const item of items) {
      const card = document.getElementById("q-" + item.key);
      if (!card) continue;
      const view = M.queue.view(item, ticks, now);
      paint(card, item, view, now);
      if (view.group === "overdue") tiles.overdue++;
      if (view.group === "week") tiles.week++;
      if (view.group === "waiting") tiles.waiting++;
      if (!view.closed && !item.optional && view.you && view.you.state !== "blocked") tiles.you++;
      const visible = matches(item, view);
      card.hidden = !visible;
      if (visible) shown[view.group].push({ card, item, view });
      else lists[view.group].appendChild(card);            // keep hidden cards in their group for later
    }
    const byDate = (a, b) => (a.view.end || 0) - (b.view.end || 0) || a.item.order - b.item.order;
    let total = 0;
    for (const g of ORDER) {
      const entries = shown[g] || [];
      if (["overdue", "week", "later"].includes(g)) entries.sort(byDate);
      for (const e of entries) lists[g].appendChild(e.card);
      const section = document.querySelector(`.q-group[data-group="${g}"]`);
      section.hidden = entries.length === 0;
      const n = section.querySelector("[data-group-count]");
      if (n) n.textContent = entries.length;
      total += entries.length;
    }
    const empty = document.getElementById("q-empty");
    if (empty) empty.hidden = total > 0;
    for (const [k, n] of Object.entries(tiles)) {
      const el = document.querySelector(`[data-tile="${k}"] [data-tile-count]`);
      if (el) el.textContent = n;
    }
    document.querySelectorAll(".q-chip").forEach((chip) => {
      chip.setAttribute("aria-pressed", String(filter[chip.dataset.filter] === chip.dataset.value));
    });
  }

  document.addEventListener("click", (ev) => {
    const chip = ev.target.closest(".q-chip");
    if (!chip) return;
    filter[chip.dataset.filter] = chip.dataset.value;
    M.ls.set(FILTER_KEY, filter);
    render();
  });

  document.addEventListener("change", async (ev) => {
    const box = ev.target.closest("input[data-step]");
    if (!box) return;
    const course = box.dataset.course, item = box.dataset.item, step = box.dataset.step, value = box.checked;
    const where = await M.store.update({ op: "set_step", course, item, step, value });
    const p = M.store.cache.progress || {};
    p.tracker = p.tracker || {};
    p.tracker[course] = p.tracker[course] || {};
    p.tracker[course][item] = p.tracker[course][item] || {};
    p.tracker[course][item][step] = { done: value, at: new Date().toISOString() };
    M.store.cache.progress = p;
    ticks = p.tracker;
    render();
    const saved = document.getElementById("q-saved");
    if (saved) saved.textContent = M.store.savedLabel(where, new Date());
  });

  render();
  M.store.progress().then((p) => { ticks = (p && p.tracker) || {}; render(); }).catch(() => render());
})();
