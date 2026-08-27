/* TEST SUITE: every archive run this repository is free to distribute, put through the app's own
   fitter and compared against the reference produced by the same widened estimator.
   The seven Spanish-cultivar oils are analysed in the paper but their values are not published
   here: they were supplied by the A Coruna group for the analysis, which is not the same as
   permission to redistribute. The full 98-run reference is held with the paper's materials. */
import fs from 'fs';
const M = await import('./_probe.mjs?v=' + Date.now());
const ref = JSON.parse(fs.readFileSync('reference_focke.json','utf8'));
const oils = fs.readFileSync('/Users/home/Documents/Research/Arc length statistics/kappa4_regression/focke_oils_drop2026.csv','utf8')
  .trim().split('\n').slice(1);
const byRun = new Map();
for (const l of oils) {
  const p = l.split(',');
  const run = p[1].replace(/"/g,'');
  if (!byRun.has(run)) byRun.set(run, {x:[],y:[]});
  const o = byRun.get(run); o.x.push(+p[2]); o.y.push(+p[3]);
}
const rows = [];
let i = 0;
for (const r of ref) {
  const tr = byRun.get(r.run);
  if (!tr) { console.log('MISSING TRACE', r.run); continue; }
  const f = await M.fitStaged(tr.x, tr.y, ()=>{});
  const rd = f ? M.k4_readings(f.theta) : {a:NaN,b:NaN};
  const d = (a,b) => (!isFinite(a) && !isFinite(b)) ? 0 : Math.abs(a-b);
  const num = v => (v===null||v===undefined) ? NaN : +v;   /* isFinite(null) is TRUE in JS */
  const rA = num(r.a), rB = num(r.b);
  const relA = (isFinite(rd.a)&&isFinite(rA)) ? Math.abs(rd.a-rA)/rA*100 : ((!isFinite(rd.a)&&!isFinite(rA))?0:NaN);
  rows.push({run:r.run, dk:d(f?f.theta[4]:NaN, r.k), dh:d(f?f.theta[5]:NaN, r.h),
             da:d(rd.a, rA), db:d(rd.b, rB), relA,
             rssr: f? f.rss/r.rss : NaN, floorOK: f && f.hFloor===r.floor,
             aJS: rd.a, aR: rA, bJS: rd.b, bR: rB});
  if (++i % 10 === 0) console.log(`  ${i}/${ref.length}`);
}
const fin = v => v.filter(z=>isFinite(z));
const mx = v => Math.max(...fin(v));
console.log('\n=== 98-RUN TEST SUITE: app staged fitter vs the R/C reference ===');
console.log('runs tested        ', rows.length);
console.log('h-floor mismatches ', rows.filter(r=>!r.floorOK).length);
console.log('tangent: both none or both present on', rows.filter(r=>isFinite(r.relA)).length, 'runs');
console.log('worst |d k|        ', mx(rows.map(r=>r.dk)).toExponential(2));
console.log('worst |d h|        ', mx(rows.map(r=>r.dh)).toExponential(2));
console.log('worst |d tangent|  ', mx(rows.map(r=>r.da)).toExponential(2), 'h');
console.log('worst |d 2nd-deriv|', mx(rows.map(r=>r.db)).toExponential(2), 'h');
console.log('worst relative tangent difference', mx(rows.map(r=>r.relA)).toFixed(4), '%');
console.log('worst |rss ratio - 1|', mx(rows.map(r=>Math.abs(r.rssr-1))).toExponential(2));
const bad = rows.filter(r => r.relA > 0.5 || !r.floorOK || !isFinite(r.relA));
if (bad.length){ console.log('\nruns needing a look:');
  for (const b of bad) console.log(`  ${b.run.padEnd(24)} rel ${isFinite(b.relA)?b.relA.toFixed(3)+'%':'reading presence differs'}  aJS ${b.aJS} aR ${b.aR}  floorOK ${b.floorOK}`); }
fs.writeFileSync('testsuite_result.json', JSON.stringify(rows,null,1));
console.log('\nSUITE DONE');
