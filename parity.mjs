import { fit_k4w, k4_readings } from './k4.js';
import fs from 'fs';
const R = fs.readFileSync('parity_R.csv','utf8').trim().split('\n');
const hdr = R[0].split(',').map(s=>s.replace(/"/g,''));
const rows = R.slice(1).map(l=>{ const p=l.split(','); const o={};
  hdr.forEach((k,i)=>o[k]=p[i].replace(/"/g,'')); return o; });
/* Directory holding the trace CSVs named in parity_R.csv. These are the paper's materials and are
   not distributed with this repository, so the path must be supplied:
       node parity.mjs /path/to/data_oils2026/     or   RANCIMAT_TRACE_DIR=/path/... node parity.mjs */
let DIR = process.argv[2] || process.env.RANCIMAT_TRACE_DIR || '';
if (!DIR) {
  console.error('parity.mjs needs the trace directory: node parity.mjs /path/to/data_oils2026/');
  console.error('Those traces are held with the paper\'s materials and are not in this repository.');
  console.error('For a check that runs anywhere, use: node testsuite.mjs');
  process.exit(2);
}
if (!DIR.endsWith('/')) DIR += '/';
console.log('file'.padEnd(24),'  d(k)      d(h)      d(a)      d(b)     rss ratio  floor');
let worst={k:0,h:0,a:0,b:0,rss:0};
for (const r of rows) {
  const csv=fs.readFileSync(DIR+r.file,'utf8').trim().split('\n').slice(1);
  const X=[],Y=[]; for(const l of csv){const p=l.split(','); X.push(+p[0]); Y.push(+p[1]);}
  const idx=[...new Set(Array.from({length:600},(_,i)=>Math.round(1+i*(X.length-1)/599)))].map(v=>v-1);
  const x=idx.map(i=>X[i]), y=idx.map(i=>Y[i]);
  const f=fit_k4w(x,y); const rd=k4_readings(f.theta);
  const d=(a,b)=>(isNaN(a)&&(b===''||isNaN(+b)))?0:Math.abs(a-(+b));
  const dk=d(f.theta[4],r.k), dh=d(f.theta[5],r.h), da=d(rd.a,r.a), db=d(rd.b,r.b);
  const rr=f.rss/(+r.rss);
  worst.k=Math.max(worst.k,dk); worst.h=Math.max(worst.h,dh);
  worst.a=Math.max(worst.a,da); worst.b=Math.max(worst.b,db);
  worst.rss=Math.max(worst.rss,Math.abs(rr-1));
  console.log(r.file.padEnd(24), dk.toExponential(1).padStart(8), dh.toExponential(1).padStart(9),
    da.toExponential(1).padStart(9), db.toExponential(1).padStart(9), rr.toFixed(6).padStart(10),
    String(f.hFloor).padStart(6), (+r.floor===f.hFloor)?'':'  FLOOR DIFFERS');
}
console.log('\nworst absolute differences:');
console.log('  k', worst.k.toExponential(2), ' h', worst.h.toExponential(2),
            ' tangent', worst.a.toExponential(2), ' derivative', worst.b.toExponential(2),
            ' |rss ratio - 1|', worst.rss.toExponential(2));
