/* kappa4 engine, JavaScript front. A PORT of arcstat's C back end (arck4.c, arck4fit.c),
   kept deliberately line-for-line where the C has a guard, because the guards are the part
   that took the longest to get right. Parity-tested against the C on the 98-run oil archive.
   Convention: theta = [g0, g1, mu, sg, k, h]; the response is g0 + drift*x + g1*F(x). */
const K4_EPS = 1e-12;

export function k4_y(x, mu, sg, k) {           /* returns [y, z] as in the C's k4_y */
  const t = (x - mu) / sg;
  if (Math.abs(k) < K4_EPS) return [Math.exp(-t), 1.0];
  const zz = 1.0 - k * t;
  if (zz <= 0.0) return [k > 0 ? 0.0 : Infinity, zz];
  return [Math.exp(Math.log(zz) / k), zz];
}
export function k4_F(x, mu, sg, k, h) {
  const [y] = k4_y(x, mu, sg, k);
  if (!(y >= 0.0)) return 0.0;
  if (y === Infinity) return 0.0;
  if (Math.abs(h) < K4_EPS) return Math.exp(-y);
  const u = 1.0 - h * y;
  if (u <= 0.0) return h > 0 ? 0.0 : 1.0;
  return Math.exp(Math.log(u) / h);
}
export function k4_f(x, mu, sg, k, h) {
  const [y, z] = k4_y(x, mu, sg, k);
  if (!(y > 0.0) || y === Infinity || z <= 0.0) return 0.0;
  const F = k4_F(x, mu, sg, k, h);
  if (F <= 0.0) return 0.0;
  return (1.0 / sg) * (y / z) * Math.pow(F, 1.0 - h);
}
export function k4_q(u, mu, sg, k, h) {
  let w;
  if (Math.abs(h) < K4_EPS) { if (u <= 0.0) return -Infinity; w = -Math.log(u); }
  else w = (1.0 - Math.pow(u, h)) / h;
  if (w <= 0.0) return k > 0 ? mu + sg / k : Infinity;
  if (Math.abs(k) < K4_EPS) return mu - sg * Math.log(w);
  return mu + (sg / k) * (1.0 - Math.exp(k * Math.log(w)));
}

/* the two standard readings; mirrors arck4_readings including both guards */
export function k4_readings(theta, grid = 4000) {   /* the C wrapper default; parity depends on it */
  let [g0, g1, mu, sg, k, h] = theta;
  if (Math.abs(k) < 1e-4) k = (k >= 0 ? 1 : -1) * 1e-4;
  const x0 = k4_q(0.001, mu, sg, k, h), x1 = k4_q(0.999, mu, sg, k, h);
  const out = { a: NaN, b: NaN, mode: NaN };
  if (!isFinite(x0) || !isFinite(x1) || x1 <= x0) return out;
  const dx = (x1 - x0) / (grid - 1);
  let ic = 0, best = -1, m1c = 0;
  const m1 = new Float64Array(grid);
  for (let i = 0; i < grid; i++) {
    const xx = x0 + dx * i;
    m1[i] = g1 * k4_f(xx, mu, sg, k, h);
    if (m1[i] > best) { best = m1[i]; ic = i; }
  }
  if (ic <= 0 || ic >= grid - 1) return out;   /* boundary "mode" => neither reading exists */
  const c0 = x0 + dx * ic;
  out.mode = c0;
  out.a = c0 - (g1 * k4_F(c0, mu, sg, k, h)) / m1[ic];
  if (c0 > x0) {
    const dz = (c0 - x0) / (grid - 1);
    const m2 = new Float64Array(grid);
    let m2max = 0;
    for (let i = 0; i < grid; i++) {
      m2[i] = g1 * k4_f(x0 + dz * i, mu, sg, k, h);
      if (m2[i] > m2max) m2max = m2[i];
    }
    const thr = 1e-13 * m2max;
    for (let i = 1; i + 2 < grid; i++) {
      const d2a = m2[i + 1] - 2 * m2[i] + m2[i - 1];
      const d2b = m2[i + 2] - 2 * m2[i + 1] + m2[i];
      if (Math.abs(d2a) > thr && Math.abs(d2b) > thr &&
          ((d2a > 0 && d2b < 0) || (d2a < 0 && d2b > 0))) { out.b = x0 + dz * i; break; }
    }
  }
  return out;
}

