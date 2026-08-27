/* ---- controller ---- */
const $ = id => document.getElementById(id);
let TRACE = null, FIT = null, RD = null, BS = null, SRC = '';

const fmt = (v, d = 3) => isFinite(v) ? v.toFixed(d) : '—';
function setProgress(p, msg) { $('barFill').style.width = Math.round(p * 100) + '%'; $('status').textContent = msg; }

$('btnTheme').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const next = cur ? (cur === 'dark' ? 'light' : 'dark') : (sysDark ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', next);
  if (TRACE) draw($('plot'), TRACE, FIT, RD || {});
});

function accept(text, name) {
  try {
    TRACE = parseTrace(text);
    SRC = name;
    FIT = null; RD = null; BS = null;
    $('srcName').textContent = `${name} · ${TRACE.nRaw} points · ${TRACE.x[TRACE.x.length-1].toFixed(2)} h`;
    $('console').classList.remove('hidden');
    $('btnRun').disabled = false;
    $('btnPrint').disabled = true;
    $('diagCard').classList.add('hidden');
    $('caveat').classList.add('hidden');
    $('aVal').innerHTML = '—<span class="u">h</span>'; $('aCI').textContent = '';
    $('bVal').textContent = '—'; $('bCI').textContent = '—';
    $('eqChip').className = 'chip info'; $('eqChip').textContent = 'not yet computed';
    $('eqText').textContent = '';
    draw($('plot'), TRACE, null, {});
  } catch (e) {
    $('console').classList.remove('hidden');
    $('caveat').classList.remove('hidden');
    $('caveat').innerHTML = `<strong>That file could not be read as a trace.</strong> ${e.message}. ` +
      `Two numeric columns are needed: time in the first, conductivity in the second.`;
  }
}
$('file').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(t => accept(t, f.name));
});
const drop = $('drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.add('over');
}));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.remove('over');
}));
drop.addEventListener('drop', e => {
  const f = e.dataTransfer.files[0]; if (!f) return;
  f.text().then(t => accept(t, f.name));
});
$('btnExample').addEventListener('click', () => accept(EXAMPLE, 'avocado, 120 °C (worked example)'));

$('btnRun').addEventListener('click', async () => {
  if (!TRACE) return;
  $('btnRun').disabled = true; $('btnExample').disabled = true;
  $('progress').classList.remove('hidden');
  setProgress(0.02, 'fitting the response');
  await new Promise(r => setTimeout(r, 30));

  FIT = await fitStaged(TRACE.x, TRACE.y, (p, m) => setProgress(0.02 + 0.62 * p, m));
  if (!FIT) {
    setProgress(1, 'no admissible fit');
    $('caveat').classList.remove('hidden');
    $('caveat').innerHTML = '<strong>This trace does not support a fit.</strong> No shape in the ' +
      'admissible set produced a rising response with an induction period inside the run. ' +
      'That usually means the run was stopped before the oxidation finished.';
    $('btnRun').disabled = false; $('btnExample').disabled = false;
    return;
  }
  RD = k4_readings(FIT.theta);
  draw($('plot'), TRACE, FIT, RD);

  setProgress(0.68, 'bootstrapping intervals, 400 resamples');
  await new Promise(r => setTimeout(r, 30));
  BS = bootstrapReadings(TRACE.x, TRACE.y, FIT, 400, mulberry32(20260827));
  setProgress(1, 'done');
  render();
  $('progress').classList.add('hidden');
  $('btnRun').disabled = false; $('btnExample').disabled = false; $('btnPrint').disabled = false;
});
$('btnPrint').addEventListener('click', () => window.print());

