/* Progress: the steps of every assignment and example exercise (tracker.json, built into the page) plus the steps
   the student ticks, stored like checkpoints (the PC server, or this browser and the GitHub sync on the phone).
   M.tracker.count in app.js does the arithmetic here, on the course page and on the dashboard alike. */
(function () {
  const M = window.malla;
  const dataEl = document.getElementById("tracker-data");
  if (!M || !M.tracker || !dataEl) return;
  const data = JSON.parse(dataEl.textContent);
  const code = data.course;
  const pctOf = (c) => (c.total ? Math.round((100 * c.done) / c.total) : 0);

  function paint(root, c) {
    const p = pctOf(c);
    root.querySelectorAll("[data-pct]").forEach((n) => { n.textContent = p + " %"; });
    root.querySelectorAll("[data-bar]").forEach((n) => { n.style.width = p + "%"; });
    root.querySelectorAll("[data-split]").forEach((n) => {
      n.textContent = `Malla has done ${c.malla.done} of its ${c.malla.total} steps, and you have done ${c.you.done} of your ${c.you.total}.`;
    });
  }

  function render(progress) {
    const ticks = ((progress && progress.tracker) || {})[code] || {};
    document.querySelectorAll("input[data-step]").forEach((box) => {
      const tick = (ticks[box.dataset.item] || {})[box.dataset.step];
      const item = data.items.find((i) => i.id === box.dataset.item) || { steps: {} };
      const at = (item.steps[box.dataset.step] || {}).at;          // a Canvas reading on the PC copy
      if (M.tracker.tickWins(tick, at)) box.checked = !!tick.done;
      const li = box.closest(".pg-step");
      if (li) li.classList.toggle("done", box.checked);
    });
    document.querySelectorAll("[data-summary]").forEach((el) => paint(el, M.tracker.count(data, ticks, el.dataset.summary)));
    for (const item of data.items) {
      document.querySelectorAll(`[data-item-row="${item.id}"]`).forEach((el) => paint(el, M.tracker.count(data, ticks, null, item.id)));
    }
  }

  document.addEventListener("change", async (ev) => {
    const box = ev.target.closest("input[data-step]");
    if (!box) return;
    const item = box.dataset.item, step = box.dataset.step, value = box.checked;
    const where = await M.store.update({ op: "set_step", course: code, item, step, value });
    const p = M.store.cache.progress || {};
    p.tracker = p.tracker || {};
    p.tracker[code] = p.tracker[code] || {};
    p.tracker[code][item] = p.tracker[code][item] || {};
    p.tracker[code][item][step] = { done: value, at: new Date().toISOString() };
    M.store.cache.progress = p;
    render(p);
    const saved = document.getElementById("pg-saved");
    if (saved) saved.textContent = M.store.savedLabel(where, new Date());
  });

  M.store.progress().then(render).catch(() => render(null));
})();