/* variable projection: solve (g0, drift, g1) exactly for a given shape, return rss and coefs */
export function varproRSS(x, F, y) {
  const n = x.length;
  let s1 = n, sx = 0, sf = 0, sxx = 0, sxf = 0, sff = 0, sy = 0, sxy = 0, sfy = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i], fi = F[i], yi = y[i];
    sx += xi; sf += fi; sxx += xi * xi; sxf += xi * fi; sff += fi * fi;
    sy += yi; sxy += xi * yi; sfy += fi * yi;
  }
  const A = [[s1, sx, sf], [sx, sxx, sxf], [sf, sxf, sff]];
  const b = [sy, sxy, sfy];
  const ridge = 1e-10 * (A[0][0] + A[1][1] + A[2][2]);
  for (let i = 0; i < 3; i++) A[i][i] += ridge;
  for (let c = 0; c < 3; c++) {                      /* Gaussian elimination, 3x3 */
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-300) return { rss: Infinity, beta: [0, 0, 0] };
    if (p !== c) { const t = A[p]; A[p] = A[c]; A[c] = t; const tb = b[p]; b[p] = b[c]; b[c] = tb; }
    for (let r = c + 1; r < 3; r++) {
      const f = A[r][c] / A[c][c];
      for (let q = c; q < 3; q++) A[r][q] -= f * A[c][q];
      b[r] -= f * b[c];
    }
  }
  const beta = [0, 0, 0];
  for (let r = 2; r >= 0; r--) {
    let s = b[r];
    for (let q = r + 1; q < 3; q++) s -= A[r][q] * beta[q];
    beta[r] = s / A[r][r];
  }
  let rss = 0;
  for (let i = 0; i < n; i++) {
    const e = y[i] - (beta[0] + beta[1] * x[i] + beta[2] * F[i]);
    rss += e * e;
  }
  return { rss: isFinite(rss) ? rss : Infinity, beta };
}

/* deterministic Nelder-Mead over the shape, mirroring nmd() in arck4fit.c */
function nmd(f, start, d, maxit) {
  const n1 = d + 1;
  const S = [], fv = [];
  for (let i = 0; i < n1; i++) {
    const p = start.slice();
    if (i > 0) p[i - 1] += (Math.abs(start[i - 1]) > 1e-8 ? 0.10 * Math.abs(start[i - 1]) : 0.10);
    S.push(p); fv.push(f(p));
  }
  for (let it = 0; it < maxit; it++) {
    let lo = 0, hi = 0;
    for (let i = 1; i < n1; i++) { if (fv[i] < fv[lo]) lo = i; if (fv[i] > fv[hi]) hi = i; }
    let nh = hi === 0 ? 1 : 0;
    for (let i = 0; i < n1; i++) if (i !== hi && fv[i] > fv[nh]) nh = i;
    if (Math.abs(fv[hi] - fv[lo]) <= 1e-12 * (Math.abs(fv[lo]) + 1e-12)) break;
    const cen = new Array(4).fill(0);
    for (let i = 0; i < n1; i++) if (i !== hi) for (let j = 0; j < d; j++) cen[j] += S[i][j] / d;
    const xr = S[hi].slice();
    for (let j = 0; j < d; j++) xr[j] = cen[j] + (cen[j] - S[hi][j]);
    const fr = f(xr);
    if (fr < fv[lo]) {
      const xe = S[hi].slice();
      for (let j = 0; j < d; j++) xe[j] = cen[j] + 2.0 * (cen[j] - S[hi][j]);
      const fe = f(xe);
      if (fe < fr) { S[hi] = xe; fv[hi] = fe; } else { S[hi] = xr; fv[hi] = fr; }
    } else if (fr < fv[nh]) { S[hi] = xr; fv[hi] = fr; }
    else {
      const xc = S[hi].slice();
      for (let j = 0; j < d; j++) xc[j] = cen[j] + 0.5 * (S[hi][j] - cen[j]);
      const fc = f(xc);
      if (fc < fv[hi]) { S[hi] = xc; fv[hi] = fc; }
      else for (let i = 0; i < n1; i++) if (i !== lo) {
        for (let j = 0; j < d; j++) S[i][j] = S[lo][j] + 0.5 * (S[i][j] - S[lo][j]);
        fv[i] = f(S[i]);
      }
    }
  }
  let lo = 0;
  for (let i = 1; i < n1; i++) if (fv[i] < fv[lo]) lo = i;
  return { par: S[lo], value: fv[lo] };
}