function render() {
  const run = TRACE.x[TRACE.x.length - 1];
  const [g0, g1, mu, sg, k, h] = FIT.theta;

  if (isFinite(RD.a)) {
    $('aVal').innerHTML = `${RD.a.toFixed(3)}<span class="u">h</span>`;
    $('aCI').textContent = isFinite(BS.a[0])
      ? `95% interval  ${fmt(BS.a[0])} to ${fmt(BS.a[1])} h   ·   ${BS.nA} of 400 resamples`
      : `interval suppressed — only ${BS.nA} of 400 resamples returned a reading inside the run`;
  } else {
    $('aVal').innerHTML = `none<span class="u"></span>`;
    $('aCI').textContent = 'the fitted curve admits no tangent reading inside this run';
  }
  $('bVal').textContent = isFinite(RD.b) ? RD.b.toFixed(3) + ' h' : 'does not exist';
  $('bCI').textContent = isFinite(RD.b)
    ? (isFinite(BS.b[0]) ? `${fmt(BS.b[0])} to ${fmt(BS.b[1])} h` : `suppressed (${BS.nB}/400)`)
    : '—';

  /* equivalence: is this shape on the locus where the two readings coincide? */
  const kLoc = locusK(h);
  const chip = $('eqChip'), txt = $('eqText');
  if (!isFinite(RD.b)) {
    chip.className = 'chip info';
    chip.textContent = 'the question does not arise';
    txt.textContent = 'Beyond a frontier in the fourth shape parameter the second-derivative reading ' +
      'ceases to exist for the fitted curve. Only the tangent reading is available here, so there is ' +
      'nothing to reconcile — this is a property of the shape, not a failure of the fit.';
  } else {
    const gap = RD.a - RD.b, rel = Math.abs(gap) / RD.a * 100;
    if (!isFinite(kLoc)) {
      chip.className = 'chip no'; chip.textContent = 'not reconcilable at this shape';
      txt.textContent = `The two readings differ by ${fmt(Math.abs(gap))} h (${rel.toFixed(1)} per cent). ` +
        `At this value of h there is no shape in the admissible set at which they coincide, so the ` +
        `choice between the two constructions has to be made and stated.`;
    } else {
      const near = Math.abs(k - kLoc) < 0.06;
      chip.className = near ? 'chip ok' : 'chip no';
      chip.textContent = near ? 'reconcilable — this oil sits on the locus' : 'reconcilable, at a price';
      txt.textContent = `The two readings coincide at k = ${kLoc.toFixed(3)} for this value of h; the ` +
        `fitted shape is k = ${k.toFixed(3)}. They currently differ by ${fmt(Math.abs(gap))} h ` +
        `(${rel.toFixed(1)} per cent). ` + (near
          ? 'The fitted shape is close enough to that curve that a single equivalent induction period is well supported.'
          : 'Constraining the fit to the locus would make them agree, at a cost in fit that should be quoted alongside the reading.');
    }
  }

  const rows = [
    ['tangent reading', isFinite(RD.a) ? RD.a.toFixed(4) + ' h' : 'none',
      'where the steepest tangent meets the drifting baseline'],
    ['second-derivative reading', isFinite(RD.b) ? RD.b.toFixed(4) + ' h' : 'does not exist for this shape',
      'the inflection below the steepest point'],
    ['shape k', k.toFixed(4), k <= -0.9790 ? 'at the lower wall of the admissible set — treat with care'
      : 'controls the sharpness of the onset'],
    ['shape h', h.toFixed(4), h < -0.01 ? 'negative: the region the log-logistic and 5PL models occupy'
      : (Math.abs(h) < 0.01 ? 'zero: the generalised extreme value member' : 'controls saturation')],
    ['location µ', mu.toFixed(4) + ' h', 'sets where the transition sits'],
    ['scale σ', sg.toFixed(4) + ' h', 'sets how long the transition takes'],
    ['plateau', g1.toFixed(2) + ' µS/cm', 'total conductivity rise attributed to oxidation'],
    ['baseline drift', FIT.drift.toFixed(4) + ' µS/cm/h', 'the water trap rising through the run'],
    ['residual sum of squares', FIT.rss.toPrecision(6), 'fit quality on ' + TRACE.x.length + ' points'],
    ['run length', run.toFixed(3) + ' h', 'a reading may not exceed the run that measured it'],
    ['time unit read as', TRACE.unit, TRACE.unit === 'seconds' ? 'converted to hours' : 'used as given'],
  ];
  $('diagBody').innerHTML = rows.map(r =>
    `<tr><td>${r[0]}</td><td class="n">${r[1]}</td><td style="color:var(--muted)">${r[2]}</td></tr>`).join('');
  $('diagCard').classList.remove('hidden');

  const warn = [];
  if (k <= -0.9790) warn.push('The shape parameter k has come to rest on the lower wall of the admissible ' +
    'set. The reading is a location functional and is insensitive to this, but the shape itself should not ' +
    'be interpreted for this trace.');
  if (FIT.hFloor <= -8) warn.push('This fit needed the deep end of the h range. That region is admissible ' +
    'but sparsely visited; check the drawn curve against the trace before quoting the shape.');
  if (isFinite(RD.a) && RD.a > 0.85 * run) warn.push('The reading falls in the last fifteen per cent of the ' +
    'run. The instrument stopped soon after the transition, so the estimate leans on little post-transition data.');
  if (isFinite(BS.a[0]) && (BS.a[1] - BS.a[0]) / RD.a > 0.2) warn.push('The interval is wide relative to the ' +
    'reading — better than a fifth of it. Replicate runs would help more than a longer one.');
  if (warn.length) {
    $('caveat').classList.remove('hidden');
    $('caveat').innerHTML = '<strong>Worth knowing about this trace.</strong> ' + warn.join(' ');
  } else $('caveat').classList.add('hidden');
}

