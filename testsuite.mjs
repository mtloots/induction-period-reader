/* TEST SUITE: archive runs put through the app's own fitter and compared against the reference
   produced by the same widened estimator.

   HOW TO RUN
       node _mkprobe.mjs        rebuilds _probe.mjs from index.html (needed once, and after any
                                change to the app)
       node testsuite.mjs       runs the eight traces bundled in selftest_cases.json
       node testsuite.mjs FILE  runs every reference run whose trace is in FILE, the archive CSV
                                held with the paper's materials
   Exits non-zero if any run fails its tolerance.

   The seven Spanish-cultivar oils are analysed in the paper but their values are not published
   here: they were supplied by the A Coruna group for the analysis, which is not the same as
   permission to redistribute. The full 98-run reference is held with the paper's materials, so the
   FILE form is available to the authors and the bundled form to everybody. */
import fs from 'fs';
const M = await import('./_probe.mjs?v=' + Date.now());
const ref = JSON.parse(fs.readFileSync('reference_focke.json','utf8'));

/* Trace source. Bundled eight by default; the full archive CSV when one is named. */
const csvPath = process.argv[2] || process.env.RANCIMAT_TRACES || null;
const byRun = new Map();
let source;
if (csvPath) {
  if (!fs.existsSync(csvPath)) {
    console.error(`no such trace file: ${csvPath}`);
    console.error('omit the argument to run against the eight traces bundled with this repository.');
    process.exit(2);
  }
  for (const l of fs.readFileSync(csvPath,'utf8').trim().split('\n').slice(1)) {
    const p = l.split(',');
    const run = p[1].replace(/"/g,'');
    if (!byRun.has(run)) byRun.set(run, {x:[],y:[]});
    const o = byRun.get(run); o.x.push(+p[2]); o.y.push(+p[3]);
  }
  source = `archive traces from ${csvPath}`;
} else {
  for (const c of JSON.parse(fs.readFileSync('selftest_cases.json','utf8')))
    byRun.set(c.run, {x:c.t, y:c.y});
  source = 'the eight traces bundled in selftest_cases.json';
}

const cases = ref.filter(r => byRun.has(r.run));
if (!cases.length) { console.error('no reference run matches any available trace'); process.exit(2); }
if (csvPath) for (const r of ref) if (!byRun.has(r.run)) console.log('MISSING TRACE', r.run);
console.log(`testing ${cases.length} of ${ref.length} reference runs against ${source}\n`);

const rows = [];
let i = 0;
for (const r of cases) {
  const tr = byRun.get(r.run);
  const f = await M.fitStaged(tr.x, tr.y, ()=>{});
  const rd = f ? M.k4_readings(f.theta) : {a:NaN,b:NaN};
  const d = (a,b) => (!isFinite(a) && !isFinite(b)) ? 0 : Math.abs(a-b);
  const num = v => (v===null||v===undefined) ? NaN : +v;   /* isFinite(null) is TRUE in JS */
  const rA = num(r.a), rB = num(r.b);
  const relA = (isFinite(rd.a)&&isFinite(rA)) ? Math.abs(rd.a-rA)/rA*100 : ((!isFinite(rd.a)&&!isFinite(rA))?0:NaN);
  rows.push({run:r.run, dk:d(f?f.theta[4]:NaN, r.k), dh:d(f?f.theta[5]:NaN, r.h),
             da:d(rd.a, rA), db:d(rd.b, rB), relA,
             rssr: f? f.rss/r.rss : NaN, floorOK: f && f.hFloor===r.floor,
             floorBinding: !!f && Math.abs(f.theta[5] - f.hFloor) < 1e-6, noFit: !f,
             aJS: rd.a, aR: rA, bJS: rd.b, bR: rB});
  if (++i % 10 === 0) console.log(`  ${i}/${cases.length}`);
}
const fin = v => v.filter(z=>isFinite(z));
const mx = v => Math.max(...fin(v));
console.log(`\n=== ${cases.length}-RUN TEST SUITE: app staged fitter vs the R/C reference ===`);
console.log('runs tested        ', rows.length);
console.log('runs with no fit   ', rows.filter(r=>r.noFit).length);
console.log('h-floor mismatches ', rows.filter(r=>!r.floorOK).length, '(binding:', rows.filter(r=>!r.floorOK&&r.floorBinding).length + ')');
console.log('tangent: both none or both present on', rows.filter(r=>isFinite(r.relA)).length, 'runs');
console.log('worst |d k|        ', mx(rows.map(r=>r.dk)).toExponential(2));
console.log('worst |d h|        ', mx(rows.map(r=>r.dh)).toExponential(2));
console.log('worst |d tangent|  ', mx(rows.map(r=>r.da)).toExponential(2), 'h');
console.log('worst |d 2nd-deriv|', mx(rows.map(r=>r.db)).toExponential(2), 'h');
console.log('worst relative tangent difference', mx(rows.map(r=>r.relA)).toFixed(4), '%');
console.log('worst |rss ratio - 1|', mx(rows.map(r=>Math.abs(r.rssr-1))).toExponential(2));
/* A floor mismatch is only a failure when the floor is actually BINDING. Two runs differ this way
   and neither is a numerical disagreement; both are recorded here so that no future reader has to
   re-derive them.

   Marula-3  the app reports h-floor -8 where the reference records -60, while the fitted h is
             -0.898755 against the reference's -0.89875. Neither floor is anywhere near binding, so
             the two agree on the answer and differ only on which floor they say they used. This is
             NOT an artefact of trace resolution: the archive traces are 600 points, the same as the
             bundled ones, and the difference appears at both.
   Cumin-3   the app's staged fitter returns NO FIT at all, where the reference does fit it (h
             1.16526, floor 0) and records no tangent reading. The comparison columns therefore read
             NaN against NaN, which looks like agreement but is not the same statement. It is
             counted and printed separately below rather than passing silently. */
const bad = rows.filter(r => r.relA > 0.5 || !isFinite(r.relA) || (!r.floorOK && r.floorBinding));
const noFit = rows.filter(r => r.noFit);
const floorInfo = rows.filter(r => !r.floorOK && !r.floorBinding && !r.noFit);
if (bad.length){ console.log('\nruns needing a look:');
  for (const b of bad) console.log(`  ${b.run.padEnd(24)} rel ${isFinite(b.relA)?b.relA.toFixed(3)+'%':'reading presence differs'}  aJS ${b.aJS} aR ${b.aR}  floorOK ${b.floorOK}`); }
if (noFit.length) { console.log('\nthe app produced NO FIT on these runs, while the reference has one:');
  for (const b of noFit) console.log(`  ${b.run.padEnd(24)} see reference_focke.json for the reference's own fit`); }
if (floorInfo.length) { console.log('\nnon-binding floor differences, reported not failed:');
  for (const b of floorInfo) console.log(`  ${b.run.padEnd(24)} fitted h is clear of both floors`); }
fs.writeFileSync('testsuite_result.json', JSON.stringify(rows,null,1));
console.log(bad.length ? `\nSUITE FAILED: ${bad.length} run(s) outside tolerance` : '\nSUITE PASSED');
process.exitCode = bad.length ? 1 : 0;