function runmed(y, w) {                     /* running median, odd window, as stats::runmed */
  const n = y.length, half = (w - 1) >> 1, out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half), hi = Math.min(n - 1, i + half);
    const seg = Array.prototype.slice.call(y, lo, hi + 1).sort((a, b) => a - b);
    out[i] = seg[(seg.length - 1) >> 1];
  }
  return out;
}

/* the paper's start grid, with h carried DIRECTLY (the widened estimator of 26 Aug 2026) */
export function k4_starts(x, y) {
  const n = x.length;
  const w = Math.min(21, (n % 2) ? n : n - 1);
  const ys = runmed(y, w % 2 ? w : w - 1);
  let lo = Infinity, hi = -Infinity;
  for (const v of ys) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const kc = Math.max(3, Math.round(0.05 * n));
  let bi = kc, bd = -Infinity;
  for (let i = kc; i < n - 1; i++) { const d = (ys[i + 1] - ys[i]) / (x[i + 1] - x[i]);
    if (d > bd) { bd = d; bi = i; } }
  const mus = x[bi];
  let mum = x[0]; for (let i = 0; i < n; i++) if (ys[i] >= lo + 0.5 * (hi - lo)) { mum = x[i]; break; }
  let i1 = 0, i2 = n - 1;
  for (let i = 0; i < n; i++) if (ys[i] >= lo + 0.25 * (hi - lo)) { i1 = i; break; }
  for (let i = 0; i < n; i++) if (ys[i] >= lo + 0.75 * (hi - lo)) { i2 = i; break; }
  const sg0 = Math.max((x[i2] - x[i1]) / 1.5, 0.02 * (x[n - 1] - x[0]));
  const m0 = mus === mum ? [mus] : [mus, mum];
  const st = [];
  for (const m of m0) for (const fz of [0.5, 1, 2]) for (const k0 of [-0.9, -0.6, -0.3, 0, 0.3])
    for (const h0 of [-30, -12, -4, -1.5, -1, -0.4, 0.02, 0.1, 0.3, 0.8])
      st.push([m, Math.log(sg0 * fz), k0, h0]);
  return st;
}

export const K_LO = -0.98, K_HI = 0.95;

