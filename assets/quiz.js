/* Practice quiz: the shape of the Canvas quiz (10 random from a bank, 20 minutes, two attempts
   kept as history) with the explanation after every answer. Attempts and flags go through
   M.store: data/progress.json via the local server on the PC, localStorage on the phone copy. */
(function () {
  const M = window.malla;
  const app = document.getElementById("quiz-app");
  if (!app) return;
  const bank = JSON.parse(document.getElementById("bank").textContent);
  const course = app.dataset.course, module = +app.dataset.module;
  const DRAW = bank.draw || 10, MINUTES = bank.minutes || 20;
  const $ = (id) => document.getElementById(id);
  const TYPE_LABEL = { single: "Choose one", multiple: "Choose all that apply", true_false: "True or false",
    numeric: "Enter a number", fill: "Type the term" };

  let order = [], i = 0, answers = [], timerId = null, deadline = 0, started = 0, expected = null, awaitingNext = false;

  function shuffle(a) {
    for (let j = a.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [a[j], a[k]] = [a[k], a[j]]; }
    return a;
  }
  function show(id) { ["quiz-intro", "quiz-question", "quiz-result"].forEach((s) => { $(s).hidden = s !== id; }); }

  M.store.progress().then((p) => {
    const mine = (p.quiz_attempts || []).filter((a) => a.course === course && a.module === module).slice(-8).reverse();
    if (!mine.length) return;
    $("attempts-card").hidden = false;
    $("attempts-list").innerHTML = mine.map((a) =>
      `<li><strong>${a.score}/${a.total}</strong> · expected ${a.expected ?? "–"} · ${M.esc(a.finished.slice(0, 16).replace("T", " "))} · ${Math.round(a.seconds / 60)} min</li>`).join("");
  }).catch(() => {});

  function prepare(q) {
    const p = { ...q };
    if (Array.isArray(q.options)) {
      const idx = shuffle(q.options.map((_, k) => k));
      p.options = idx.map((k) => q.options[k]);
      p.correct = (q.correct || []).map((c) => idx.indexOf(c));
    }
    return p;
  }
  function start() {
    expected = $("expected").value === "" ? null : +$("expected").value;
    order = shuffle([...bank.questions]).slice(0, DRAW).map(prepare);
    i = 0; answers = []; awaitingNext = false;
    started = Date.now(); deadline = started + MINUTES * 60000;
    clearInterval(timerId); timerId = setInterval(tick, 500); tick();
    show("quiz-question"); renderQuestion();
  }
  function tick() {
    const left = Math.max(0, deadline - Date.now());
    const t = $("timer");
    t.textContent = `${M.pad(Math.floor(left / 60000))}:${M.pad(Math.floor((left % 60000) / 1000))}`;
    t.classList.toggle("low", left < 120000);
    if (left <= 0) { clearInterval(timerId); finish(true); }
  }
  function renderQuestion() {
    const q = order[i];
    $("q-progress").textContent = `Question ${i + 1} of ${order.length}`;
    $("q-type").textContent = TYPE_LABEL[q.type] || q.type;
    $("q-stem").textContent = q.question;
    const o = $("q-options");
    $("q-feedback").hidden = true;
    $("answer-btn").textContent = "Answer";
    awaitingNext = false;
    if (q.type === "single" || q.type === "multiple") {
      const t = q.type === "single" ? "radio" : "checkbox";
      o.innerHTML = q.options.map((opt, k) => `<label><input type="${t}" name="opt" value="${k}"><span>${M.esc(opt)}</span></label>`).join("");
    } else if (q.type === "true_false") {
      o.innerHTML = ["True", "False"].map((opt, k) => `<label><input type="radio" name="opt" value="${k}"><span>${opt}</span></label>`).join("");
    } else if (q.type === "numeric") {
      o.innerHTML = `<label class="field">Answer${q.unit ? ` (${M.esc(q.unit)})` : ""} <input type="number" step="any" id="num" inputmode="decimal"></label>`;
    } else {
      o.innerHTML = '<label class="field">Answer <input type="text" id="txt" autocomplete="off"></label>';
    }
    const first = o.querySelector("input");
    if (first) first.focus();
  }
  function markOptions(correct, given) {
    $("q-options").querySelectorAll("label").forEach((lab, k) => {
      if (correct.includes(k)) lab.classList.add("correct");
      else if (given.includes(k)) lab.classList.add("wrong");
    });
  }
  function answer() {
    const q = order[i], o = $("q-options");
    let given, ok, right;
    if (q.type === "single" || q.type === "true_false") {
      const sel = o.querySelector("input:checked");
      if (!sel) { M.toast("Pick an answer first"); return; }
      given = [+sel.value];
      const corr = q.type === "true_false" ? [q.answer === true ? 0 : 1] : q.correct;
      ok = given[0] === corr[0];
      markOptions(corr, given);
      right = q.type === "true_false" ? (q.answer ? "True" : "False") : corr.map((k) => q.options[k]).join("; ");
    } else if (q.type === "multiple") {
      given = [...o.querySelectorAll("input:checked")].map((x) => +x.value);
      if (!given.length) { M.toast("Pick at least one"); return; }
      const corr = [...q.correct].sort((a, b) => a - b);
      ok = JSON.stringify([...given].sort((a, b) => a - b)) === JSON.stringify(corr);
      markOptions(corr, given);
      right = corr.map((k) => q.options[k]).join("; ");
    } else if (q.type === "numeric") {
      const v = parseFloat($("num").value);
      if (Number.isNaN(v)) { M.toast("Enter a number"); return; }
      given = v;
      const tol = q.tolerance != null ? q.tolerance
        : (q.tolerance_pct != null ? Math.abs(q.answer) * q.tolerance_pct / 100 : Math.abs(q.answer) * 0.02);
      ok = Math.abs(v - q.answer) <= tol;
      right = `${q.answer}${q.unit ? " " + q.unit : ""}`;
    } else {
      const v = ($("txt").value || "").trim().toLowerCase();
      if (!v) { M.toast("Type an answer"); return; }
      given = v;
      ok = (q.accept || []).some((a) => a.toLowerCase() === v);
      right = (q.accept || []).join(" / ");
    }
    answers.push({ id: q.id, correct: ok, given });
    o.querySelectorAll("input").forEach((x) => { x.disabled = true; });
    const fb = $("q-feedback");
    fb.hidden = false;
    fb.className = "feedback" + (ok ? "" : " bad");
    const src = q.source ? [q.source.ref, q.source.slide].filter(Boolean).map(M.esc).join(" · ") : "";
    fb.innerHTML = `<div class="verdict">${ok ? "Correct." : "Not quite. Answer: " + M.esc(right)}</div>` +
      `<div>${M.esc(q.explanation || "")}</div>` +
      `<div class="src">${src}${q.source && q.source.canvas_page ? ` · <a href="${q.source.canvas_page}" target="_blank" rel="noopener">Canvas page</a>` : ""}` +
      ` · <button class="btn btn-small btn-ghost" type="button" id="flag-btn">Flag this question</button></div>`;
    $("flag-btn").addEventListener("click", async () => {
      const note = prompt("What is wrong or unclear about this question?");
      if (note === null) return;
      const where = await M.store.update({ op: "flag", course, module, question_id: q.id, note, at: new Date().toISOString() });
      M.toast(where === "server" ? "Flagged. The bank gets corrected from your flags."
        : "Flagged on this device. Tell Claude which question when you are back at the PC.");
    });
    $("answer-btn").textContent = i + 1 < order.length ? "Next question" : "See the result";
    awaitingNext = true;
  }
  function next() { i++; if (i >= order.length) finish(false); else renderQuestion(); }
  async function finish(timedOut) {
    clearInterval(timerId);
    const score = answers.filter((a) => a.correct).length, total = order.length;
    show("quiz-result");
    $("r-score").textContent = `${score} / ${total}${timedOut ? " (time ran out)" : ""}`;
    $("r-gap").textContent = expected == null ? "You did not write an expected score; try it next time: the gap is the point."
      : expected === score ? "Exactly what you expected. Well calibrated."
      : expected > score ? `You expected ${expected}: overconfident by ${expected - score}. Reread the explanations you missed.`
      : `You expected ${expected}: you know more than you think (${score - expected} better).`;
    $("r-review").innerHTML = order.map((q, k) => {
      const a = answers[k];
      const st = a ? (a.correct ? '<span class="ok">✓</span>' : '<span class="ko">✗</span>') : '<span class="ko">–</span>';
      return `<li>${st} ${M.esc(q.question)}<div class="muted small">${M.esc(q.explanation || "")}</div></li>`;
    }).join("");
    const attempt = { course, module, started: new Date(started).toISOString(), finished: new Date().toISOString(),
      seconds: Math.round((Date.now() - started) / 1000), expected, score, total,
      question_ids: order.map((q) => q.id), answers: answers.map((a) => ({ id: a.id, correct: a.correct })) };
    try { await M.store.update({ op: "add_attempt", attempt }); } catch (e) { /* nothing else to do */ }
  }

  $("start-btn").addEventListener("click", start);
  $("again-btn").addEventListener("click", start);
  $("answer-btn").addEventListener("click", () => (awaitingNext ? next() : answer()));
})();