/* ---- self-test: refit the built-in archive runs and compare with the published table ---- */
$('btnSelfTest').addEventListener('click', async () => {
  const btn = $('btnSelfTest');
  btn.disabled = true;
  $('stBar').classList.remove('hidden');
  $('stTable').classList.remove('hidden');
  $('stBody').innerHTML = '';
  $('stSummary').textContent = '';
  let worstRel = 0, worstAbs = 0, fails = 0, presenceOK = 0;
  for (let i = 0; i < SELFTEST.length; i++) {
    const c = SELFTEST[i];
    $('stFill').style.width = Math.round(100 * i / SELFTEST.length) + '%';
    $('stSummary').textContent = `refitting ${c.run} (${i + 1} of ${SELFTEST.length})`;
    await new Promise(r => setTimeout(r, 20));
    const f = await fitStaged(c.t, c.y, () => {});
    const rd = f ? k4_readings(f.theta) : { a: NaN, b: NaN };
    const pubA = (c.a === null || c.a === undefined) ? NaN : c.a;
    const pubB = (c.b === null || c.b === undefined) ? NaN : c.b;
    const bothA = isFinite(rd.a) === isFinite(pubA);
    const bothB = isFinite(rd.b) === isFinite(pubB);
    if (bothB) presenceOK++;
    const dA = (isFinite(rd.a) && isFinite(pubA)) ? Math.abs(rd.a - pubA) : NaN;
    const relA = isFinite(dA) ? dA / pubA * 100 : NaN;
    if (isFinite(relA)) { worstRel = Math.max(worstRel, relA); worstAbs = Math.max(worstAbs, dA); }
    /* the published table is quoted to four decimals, so the tool cannot agree more closely than
       half of its last digit. Pass means: the same readings exist, and any difference is under
       half a thousandth of an hour -- under two seconds, far below anything the test resolves. */
    const ok = bothA && bothB && (!isFinite(dA) || dA < 5e-4);
    if (!ok) fails++;
    const secondCell = isFinite(pubB)
      ? (isFinite(rd.b) ? rd.b.toFixed(4) + ' h' : '<span style="color:var(--warn)">missing</span>')
      : (isFinite(rd.b) ? '<span style="color:var(--warn)">unexpected</span>' : 'none, as published');
    $('stBody').insertAdjacentHTML('beforeend',
      `<tr><td>${c.run}</td>` +
      `<td class="n">${isFinite(pubA) ? pubA.toFixed(4) : 'none'}</td>` +
      `<td class="n">${isFinite(rd.a) ? rd.a.toFixed(4) : 'none'}</td>` +
      `<td class="n">${isFinite(dA) ? dA.toExponential(1) : '—'}</td>` +
      `<td class="n">${secondCell}</td>` +
      `<td>${ok ? '<span class="chip ok">agrees</span>' : '<span class="chip no">differs</span>'}</td></tr>`);
  }
  $('stFill').style.width = '100%';
  $('stBar').classList.add('hidden');
  $('stSummary').innerHTML = fails === 0
    ? `<strong style="color:var(--ok)">All ${SELFTEST.length} runs agree with the published table.</strong> ` +
      `Largest difference in an induction period: ${(worstAbs*3600).toFixed(2)} seconds ` +
      `(${worstRel.toExponential(1)} per cent of the reading). Presence or absence of the second ` +
      `reading matched on all ${presenceOK}.`
    : `<strong style="color:var(--warn)">${fails} of ${SELFTEST.length} runs disagree.</strong> ` +
      `That should not happen; please tell us which browser you are using.`;
  btn.disabled = false;
});