/* One fit at a given lower bound on h. Returns theta, drift, rss. */
function fitAt(x, y, starts, hFloor, hHi = 4) {
  const n = x.length, F = new Float64Array(n);
  const obj = (p) => {
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
  let best = null;
  for (const s of starts) {
    if (s[3] <= hFloor) continue;
    const a = nmd(obj, s, 4, 1500);
    const b = nmd(obj, a.par, 4, 1500);
    const o = b.value < a.value ? b : a;
    if (!best || o.value < best.value) best = o;
  }
  if (!best) return null;
  const [mu, lsg, k, h] = best.par, sg = Math.exp(lsg);
  for (let i = 0; i < n; i++) F[i] = k4_F(x[i], mu, sg, k, h);
  const { rss, beta } = varproRSS(x, F, y);
  return { theta: [beta[0], beta[2], mu, sg, k, h], drift: beta[1], rss };
}

/* physicality: the plateau must rise and the tangent reading must be a real induction period
   inside the run that measured it. The 26 Aug 2026 audit found excellent-RSS fits that violate
   exactly these -- negative plateau, reading outside the window -- and they are not oxidation
   curves. */
export function isPhysical(fit, x) {
  if (!fit || !isFinite(fit.rss)) return false;
  if (fit.theta[1] <= 0) return false;
  const r = k4_readings(fit.theta);
  return isFinite(r.a) && r.a >= 0 && r.a <= x[x.length - 1];
}

/* the ladder: deepest h floor whose best fit is physical */
export function fit_k4w(x, y) {
  const starts = k4_starts(x, y);
  for (const flo of [-60, -8, -3, -1.2, -0.5, 0]) {
    const f = fitAt(x, y, starts, flo);
    if (isPhysical(f, x)) { f.hFloor = flo; return f; }
  }
  const f = fitAt(x, y, starts.filter(s => s[3] > 0), 0);
  if (f) f.hFloor = 0;
  return f;
}

/* Bootstrap intervals. The replicates refit from the POINT ESTIMATE only, not the full
   multi-start: a resampled curve differs from the original by noise alone, so one local
   search from there suffices -- and it is what makes this affordable in a browser. */
export function bootstrapReadings(x, y, fit, B = 400, rng = mulberry32(20260827), onProgress) {
  const n = x.length, F = new Float64Array(n);
  const [g0, g1, mu, sg, k, h] = fit.theta, drift = fit.drift;
  const fitted = new Float64Array(n), resid = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    fitted[i] = g0 + drift * x[i] + g1 * k4_F(x[i], mu, sg, k, h);
    resid[i] = y[i] - fitted[i];
  }
  const xr = [x[0], x[n - 1]];
  const seed = [mu, Math.log(sg), k, h];
  const A = [], Bb = [];
  const yb = new Float64Array(n);
  for (let b = 0; b < B; b++) {
    for (let i = 0; i < n; i++) yb[i] = fitted[i] + resid[(rng() * n) | 0];
    const obj = (p) => {
      const m = p[0], s = Math.exp(p[1]), kk = p[2], hh = p[3];
      if (!isFinite(s) || s <= 0 || kk < K_LO || kk > K_HI || hh < (fit.hFloor ?? -60) || hh > 4) return 1e12;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) {
        const v = k4_F(x[i], m, s, kk, hh);
        if (!isFinite(v)) return 1e12;
        F[i] = v; if (v < lo) lo = v; if (v > hi) hi = v;
      }
      if (hi - lo < 1e-8) return 1e12;
      return varproRSS(x, F, yb).rss;
    };
    const o = nmd(obj, seed, 4, 1200);
    const [m2, ls2, k2, h2] = o.par, s2 = Math.exp(ls2);
    for (let i = 0; i < n; i++) F[i] = k4_F(x[i], m2, s2, k2, h2);
    const vp = varproRSS(x, F, yb);
    if (vp.beta[2] <= 0) continue;
    const r = k4_readings([vp.beta[0], vp.beta[2], m2, s2, k2, h2]);
    if (isFinite(r.a) && r.a >= xr[0] && r.a <= xr[1]) A.push(r.a);
    if (isFinite(r.b) && r.b >= xr[0] && r.b <= xr[1]) Bb.push(r.b);
    if (onProgress && (b % 20 === 0)) onProgress(b / B);
  }
  const q = (v, p) => {
    if (v.length < 100) return [NaN, NaN];   /* an interval on a handful of resamples is not an interval */
    const s = v.slice().sort((a, b) => a - b);
    const pick = (pp) => { const idx = (s.length - 1) * pp; const lo = Math.floor(idx), hi = Math.ceil(idx);
      return s[lo] + (s[hi] - s[lo]) * (idx - lo); };
    return [pick(0.025), pick(0.975)];
  };
  return { a: q(A), b: q(Bb), nA: A.length, nB: Bb.length };
}
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* the equivalence locus: shapes where the two readings coincide. Both branches. */
export function locusK(h, klo = -0.95, khi = 0.9, steps = 120) {
  const gap = (k) => { const r = k4_readings([0, 1, 0, 1, k, h]);
    return (isFinite(r.a) && isFinite(r.b)) ? r.a - r.b : NaN; };
  let prev = null, prevK = null;
  for (let i = 0; i <= steps; i++) {
    const k = klo + (khi - klo) * i / steps, g = gap(k);
    if (isFinite(g)) {
      if (prev !== null && Math.sign(g) !== Math.sign(prev)) {
        let a = prevK, b = k, fa = prev;
        for (let j = 0; j < 60; j++) { const m = 0.5 * (a + b), fm = gap(m);
          if (!isFinite(fm)) break;
          if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m; }
        return 0.5 * (a + b);
      }
      prev = g; prevK = k;
    }
  }
  return NaN;
}
