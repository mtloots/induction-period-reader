/* ---- staged async fit: coarse pass on a thinned trace, polish the best basins on the full one.
   The browser must stay responsive, so the loop yields between start batches. ---- */
const YIELD = () => new Promise(r => setTimeout(r, 0));

function objectiveFor(x, y, hFloor, hHi) {
  const n = x.length, F = new Float64Array(n);
  return (p) => {
    const mu = p[0], sg = Math.exp(p[1]), k = p[2], h = p[3];
    if (!isFinite(sg) || sg <= 0 || k < K_LO || k > K_HI || h < hFloor || h > hHi) return 1e12;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = k4_F(x[i], mu, sg, k, h);
      if (!isFinite(v)) return 1e12;
      F[i] = v; if (v < lo) lo = v; if (v > hi) hi = v;
    }
    if (hi - lo < 1e-8) return 1e12;
    return varproRSS(x, F, y).rss;
  };
}
function finalise(x, y, par) {
  const n = x.length, F = new Float64Array(n);
  const [mu, lsg, k, h] = par, sg = Math.exp(lsg);
  for (let i = 0; i < n; i++) F[i] = k4_F(x[i], mu, sg, k, h);
  const { rss, beta } = varproRSS(x, F, y);
  return { theta: [beta[0], beta[2], mu, sg, k, h], drift: beta[1], rss };
}
/* The fit is the SAME algorithm as the reference implementation: the full start grid on the
   full trace, walking the ladder of h floors and taking the deepest floor whose best fit is
   physical. An earlier version screened starts on a thinned copy to save time; on a handful of
   runs that polished the wrong basin and moved the reading by up to eight parts in a thousand,
   which is too much for a number anyone will quote. Exactness wins; the loop yields to keep the
   page responsive. */
async function fitStaged(x, y, onProgress) {
  const starts = k4_starts(x, y);
  const floors = [-60, -8, -3, -1.2, -0.5, 0];
  let done = 0;
  const total = floors.reduce((a, f) => a + starts.filter(s => s[3] > f).length, 0);
  for (const flo of floors) {
    const usable = starts.filter(s => s[3] > flo);
    const obj = objectiveFor(x, y, flo, 4);
    let best = null;
    for (let i = 0; i < usable.length; i++) {
      const a = nmd(obj, usable[i], 4, 1500);
      const b = nmd(obj, a.par, 4, 1500);
      const o = b.value < a.value ? b : a;
      if (!best || o.value < best.value) best = o;
      done++;
      if ((i & 15) === 0) {
        onProgress(done / total, `searching the shape plane, floor h \u2265 ${flo}`);
        await YIELD();
      }
    }
    if (!best) continue;
    const fit = finalise(x, y, best.par);
    fit.hFloor = flo;
    if (isPhysical(fit, x)) return fit;
  }
  return null;
}

/* ---- trace intake ---- */
function parseTrace(text) {
  const lines = text.split(/\r?\n/);
  const pts = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[,;\t]+/);
    if (parts.length < 2) continue;
    const a = parseFloat(parts[0].replace(',', '.')), b = parseFloat(parts[1].replace(',', '.'));
    if (!isFinite(a) || !isFinite(b)) continue;
    pts.push([a, b]);
  }
  if (pts.length < 40) throw new Error(`only ${pts.length} usable rows were found; a trace needs at least 40`);
  pts.sort((p, q) => p[0] - q[0]);
  let t = pts.map(p => p[0]);
  const unit = t[t.length - 1] > 500 ? 'seconds' : 'hours';
  if (unit === 'seconds') t = t.map(v => v / 3600);
  const t0 = t[0];
  t = t.map(v => v - t0);
  let x = t, y = pts.map(p => p[1]);
  const target = 600;
  if (x.length > target) {
    const idx = [...new Set(Array.from({ length: target }, (_, i) => Math.round(i * (x.length - 1) / (target - 1))))];
    x = idx.map(i => x[i]); y = idx.map(i => y[i]);
  }
  return { x, y, unit, nRaw: pts.length };
}

/* ---- plot ---- */
function draw(cv, tr, fit, rd) {
  const css = getComputedStyle(document.documentElement);
  const C = n => css.getPropertyValue(n).trim();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth, H = Math.round(W * 0.57);
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.height = H + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const L = 54, R = 14, T = 14, B = 40;
  const xs = tr.x, ys = tr.y;
  const xmax = xs[xs.length - 1];
  let ymin = Infinity, ymax = -Infinity;
  for (const v of ys) { if (v < ymin) ymin = v; if (v > ymax) ymax = v; }
  const pad = (ymax - ymin) * 0.08 || 1;
  ymin -= pad; ymax += pad;
  const px = v => L + (v / xmax) * (W - L - R);
  const py = v => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);

  g.strokeStyle = C('--line'); g.lineWidth = 1; g.font = '11px "IBM Plex Mono", monospace';
  g.fillStyle = C('--faint');
  const nTick = 6;
  for (let i = 0; i <= nTick; i++) {
    const yv = ymin + (ymax - ymin) * i / nTick, Y = py(yv);
    g.beginPath(); g.moveTo(L, Y); g.lineTo(W - R, Y); g.stroke();
    g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText(yv.toFixed(0), L - 8, Y);
  }
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (let i = 0; i <= 6; i++) {
    const xv = xmax * i / 6;
    g.fillText(xv.toFixed(1), px(xv), H - B + 8);
  }
  g.fillStyle = C('--muted'); g.textAlign = 'center';
  g.fillText('time (h)', (L + W - R) / 2, H - 15);
  g.save(); g.translate(14, (T + H - B) / 2); g.rotate(-Math.PI / 2);
  g.fillText('conductivity (µS/cm)', 0, 0); g.restore();

  /* measured trace */
  g.strokeStyle = C('--line-strong'); g.lineWidth = 2.4; g.beginPath();
  xs.forEach((v, i) => i ? g.lineTo(px(v), py(ys[i])) : g.moveTo(px(v), py(ys[i])));
  g.stroke();

  if (fit) {
    const [g0, g1, mu, sg, k, h] = fit.theta;
    /* baseline the tangent construction meets */
    g.strokeStyle = C('--faint'); g.lineWidth = 1; g.setLineDash([3, 4]); g.beginPath();
    g.moveTo(px(0), py(g0)); g.lineTo(px(xmax), py(g0 + fit.drift * xmax)); g.stroke();
    g.setLineDash([]);
    /* fitted response */
    g.strokeStyle = C('--accent'); g.lineWidth = 2.2; g.beginPath();
    for (let i = 0; i <= 400; i++) {
      const xv = xmax * i / 400;
      const yv = g0 + fit.drift * xv + g1 * k4_F(xv, mu, sg, k, h);
      i ? g.lineTo(px(xv), py(yv)) : g.moveTo(px(xv), py(yv));
    }
    g.stroke();
    const rule = (v, col, lab) => {
      if (!isFinite(v) || v < 0 || v > xmax) return;
      g.strokeStyle = col; g.lineWidth = 1.6; g.setLineDash([5, 3]);
      g.beginPath(); g.moveTo(px(v), T); g.lineTo(px(v), H - B); g.stroke();
      g.setLineDash([]);
      g.fillStyle = col; g.textAlign = 'left'; g.textBaseline = 'top';
      g.font = '600 11px "IBM Plex Mono", monospace';
      g.fillText(lab + ' ' + v.toFixed(2) + ' h', px(v) + 5, T + 3);
    };
    rule(rd.b, C('--onset'), '2nd deriv');
    rule(rd.a, C('--accent-ink'), 'tangent');
  }
}
