/* Assignment trainer: a fixed sequence of decision stations grouped in modules. Each station names
   the MODSIM window, tab and field, asks for the choice or the value, and answers with the value the
   group used and why ("The correct value for this exercise is…"). Progress lives in this browser
   (localStorage through M.ls); a trainer marked local stays on the PC copy, because its values
   are the group's. Everything interpolated into markup passes through M.esc. */
(function () {
  const M = window.malla;
  const app = document.getElementById("trainer-app");
  if (!app || !M) return;
  const data = JSON.parse(document.getElementById("trainer-data").textContent);
  const KEY = "malla.trainer." + data.id;
  const $ = (id) => document.getElementById(id);
  const esc = M.esc;
  const KIND_LABEL = { single: "Choose one", numeric: "Type the value", fill: "Type the answer" };
  const WHERE_LABEL = [["window", "Window"], ["tab", "Tab or section"], ["field", "Field or line"]];
  const SCREENS = ["tr-home", "tr-station", "tr-module-done", "tr-final"];
  const reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const modules = data.modules || [];
  const total = modules.reduce((n, m) => n + m.stations.length, 0);

  let progress = M.ls.get(KEY, null);
  if (!progress || typeof progress !== "object") progress = {};
  progress.stations = progress.stations || {};
  progress.modules = progress.modules || {};
  const cur = { mod: null, queue: [], idx: 0, review: false, answered: false, order: [] };

  const rec = (id) => progress.stations[id];
  const save = () => M.ls.set(KEY, progress);
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const fmt = (x) => String(+Number(x).toPrecision(6));

  function shuffle(a) {
    for (let j = a.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [a[j], a[k]] = [a[k], a[j]]; }
    return a;
  }
  function stats(m) {
    const done = m.stations.filter((s) => rec(s.id));
    const right = done.filter((s) => rec(s.id).ok).length;
    const fixed = done.filter((s) => !rec(s.id).ok && rec(s.id).fixed).length;
    const missed = done.filter((s) => !rec(s.id).ok && !rec(s.id).fixed);
    return { total: m.stations.length, done: done.length, right, fixed, missed, complete: done.length === m.stations.length };
  }
  const allComplete = () => modules.length > 0 && modules.every((m) => stats(m).complete);

  function show(id, scroll = true) {
    SCREENS.forEach((s) => { $(s).hidden = s !== id; });
    if (!scroll) return;
    const top = Math.max(0, app.getBoundingClientRect().top + window.scrollY - 72);   // the app's top, under the sticky bar
    if (Math.abs(window.scrollY - top) > 8) window.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });
  }

  // ---- numbers as people type them: 0,13 · 150 000 · 150,000 · 130 mm -----------------
  function parseNumber(text) {
    const token = (String(text || "").replace(/\s+/g, "").match(/^[-+]?[\d.,]+/) || [""])[0];
    if (!token) return NaN;
    const thousands = /^[-+]?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(token);
    return parseFloat(thousands ? token.replace(/,/g, "") : token.replace(",", "."));
  }
  function slipHint(v, s) {
    if (!s.answer || !v) return "";
    const r = Math.abs(v / s.answer);
    const unit = s.unit ? ` The field wants ${s.unit}.` : "";
    for (const f of [10, 100, 1000, 1000000]) {
      if (Math.abs(r / f - 1) < 0.06) return `The right digits, ${f} times too large: a unit or decimal slip.${unit}`;
      if (Math.abs(r * f - 1) < 0.06) return `The right digits, ${f} times too small: a unit or decimal slip.${unit}`;
    }
    return "";
  }

  // ---- home: the module map with progress ---------------------------------
  function renderHome(scroll = true) {
    const done = modules.reduce((n, m) => n + stats(m).done, 0);
    $("tr-overall-bar").style.width = `${pct(done, total)}%`;
    $("tr-overall-text").textContent = `${done} / ${total} stations`;
    const nextMod = modules.find((m) => !stats(m).complete);
    $("tr-continue").textContent = done === 0 ? `Start with module 1: ${modules.length ? modules[0].title : ""}`
      : nextMod ? `Continue: ${nextMod.title}` : "See how we got to the optimum";
    const cards = modules.map((m, k) => {
      const s = stats(m);
      const state = s.complete ? "complete" : s.done ? "started" : "fresh";
      const label = s.complete ? (s.missed.length ? `Review the ${s.missed.length} missed` : "Play again") : s.done ? "Continue" : "Start";
      const line = s.complete
        ? `${s.right} of ${s.total} right first time${s.fixed ? ` · ${s.fixed} fixed on review` : ""}`
        : `${s.done} / ${s.total} stations`;
      return `<div class="card tr-mod ${state}">
        <div class="tr-n">Module ${k + 1}${s.complete ? " · complete" : ""}</div>
        <h3>${esc(m.title)}</h3>
        <p class="muted small">${esc(m.blurb || "")}</p>
        <div class="tr-bar"><i style="width:${pct(s.done, s.total)}%"></i></div>
        <div class="stat">${line}</div>
        <div class="actions"><button class="btn btn-small${s.complete ? "" : " btn-primary"}" type="button" data-start="${k}">${label}</button>${
          s.done ? `<button class="btn btn-small btn-ghost" type="button" data-reset="${k}">Reset</button>` : ""}</div>
      </div>`;
    });
    const unlocked = allComplete();
    const tlTitle = data.timeline_title || "How we got to the optimum";
    const tlBlurb = data.timeline_blurb || ("The " + (data.timeline || []).length + " runs in order, one line each: what changed, what it showed, what it taught.");
    cards.push(`<div class="card tr-mod ${unlocked ? "complete" : "locked"}">
        <div class="tr-n">The end</div>
        <h3>${esc(tlTitle)}</h3>
        <p class="muted small">${esc(tlBlurb)}</p>
        <div class="actions">${unlocked
          ? '<button class="btn btn-small btn-primary" type="button" id="tr-open-final">Open</button>'
          : `<span class="muted small">Opens when the ${modules.length} modules are complete</span>`}</div>
      </div>`);
    const grid = $("tr-modules");
    grid.innerHTML = cards.join("");
    grid.querySelectorAll("[data-start]").forEach((b) => b.addEventListener("click", () => {
      const m = modules[+b.dataset.start], s = stats(m);
      if (s.complete && s.missed.length) startModule(m, true);
      else { if (s.complete) resetModule(m); startModule(m, false); }
    }));
    grid.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", () => {
      resetModule(modules[+b.dataset.reset]); renderHome(false);
    }));
    const openFinal = $("tr-open-final");
    if (openFinal) openFinal.addEventListener("click", renderFinal);
    show("tr-home", scroll);
  }
  function resetModule(m) {
    m.stations.forEach((s) => { delete progress.stations[s.id]; });
    delete progress.modules[m.id];
    save();
  }

  // ---- a module: its stations one by one ----------------------------------
  function startModule(m, onlyMissed) {
    cur.mod = m; cur.review = onlyMissed; cur.idx = 0;
    cur.queue = m.stations.filter((s) => (onlyMissed ? rec(s.id) && !rec(s.id).ok && !rec(s.id).fixed : !rec(s.id)));
    if (!cur.queue.length) { renderModuleDone(m); return; }
    renderStation();
  }
  function renderStation() {
    const s = cur.queue[cur.idx], m = cur.mod;
    const k = modules.indexOf(m), pos = m.stations.indexOf(s) + 1;
    $("tr-crumb").textContent = `Module ${k + 1} · ${m.title} · station ${pos} of ${m.stations.length}${cur.review ? " · review" : ""}`;
    const w = s.where || {};
    $("tr-where").innerHTML = WHERE_LABEL.filter(([key]) => w[key])
      .map(([key, label]) => `<dt>${label}</dt><dd>${esc(w[key])}</dd>`).join("");
    $("tr-kind").textContent = KIND_LABEL[s.kind] || s.kind;
    $("tr-prompt").textContent = s.prompt;
    const o = $("tr-options");
    if (s.kind === "single") {
      cur.order = shuffle(s.options.map((_, j) => j));             // the right option is not always first
      o.innerHTML = cur.order.map((j, d) =>
        `<label><input type="radio" name="tr-opt" value="${d}"><span>${esc(s.options[j])}</span></label>`).join("");
    } else {
      const unit = s.kind === "numeric" && s.unit ? ` (${esc(s.unit)})` : "";
      o.innerHTML = `<label class="field">${s.kind === "numeric" ? "Your value" : "Your answer"}${unit} ` +
        `<input type="text" id="tr-input" inputmode="${s.kind === "numeric" ? "decimal" : "text"}" autocomplete="off" spellcheck="false"></label>`;
    }
    const fb = $("tr-feedback");
    fb.hidden = true; fb.innerHTML = "";
    $("tr-check").textContent = "Check";
    cur.answered = false;
    show("tr-station");                                  // visible first: a hidden input cannot take the focus
    const first = o.querySelector("input");
    if (first) first.focus({ preventScroll: true });
  }
  function grade(s) {
    const o = $("tr-options");
    if (s.kind === "single") {
      const sel = o.querySelector("input:checked");
      if (!sel) { M.toast("Pick an answer first"); return null; }
      const given = cur.order[+sel.value];
      o.querySelectorAll("label").forEach((lab, d) => {
        if (cur.order[d] === s.correct) lab.classList.add("correct");
        else if (cur.order[d] === given) lab.classList.add("wrong");
      });
      return { ok: given === s.correct, given: "", hint: "" };
    }
    const typed = ($("tr-input").value || "").trim();
    if (!typed) { M.toast(s.kind === "numeric" ? "Type a number" : "Type an answer"); return null; }
    if (s.kind === "numeric") {
      const v = parseNumber(typed);
      if (Number.isNaN(v)) { M.toast("Type a number"); return null; }
      const tol = s.tolerance != null ? s.tolerance : Math.abs(s.answer) * 0.05;
      const ok = Math.abs(v - s.answer) <= tol + 1e-12;
      return { ok, given: `${fmt(v)}${s.unit ? " " + s.unit : ""}`, hint: ok ? "" : slipHint(v, s) };
    }
    const v = typed.toLowerCase().replace(/\s+/g, " ");
    return { ok: (s.accept || []).some((a) => a.toLowerCase() === v), given: typed, hint: "" };
  }
  function check() {
    const s = cur.queue[cur.idx];
    const g = grade(s);
    if (!g) return;
    const now = new Date().toISOString();
    const r = rec(s.id);
    if (!r) progress.stations[s.id] = { ok: g.ok, tries: 1, at: now };
    else { r.tries = (r.tries || 1) + 1; r.at = now; if (g.ok && !r.ok) r.fixed = true; }
    save();
    $("tr-options").querySelectorAll("input").forEach((x) => { x.disabled = true; });
    const fb = $("tr-feedback");
    fb.className = "feedback" + (g.ok ? "" : " bad");
    fb.innerHTML = `<div class="verdict">${g.ok ? "Right." : "Not this one."}</div>` +
      (!g.ok && g.given ? `<div class="given">You typed ${esc(g.given)}</div>` : "") +
      (g.hint ? `<div class="hint">${esc(g.hint)}</div>` : "") +
      `<div>${esc(g.ok ? s.ok : s.wrong)}</div>` +
      (s.remember ? `<div class="remember">${esc(s.remember)}</div>` : "") +
      (s.source ? `<div class="src">${esc(s.source)}</div>` : "");
    fb.hidden = false;
    const btn = $("tr-check");
    btn.textContent = cur.idx + 1 < cur.queue.length ? "Next station" : "Finish the module";
    cur.answered = true;
    btn.focus({ preventScroll: true });
    fb.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  }
  function next() {
    cur.idx++;
    if (cur.idx >= cur.queue.length) { renderModuleDone(cur.mod); return; }
    renderStation();
  }

  // ---- module complete ----------------------------------------------------
  function renderModuleDone(m) {
    const s = stats(m), k = modules.indexOf(m);
    if (s.complete && !progress.modules[m.id]) { progress.modules[m.id] = new Date().toISOString(); save(); }
    const nextMod = modules.slice(k + 1).find((x) => !stats(x).complete) || modules.find((x) => !stats(x).complete);
    const missed = s.missed.map((st) =>
      `<li><strong>${esc(st.prompt)}</strong><div class="muted small">${esc(st.wrong)}</div></li>`).join("");
    const card = $("tr-done-card");
    card.innerHTML = `<div class="card-eyebrow">Module ${k + 1} of ${modules.length}</div>
      <div class="tr-done-head"><span class="tr-done-mark" aria-hidden="true">✓</span><h2>Complete: ${esc(m.title)}</h2></div>
      <div class="tr-done-score">${s.right} of ${s.total} right first time${s.fixed ? ` · ${s.fixed} fixed on review` : ""}</div>
      ${missed ? `<p>Still to review before the seminar:</p><ol class="tr-missed">${missed}</ol>`
               : "<p>Nothing left to review in this module.</p>"}
      <div class="actions">
        ${s.missed.length ? '<button class="btn btn-primary" type="button" data-act="retry">Retry the missed ones</button>' : ""}
        ${nextMod ? `<button class="btn${s.missed.length ? "" : " btn-primary"}" type="button" data-act="next">Next: ${esc(nextMod.title)}</button>` : ""}
        ${!nextMod && allComplete() ? `<button class="btn${s.missed.length ? "" : " btn-primary"}" type="button" data-act="final">${esc(data.timeline_title || "How we got to the optimum")}</button>` : ""}
        <button class="btn btn-ghost" type="button" data-act="map">Back to the map</button>
      </div>`;
    const acts = { retry: () => startModule(m, true), next: () => startModule(nextMod, false), final: renderFinal, map: () => renderHome() };
    card.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", acts[b.dataset.act]));
    show("tr-module-done");
  }

  // ---- the end: the run timeline ------------------------------------------
  function renderFinal() {
    const right = modules.reduce((n, m) => n + stats(m).right, 0);
    const tl = (data.timeline || []).map((t) =>
      `<li class="${t.final ? "final" : ""}"><span class="run-n">${esc(t.run)}</span>
        <div><span class="tr-when">${esc(t.when || "")}</span> <strong>${esc(t.change)}</strong></div>
        <div class="read">${esc(t.read || "")}</div>
        <div class="lesson">${esc(t.lesson || "")}</div></li>`).join("");
    const card = $("tr-final-card");
    card.innerHTML = `<div class="card-eyebrow">All ${modules.length} modules complete</div>
      <div class="tr-done-head"><span class="tr-done-mark" aria-hidden="true">✓</span><h2>You finished the ${esc(data.title)}</h2></div>
      <p>${right} of ${total} stations right the first time. ${esc(data.outro || "")}</p>
      <h3>${esc(data.timeline_heading || "How we got to the optimum, run by run")}</h3>
      <ol class="tr-timeline">${tl}</ol>
      <div class="actions"><button class="btn btn-ghost" type="button" data-act="map">Back to the map</button>
        <button class="btn btn-ghost" type="button" data-act="reset">Reset all progress</button></div>`;
    card.querySelector('[data-act="map"]').addEventListener("click", () => renderHome());
    card.querySelector('[data-act="reset"]').addEventListener("click", () => {
      if (!confirm("Forget every answer and start again?")) return;
      progress = { stations: {}, modules: {} }; save(); renderHome();
    });
    show("tr-final");
  }

  $("tr-check").addEventListener("click", () => (cur.answered ? next() : check()));
  $("tr-options").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!cur.answered) check();
  });
  $("tr-quit").addEventListener("click", () => renderHome());
  $("tr-continue").addEventListener("click", () => {
    const m = modules.find((x) => !stats(x).complete);
    if (m) startModule(m, false); else renderFinal();
  });
  renderHome(false);
})();
