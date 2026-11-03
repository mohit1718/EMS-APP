// Simulated data engine. Generates 2 years of daily data (plus derived hourly profiles)
// for every line, machine, utility asset, building and electrical source.
// All values are SIMULATED for demonstration. Nothing here comes from live meters.

import { BUILDINGS, LINES, UTILITIES, SOLAR, DGS } from './assets';
import { gauss, hash01, mulberry32 } from './rng';

export const DAYS = 730;
// Last simulated day is "yesterday" relative to the demo build date.
export const END_DATE = '2026-11-01';

export const STATES = ['Running', 'Idle', 'Setup', 'Changeover', 'Planned Stop', 'Unplanned Stop', 'Fault', 'Maintenance', 'Cleaning', 'No Production'] as const;
export type MachineState = (typeof STATES)[number];
export const NS = STATES.length;
/** kW draw in each state as a fraction of running kW (index 9 = per-line standby) */
const STATE_KW = [1, 0.33, 0.4, 0.45, 0.12, 0.25, 0.22, 0.1, 0.35, 0];

const DAY_MS = 86400000;
const endMs = Date.UTC(2026, 10, 1);
export const START_MS = endMs - (DAYS - 1) * DAY_MS;

export const dateStr = (i: number) => new Date(START_MS + i * DAY_MS).toISOString().slice(0, 10);
export const dateOf = (i: number) => new Date(START_MS + i * DAY_MS);
export const idxOf = (s: string) => Math.round((Date.parse(s + 'T00:00:00Z') - START_MS) / DAY_MS);

export const DATES: string[] = Array.from({ length: DAYS }, (_, i) => dateStr(i));
export const DOW = Int8Array.from({ length: DAYS }, (_, i) => dateOf(i).getUTCDay());
export const MONTH = Int8Array.from({ length: DAYS }, (_, i) => dateOf(i).getUTCMonth());
export const YEAR = Int16Array.from({ length: DAYS }, (_, i) => dateOf(i).getUTCFullYear());

const rng = mulberry32(20241102);
const g = () => gauss(rng);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ---------------- climate (Pune-like) ----------------
const MONTH_T = [21, 23, 27, 30, 31, 27.5, 25, 24.5, 25, 25.5, 23.5, 21.5];
const MONTH_RH = [45, 38, 33, 35, 48, 78, 86, 86, 80, 62, 52, 48];
const MONTH_PSH = [5.6, 6.1, 6.3, 6.4, 6.1, 4.1, 3.0, 3.1, 4.0, 5.1, 5.4, 5.4];
export const TEMP = new Float32Array(DAYS);
export const RH = new Float32Array(DAYS);
for (let d = 0; d < DAYS; d++) {
  TEMP[d] = MONTH_T[MONTH[d]] + 1.4 * g();
  RH[d] = clamp(MONTH_RH[MONTH[d]] + 6 * g(), 20, 98);
}

// ---------------- calendar events ----------------
const range = (a: string, b: string) => {
  const out: number[] = [];
  for (let i = idxOf(a); i <= idxOf(b); i++) if (i >= 0 && i < DAYS) out.push(i);
  return out;
};
export const PLANT_SHUTDOWN = new Set<number>([...range('2025-10-20', '2025-10-22')]);
export const HOLIDAYS = new Set<number>([...range('2025-01-26', '2025-01-26'), ...range('2025-03-14', '2025-03-14'), ...range('2025-08-15', '2025-08-15'), ...range('2026-01-26', '2026-01-26'), ...range('2026-03-04', '2026-03-04'), ...range('2026-08-15', '2026-08-15')]);
export const APFC_FAULT = new Set<number>(range('2026-10-08', '2026-10-19'));
export const INVERTER2_OUTAGE = new Set<number>(range('2026-07-14', '2026-07-16'));
export const HUB2_METER_OFFLINE = new Set<number>(range('2026-10-29', '2026-11-01'));

export const EVENTS = [
  { date: '2025-10-20', label: 'Diwali plant shutdown (3 days)', type: 'Planned shutdown' },
  { date: '2026-03-01', label: 'VFD retrofit commissioned on Line 05 oven blowers', type: 'Project' },
  { date: '2026-07-14', label: 'Solar inverter 02 outage (3 days)', type: 'Fault' },
  { date: '2026-09-02', label: 'Line 04 tunnel oven efficiency starts degrading', type: 'Degradation' },
  { date: '2026-09-02', label: 'Compressor 02 specific power begins rising', type: 'Degradation' },
  { date: '2026-10-08', label: 'APFC capacitor bank stage failure – PF drop', type: 'Fault' },
  { date: '2026-10-29', label: 'Hub 02 main meter communication failure', type: 'Data quality' },
];

// ---------------- demand seasonality per category ----------------
function demand(cat: string, m: number, d: number) {
  const y2 = d >= 365 ? 1.05 : 1;
  let s = 1;
  if (cat === 'Beverage') s = [0.82, 0.88, 1.05, 1.18, 1.2, 1.0, 0.85, 0.85, 0.9, 0.95, 0.9, 0.82][m];
  if (cat === 'Cookies & Biscuits') s = [0.95, 0.95, 0.95, 0.92, 0.9, 0.95, 1.0, 1.08, 1.12, 1.15, 1.05, 1.0][m];
  if (cat === 'Spices & Powders') s = [1.0, 0.97, 1.02, 0.95, 0.92, 0.9, 0.92, 0.95, 1.0, 1.1, 1.12, 1.08][m];
  return s * y2;
}

/** Production-energy degradation / improvement scenarios (multiplier on running energy) */
function secFactor(l: number, d: number) {
  let f = 1;
  if (d >= 365) f *= 0.988; // general year-2 operational improvement
  if (l === 3) {
    const start = DAYS - 61; // ramp over last 2 months
    if (d > start) f *= 1 + 0.15 * Math.min(1, (d - start) / 50);
  }
  if (l === 4 && d >= idxOf('2026-03-01')) f *= 0.935; // VFD project
  if (l === 9 && (MONTH[d] === 3 || MONTH[d] === 4)) f *= 1.04;
  return f;
}

// ---------------- line data ----------------
export interface LineSeries {
  kwh: Float32Array;
  prod: Float32Array;
  good: Float32Array;
  rej: Float32Array;
  planned: Float32Array;
  peakKw: Float32Array;
  sched: Float32Array;
  /** hours in each state [d*NS + s] */
  hours: Float32Array;
  /** kWh in each state [d*NS + s] */
  kwhS: Float32Array;
  skuProd: Float32Array;
  skuKwh: Float32Array;
  /** cumulative batches started */
  batches: Float32Array;
}

export const LINE: LineSeries[] = LINES.map((L) => {
  const ns = L.skus.length;
  const s: LineSeries = {
    kwh: new Float32Array(DAYS), prod: new Float32Array(DAYS), good: new Float32Array(DAYS), rej: new Float32Array(DAYS), planned: new Float32Array(DAYS),
    peakKw: new Float32Array(DAYS), sched: new Float32Array(DAYS), hours: new Float32Array(DAYS * NS), kwhS: new Float32Array(DAYS * NS),
    skuProd: new Float32Array(DAYS * ns), skuKwh: new Float32Array(DAYS * ns), batches: new Float32Array(DAYS),
  };
  const runKw = L.cap * L.sec;
  const maintDay = (L.idx * 23 + 40) % 330;
  const liquid = ['L01', 'L02', 'L03', 'L08', 'L14'].includes(L.id);
  for (let d = 0; d < DAYS; d++) {
    const h = new Float32Array(NS);
    const doy = d % 365;
    const dem = demand(L.category, MONTH[d], d) * (1 + 0.06 * g());
    let sched = 0;
    if (PLANT_SHUTDOWN.has(d)) {
      h[4] = 24;
    } else if (doy >= maintDay && doy < maintDay + 3) {
      h[7] = 10;
      h[9] = 14;
    } else if (HOLIDAYS.has(d)) {
      h[9] = 24;
    } else {
      if (DOW[d] === 0) sched = L.idx % 3 === 0 ? 8 : 0;
      else sched = dem < 0.8 ? 16 : 24;
      if (DOW[d] === 6 && dem < 0.9) sched = 16;
      h[9] = 24 - sched;
      if (sched > 0) {
        const shifts = sched / 8;
        h[4] = 0.5 * shifts; // breaks
        h[2] = 0.2 + 0.2 * rng();
        h[3] = (0.4 + rng() * 1.1) * (ns > 2 ? 1.1 : 0.8);
        h[8] = liquid ? 0.9 + 0.6 * rng() : 0.3 + 0.4 * rng();
        h[5] = -Math.log(1 - rng() * 0.98) * 0.7;
        h[6] = rng() < 0.06 ? 1 + 3 * rng() : 0;
        h[1] = 0.6 + 1.6 * rng() + (L.idx === 3 || L.idx === 12 ? 0.6 : 0);
        const used = h[1] + h[2] + h[3] + h[4] + h[5] + h[6] + h[8];
        h[0] = Math.max(0, sched - used);
      }
    }
    // SKU mix
    const mix: number[] = [];
    for (let k = 0; k < ns; k++) mix.push(Math.max(0.05, 1 + 0.45 * Math.sin((2 * Math.PI * d) / (45 + 17 * k) + k * 1.7) + 0.3 * (rng() - 0.5)));
    const ms = mix.reduce((a, b) => a + b, 0);
    const perf = clamp(0.88 + 0.035 * g() + 0.04 * (dem - 1), 0.7, 0.98);
    const sf = secFactor(L.idx, d);
    let prod = 0, kRun = 0;
    for (let k = 0; k < ns; k++) {
      const sh = mix[k] / ms;
      const p = h[0] * sh * L.cap * perf * L.skus[k].rateMul;
      const e = h[0] * sh * runKw * (0.35 + 0.65 * perf) * L.skus[k].secMul * sf * (1 + 0.025 * g());
      s.skuProd[d * ns + k] = p;
      s.skuKwh[d * ns + k] = e;
      prod += p;
      kRun += e;
    }
    s.kwhS[d * NS] = kRun;
    let total = kRun;
    for (let st = 1; st < NS; st++) {
      const f = st === 9 ? L.standby : STATE_KW[st];
      const e = h[st] * runKw * f * (1 + 0.05 * g());
      s.kwhS[d * NS + st] = Math.max(0, e);
      total += Math.max(0, e);
    }
    for (let st = 0; st < NS; st++) s.hours[d * NS + st] = h[st];
    const rr = clamp(0.012 + 0.008 * rng() + (h[6] > 0 ? 0.01 : 0), 0, 0.06);
    s.kwh[d] = total;
    s.prod[d] = prod;
    s.rej[d] = prod * rr;
    s.good[d] = prod - prod * rr;
    s.sched[d] = sched;
    s.planned[d] = sched * L.cap * 0.9;
    s.peakKw[d] = h[0] > 0 ? runKw * (1.12 + 0.12 * rng()) : runKw * Math.max(L.standby, 0.12);
    s.batches[d] = h[0] > 0 ? Math.max(1, Math.round(h[0] / (liquid ? 4 : 3))) : 0;
  }
  return s;
});

/** Shift split for a line-day: energy & production shares for A/B/C */
export function shiftShares(l: number, d: number) {
  const sched = LINE[l].sched[d];
  if (sched >= 24) {
    const ne = 0.31 + 0.02 * (hash01(l, d, 1) - 0.5);
    const np = 0.29 + 0.02 * (hash01(l, d, 2) - 0.5);
    const ae = 0.35 + 0.01 * (hash01(l, d, 3) - 0.5);
    const ap = 0.365 + 0.01 * (hash01(l, d, 4) - 0.5);
    return { e: [ae, 1 - ae - ne, ne], p: [ap, 1 - ap - np, np] };
  }
  if (sched >= 16) return { e: [0.44, 0.43, 0.13], p: [0.505, 0.495, 0] };
  if (sched >= 8) return { e: [0.62, 0.2, 0.18], p: [1, 0, 0] };
  return { e: [0.34, 0.33, 0.33], p: [0, 0, 0] };
}

/** Machine daily energy split, computed on demand (deterministic) */
export function machineDay(l: number, m: number, d: number) {
  const L = LINES[l];
  const M = L.machines[m];
  if (!M.active) return { kwh: 0, run: 0, idle: 0, down: 0 };
  const S = LINE[l];
  const run = S.kwhS[d * NS];
  let non = 0, down = 0;
  for (let st = 1; st < NS; st++) non += S.kwhS[d * NS + st];
  down = S.kwhS[d * NS + 5] + S.kwhS[d * NS + 6];
  const n = 1 + 0.06 * (hash01(l, m, d) - 0.5);
  const deg = l === 3 && L.machines[m].name === 'Tunnel oven' ? 1 : 1;
  const r = run * M.wRun * n * deg;
  const i = non * M.wIdle * n;
  return { kwh: r + i, run: r, idle: i, down: down * M.wIdle * n };
}

// ---------------- activity index used by utilities ----------------
export const ACT = new Float32Array(DAYS);
export const PROD_KWH = new Float32Array(DAYS);
export const PROD_TEQ = new Float32Array(DAYS);
for (let d = 0; d < DAYS; d++) {
  let run = 0, e = 0, t = 0;
  LINES.forEach((L, l) => {
    run += LINE[l].hours[d * NS];
    e += LINE[l].kwh[d];
    t += LINE[l].good[d] * L.teq;
  });
  ACT[d] = run / (LINES.length * 20);
  PROD_KWH[d] = e;
  PROD_TEQ[d] = t;
}

// ---------------- utilities ----------------
export interface UtilSeries {
  kwh: Float32Array[]; // per asset
  out: Float32Array[]; // per asset output (system unit)
  runH: Float32Array[];
  loadH: Float32Array[];
  unloadKwh: Float32Array[];
  nonProdKwh: Float32Array[];
  sysOut: Float32Array;
  extra: Record<string, Float32Array>;
}
const mkU = (n: number): UtilSeries => ({
  kwh: Array.from({ length: n }, () => new Float32Array(DAYS)),
  out: Array.from({ length: n }, () => new Float32Array(DAYS)),
  runH: Array.from({ length: n }, () => new Float32Array(DAYS)),
  loadH: Array.from({ length: n }, () => new Float32Array(DAYS)),
  unloadKwh: Array.from({ length: n }, () => new Float32Array(DAYS)),
  nonProdKwh: Array.from({ length: n }, () => new Float32Array(DAYS)),
  sysOut: new Float32Array(DAYS),
  extra: {},
});

export const UTIL: Record<string, UtilSeries> = {};
UTILITIES.forEach((u) => (UTIL[u.key] = mkU(u.assets.length)));

const nonProdFrac = (d: number) => {
  let s = 0;
  LINES.forEach((_, l) => (s += LINE[l].sched[d]));
  return 1 - s / (LINES.length * 24);
};
export const NONPROD_FRAC = Float32Array.from({ length: DAYS }, (_, d) => nonProdFrac(d));

for (let d = 0; d < DAYS; d++) {
  const A = ACT[d];
  const T = TEMP[d];
  const np = NONPROD_FRAC[d];
  const nz = () => 1 + 0.03 * g();
  // ---- Compressed air ----
  {
    const U = UTIL.AIR;
    const leakBase = 380; // Nm³/h leakage
    const lpDemand = (A * 2000 + leakBase) * 24 * nz();
    const hp = (LINE[2].hours[d * NS] * 1050 + 20) * nz();
    const split = [0.41, 0.33, 0.26];
    const spcBase = [0.118, 0.118, 0.108];
    const rampStart = DAYS - 61;
    const c2 = d > rampStart ? 1 + 0.2 * Math.min(1, (d - rampStart) / 45) : 1;
    let tot = 0;
    for (let c = 0; c < 3; c++) {
      const out = lpDemand * split[c];
      const spc = spcBase[c] * (c === 1 ? c2 : 1) * (1 + 0.004 * (T - 25)) * nz();
      const loadH = clamp(out / 1250, 0, 24);
      const runH = A < 0.05 ? clamp(loadH * 1.6, 0, 24) : 24;
      const unloadH = Math.max(0, runH - loadH);
      const unloadK = unloadH * (c === 2 ? 0.1 : 0.25) * 160;
      U.out[c][d] = out;
      U.kwh[c][d] = out * spc + unloadK;
      U.loadH[c][d] = loadH;
      U.runH[c][d] = runH;
      U.unloadKwh[c][d] = unloadK;
      U.nonProdKwh[c][d] = (out * spc + unloadK) * np * 0.75;
      tot += out;
    }
    U.out[3][d] = hp;
    U.kwh[3][d] = hp * 0.24 * nz();
    U.runH[3][d] = LINE[2].hours[d * NS] + 0.5;
    U.loadH[3][d] = LINE[2].hours[d * NS];
    U.nonProdKwh[3][d] = U.kwh[3][d] * 0.05;
    U.kwh[4][d] = 15 * 0.8 * 24 * nz();
    U.kwh[5][d] = 0;
    U.kwh[6][d] = 0;
    U.kwh[7][d] = 11 * 0.7 * 24 * (0.6 + 0.4 * A) * nz();
    for (const a of [4, 7]) { U.runH[a][d] = 24; U.nonProdKwh[a][d] = U.kwh[a][d] * np; }
    U.sysOut[d] = tot + hp;
    U.extra.pressure = U.extra.pressure || new Float32Array(DAYS);
    U.extra.pressure[d] = 6.9 + 0.12 * g();
    U.extra.leakPct = U.extra.leakPct || new Float32Array(DAYS);
    U.extra.leakPct[d] = (leakBase * 24) / lpDemand * 100;
    U.extra.demand = U.extra.demand || new Float32Array(DAYS);
    U.extra.demand[d] = (tot - leakBase * 24) + hp;
  }
  // ---- Chiller ----
  {
    const U = UTIL.CHL;
    const tr = Math.max(80, A * 330 + (T - 18) * 11 + 50) * nz();
    const trh = tr * 24;
    const split = [0.38, 0.3, 0.32];
    const kwtr = [0.66, 0.8, 0.69];
    for (let c = 0; c < 3; c++) {
      const o = trh * split[c];
      const k = kwtr[c] * (1 + 0.006 * (T - 25)) * nz();
      U.out[c][d] = o;
      U.kwh[c][d] = o * k;
      U.runH[c][d] = clamp(o / (350 * 0.75), 0, 24);
      U.nonProdKwh[c][d] = U.kwh[c][d] * np * 0.5;
    }
    const aux = [80 * 0.7 * 24 * A, 55 * 0.6 * 24 * A, 15 * 0.8 * 24, 7.5 * 0.7 * 24, 11 * 0.8 * 24, 75 * 0.85 * 24];
    aux.forEach((v, i) => { U.kwh[3 + i][d] = v * nz(); U.runH[3 + i][d] = 24; U.nonProdKwh[3 + i][d] = U.kwh[3 + i][d] * np * 0.6; });
    U.sysOut[d] = trh;
    U.extra.chws = U.extra.chws || new Float32Array(DAYS);
    U.extra.chwr = U.extra.chwr || new Float32Array(DAYS);
    U.extra.flow = U.extra.flow || new Float32Array(DAYS);
    U.extra.chws[d] = 7 + 0.2 * g();
    U.extra.chwr[d] = 12 + 0.4 * g() + 0.05 * (T - 25);
    U.extra.flow[d] = tr * 0.605;
    U.extra.tr = U.extra.tr || new Float32Array(DAYS);
    U.extra.tr[d] = tr;
  }
  // ---- Cooling tower ----
  {
    const U = UTIL.CT;
    const rej = UTIL.CHL.sysOut[d] * 1.25;
    const fanF = clamp(0.55 + 0.4 * (T - 20) / 12, 0.4, 1);
    for (let c = 0; c < 3; c++) {
      U.kwh[c][d] = 30 * 0.88 * 24 * fanF * (c === 2 ? 1.06 : 1) * nz();
      U.runH[c][d] = 24 * clamp(fanF + 0.1, 0, 1);
      U.out[c][d] = rej / 3;
      U.kwh[3 + c][d] = 45 * 0.88 * 24 * nz();
      U.runH[3 + c][d] = c === 2 ? 12 : 24;
      if (c === 2) U.kwh[5][d] *= 0.5;
    }
    for (let a = 0; a < 6; a++) U.nonProdKwh[a][d] = U.kwh[a][d] * np * 0.5;
    U.sysOut[d] = rej;
    U.extra.approach = U.extra.approach || new Float32Array(DAYS);
    U.extra.approach[d] = 3.6 + 0.04 * (RH[d] - 50) + 0.3 * g();
    U.extra.inlet = U.extra.inlet || new Float32Array(DAYS);
    U.extra.inlet[d] = 35 + 0.4 * (T - 25) + 0.3 * g();
  }
  // ---- Boiler ----
  {
    const U = UTIL.BLR;
    const steam = (16 + 68 * A) * nz();
    const b1 = steam * 0.6, b2 = steam * 0.4;
    U.out[0][d] = b1;
    U.out[1][d] = b2;
    U.kwh[0][d] = b1 * 4.2 * nz() + 20;
    U.kwh[1][d] = b2 * 4.6 * nz() + 15;
    U.kwh[2][d] = steam * 2.6 * nz();
    U.kwh[3][d] = 7.5 * 0.6 * 24 * nz();
    U.kwh[4][d] = 0;
    U.kwh[5][d] = 7.5 * 0.7 * 20 * nz();
    U.kwh[6][d] = 4 * nz();
    U.runH[0][d] = clamp(b1 / 4.5, 0, 24);
    U.runH[1][d] = clamp(b2 / 3, 0, 24);
    for (let a = 0; a < 7; a++) U.nonProdKwh[a][d] = U.kwh[a][d] * np * 0.4;
    U.sysOut[d] = steam;
    const fuel1 = b1 * 74.5 * nz();
    const fuel2 = b2 * 81 * nz();
    U.extra.fuel1 = U.extra.fuel1 || new Float32Array(DAYS);
    U.extra.fuel2 = U.extra.fuel2 || new Float32Array(DAYS);
    U.extra.fuel1[d] = fuel1;
    U.extra.fuel2[d] = fuel2;
    U.extra.condensate = U.extra.condensate || new Float32Array(DAYS);
    U.extra.condensate[d] = clamp(63 + 3 * g() - (d > DAYS - 40 ? 4 : 0), 45, 80);
    U.extra.pressure = U.extra.pressure || new Float32Array(DAYS);
    U.extra.pressure[d] = 10.4 + 0.15 * g();
  }
  // ---- HVAC ----
  {
    const U = UTIL.HVAC;
    const occ = DOW[d] === 0 || HOLIDAYS.has(d) || PLANT_SHUTDOWN.has(d) ? 0.45 : 1;
    const base = 3400 * (0.5 + 0.5 * Math.min(1.1, A / 0.85)) * (1 + 0.04 * (T - 24)) * (RH[d] > 75 ? 1.06 : 1) * occ;
    UTILITIES[4].assets.forEach((a, i) => {
      U.kwh[i][d] = base * a.share * nz() * (i === 8 ? (occ < 1 ? 0.4 : 1) : 1);
      U.runH[i][d] = occ < 1 ? 12 : 22;
      U.nonProdKwh[i][d] = U.kwh[i][d] * np * 0.7;
    });
    U.sysOut[d] = 9000 * (occ < 1 ? 12 : 22);
    U.extra.temp = U.extra.temp || new Float32Array(DAYS);
    U.extra.rh = U.extra.rh || new Float32Array(DAYS);
    U.extra.temp[d] = 24 + 0.6 * g() + (T > 30 ? 0.6 : 0);
    U.extra.rh[d] = clamp(52 + 0.15 * (RH[d] - 50) + 3 * g(), 35, 70);
  }
  // ---- Water ----
  {
    const U = UTIL.WTP;
    const water = (300 + 760 * A) * nz();
    const shares = UTILITIES[5].assets.map((a) => a.share);
    const sysK = water * 1.55 * nz();
    shares.forEach((s, i) => { U.kwh[i][d] = sysK * s * nz(); U.runH[i][d] = i === 2 ? clamp(water * 0.45 / 30, 0, 24) : 20; U.nonProdKwh[i][d] = U.kwh[i][d] * np * 0.4; });
    U.out[2][d] = water * 0.45;
    U.out[0][d] = water;
    U.sysOut[d] = water;
    U.extra.roFeed = U.extra.roFeed || new Float32Array(DAYS);
    U.extra.roFeed[d] = water * 0.6;
    U.extra.roPerm = U.extra.roPerm || new Float32Array(DAYS);
    U.extra.roPerm[d] = water * 0.45;
  }
  // ---- ETP ----
  {
    const U = UTIL.ETP;
    const eff = UTIL.WTP.sysOut[d] * 0.72 * nz();
    const sysK = (eff * 1.35 + 55 * 0.75 * 24) * nz();
    UTILITIES[6].assets.forEach((a, i) => { U.kwh[i][d] = sysK * a.share * nz(); U.runH[i][d] = i === 2 ? 24 : 16; U.nonProdKwh[i][d] = U.kwh[i][d] * np * 0.8; });
    U.out[0][d] = eff;
    U.sysOut[d] = eff;
  }
  // ---- Other ----
  {
    const U = UTIL.OTH;
    const sysK = 2700 * (0.4 + 0.6 * A) * nz();
    UTILITIES[7].assets.forEach((a, i) => { U.kwh[i][d] = sysK * a.share * nz(); U.runH[i][d] = 24 * (0.4 + 0.6 * A); U.nonProdKwh[i][d] = U.kwh[i][d] * np * 0.6; });
    U.sysOut[d] = 24 * (0.4 + 0.6 * A);
  }
}

export const UTIL_KWH: Record<string, Float32Array> = {};
UTILITIES.forEach((u) => {
  const a = new Float32Array(DAYS);
  for (let d = 0; d < DAYS; d++) for (const s of UTIL[u.key].kwh) a[d] += s[d];
  UTIL_KWH[u.key] = a;
});
export const UTIL_TOTAL = Float32Array.from({ length: DAYS }, (_, d) => UTILITIES.reduce((s, u) => s + UTIL_KWH[u.key][d], 0));

// ---------------- buildings ----------------
export const BLD: Record<string, { kwh: Float32Array; act: Float32Array; tonnes: Float32Array; hours: Float32Array }> = {};
BUILDINGS.forEach((b) => {
  const s = { kwh: new Float32Array(DAYS), act: new Float32Array(DAYS), tonnes: new Float32Array(DAYS), hours: new Float32Array(DAYS) };
  for (let d = 0; d < DAYS; d++) {
    const off = DOW[d] === 0 || HOLIDAYS.has(d) || PLANT_SHUTDOWN.has(d);
    const T = TEMP[d];
    let act: number, kwh: number;
    if (b.kind === 'Admin') {
      act = off ? 25 + 10 * rng() : b.baseActivity * (0.9 + 0.1 * rng()) * (DOW[d] === 6 ? 0.55 : 1);
      kwh = b.baseKwh * (off ? 0.42 : DOW[d] === 6 ? 0.75 : 1) * (1 + 0.035 * (T - 24)) * (1 + 0.03 * g());
      s.hours[d] = off ? 6 : 12;
    } else {
      const fest = [0.95, 0.92, 1.0, 1.05, 1.05, 0.92, 0.9, 1.0, 1.08, 1.15, 1.05, 1.0][MONTH[d]];
      act = off ? b.baseActivity * 0.15 : b.baseActivity * fest * (d >= 365 ? 1.05 : 1) * (0.92 + 0.16 * rng());
      kwh = b.baseKwh * (0.5 + 0.5 * act / b.baseActivity) * b.eff * (1 + 0.02 * (T - 24)) * (1 + 0.03 * g());
      s.hours[d] = off ? 8 : 20;
    }
    s.act[d] = act;
    s.kwh[d] = kwh;
    s.tonnes[d] = b.kind === 'Admin' ? 0 : act * 0.68;
  }
  BLD[b.id] = s;
});
export const BLD_TOTAL = Float32Array.from({ length: DAYS }, (_, d) => BUILDINGS.reduce((s, b) => s + BLD[b.id].kwh[d], 0));

// ---------------- electrical ----------------
export const CONS = new Float32Array(DAYS); // accounted (department-level metered) energy
export const LOSSPCT = new Float32Array(DAYS);
export const INCOMING = new Float32Array(DAYS);
export const SOLAR_KWH = new Float32Array(DAYS);
export const SOLAR_INV = [new Float32Array(DAYS), new Float32Array(DAYS), new Float32Array(DAYS)];
export const DG_KWH = new Float32Array(DAYS);
export const DG_UNIT = [new Float32Array(DAYS), new Float32Array(DAYS), new Float32Array(DAYS)];
export const DG_FUEL = new Float32Array(DAYS);
export const DG_HOURS = new Float32Array(DAYS);
export const EXPORT = new Float32Array(DAYS);
export const GRID = new Float32Array(DAYS);
export const PEAK_KW = new Float32Array(DAYS);
export const PEAK_KVA = new Float32Array(DAYS);
export const PF = new Float32Array(DAYS);
export const KVARH = new Float32Array(DAYS);
export const TR_KWH: Record<string, Float32Array> = {};
export const TR_PEAK_KVA: Record<string, Float32Array> = {};

const trOf: Record<string, string[]> = { 'TR-01': [], 'TR-02': [], 'TR-03': [], 'TR-04': [] };
for (let d = 0; d < DAYS; d++) {
  CONS[d] = PROD_KWH[d] + UTIL_TOTAL[d] + BLD_TOTAL[d];
  const lp = 0.026 + 0.003 * g() + (d > DAYS - 16 ? 0.011 : 0);
  LOSSPCT[d] = lp;
  INCOMING[d] = CONS[d] / (1 - lp);
  const cloud = MONTH[d] >= 5 && MONTH[d] <= 8 ? clamp(0.75 + 0.35 * g(), 0.2, 1.1) : clamp(0.97 + 0.08 * g(), 0.6, 1.05);
  const sol = SOLAR.capacityKwp * MONTH_PSH[MONTH[d]] * 0.79 * cloud * (d >= 365 ? 0.993 : 1);
  for (let i = 0; i < 3; i++) SOLAR_INV[i][d] = i === 1 && INVERTER2_OUTAGE.has(d) ? 0 : (sol / 3) * (1 + 0.015 * g());
  SOLAR_KWH[d] = SOLAR_INV[0][d] + SOLAR_INV[1][d] + SOLAR_INV[2][d];
  const outage = rng() < 0.035 || d === DAYS - 6;
  if (outage) {
    const hrs = 1 + 4 * rng();
    DG_HOURS[d] = hrs;
    DG_KWH[d] = (INCOMING[d] / 24) * hrs * 0.82;
    const sp = [0.4, 0.4, 0.2];
    for (let i = 0; i < 3; i++) DG_UNIT[i][d] = DG_KWH[d] * sp[i];
    DG_FUEL[d] = DG_KWH[d] / (3.3 + 0.15 * rng());
  }
  EXPORT[d] = PLANT_SHUTDOWN.has(d) ? SOLAR_KWH[d] * 0.35 : 0;
  GRID[d] = INCOMING[d] - SOLAR_KWH[d] - DG_KWH[d] + EXPORT[d];
  const summer = MONTH[d] >= 2 && MONTH[d] <= 4 ? 0.05 : 0;
  PEAK_KW[d] = (INCOMING[d] / 24) * (1.2 + summer + 0.05 * g());
  PF[d] = APFC_FAULT.has(d) ? 0.918 + 0.008 * g() : clamp(0.972 + 0.006 * g(), 0.94, 0.995);
  PEAK_KVA[d] = PEAK_KW[d] / (PF[d] - 0.01);
  KVARH[d] = INCOMING[d] * Math.tan(Math.acos(PF[d]));
}
// transformer allocation
['TR-01', 'TR-02', 'TR-03', 'TR-04'].forEach((t) => { TR_KWH[t] = new Float32Array(DAYS); TR_PEAK_KVA[t] = new Float32Array(DAYS); });
for (let d = 0; d < DAYS; d++) {
  const add = (t: string, v: number) => (TR_KWH[t][d] += v);
  LINES.forEach((L, l) => add(L.transformer, LINE[l].kwh[d]));
  UTILITIES.forEach((u) => add(u.transformer, UTIL_KWH[u.key][d]));
  BUILDINGS.forEach((b) => add(b.transformer, BLD[b.id].kwh[d]));
  const scale = INCOMING[d] / CONS[d];
  for (const t of Object.keys(TR_KWH)) {
    TR_KWH[t][d] *= 1 + (scale - 1) * 0.55; // transformer meter sees part of loss
    TR_PEAK_KVA[t][d] = ((TR_KWH[t][d] / 24) * (1.22 + 0.05 * g() + (t === 'TR-03' ? 0.08 : 0))) / PF[d];
  }
}
void trOf;
void DGS;

// ---------------- hourly shapes ----------------
/** 24 multipliers (mean 1) for a production schedule */
function prodShape(sched: number): number[] {
  const out = new Array(24).fill(0);
  for (let h = 0; h < 24; h++) {
    let on = 0;
    if (sched >= 24) on = 1;
    else if (sched >= 16) on = h >= 6 && h < 22 ? 1 : 0;
    else if (sched >= 8) on = h >= 6 && h < 14 ? 1 : 0;
    let v = on ? 1 : 0.12;
    if (on && (h === 6 || h === 14 || h === 22)) v *= 0.82;
    if (on && (h === 12 || h === 20 || h === 3)) v *= 0.9;
    out[h] = v;
  }
  const m = out.reduce((a, b) => a + b, 0) / 24;
  return out.map((v) => v / m);
}
const officeShape = (() => {
  const o = Array.from({ length: 24 }, (_, h) => (h >= 8 && h < 19 ? 1.6 : 0.5));
  const m = o.reduce((a, b) => a + b, 0) / 24;
  return o.map((v) => v / m);
})();
const utilShape = Array.from({ length: 24 }, (_, h) => 1 + 0.12 * Math.sin(((h - 9) / 24) * 2 * Math.PI));
export const solarShape = (() => {
  const o = Array.from({ length: 24 }, (_, h) => (h >= 6 && h <= 18 ? Math.sin(((h - 6 + 0.5) / 13) * Math.PI) : 0));
  const s = o.reduce((a, b) => a + b, 0);
  return o.map((v) => (v / s) * 24);
})();

/** Plant incoming kWh per hour for day d (24 values) */
export function plantHourly(d: number): number[] {
  const out = new Array(24).fill(0);
  LINES.forEach((_, l) => {
    const sh = prodShape(LINE[l].sched[d]);
    const v = LINE[l].kwh[d] / 24;
    for (let h = 0; h < 24; h++) out[h] += v * sh[h];
  });
  for (let h = 0; h < 24; h++) {
    out[h] += (UTIL_TOTAL[d] / 24) * utilShape[h] + (BLD_TOTAL[d] / 24) * officeShape[h];
    out[h] *= (INCOMING[d] / CONS[d]) * (1 + 0.025 * (hash01(d, h, 7) - 0.5));
  }
  return out;
}
export function lineHourly(l: number, d: number): number[] {
  const sh = prodShape(LINE[l].sched[d]);
  return sh.map((v, h) => (LINE[l].kwh[d] / 24) * v * (1 + 0.08 * (hash01(l, d, h) - 0.5)));
}
export function gridHourly(d: number): number[] {
  const p = plantHourly(d);
  return p.map((v, h) => Math.max(0, v - (SOLAR_KWH[d] / 24) * solarShape[h] - (DG_KWH[d] > 0 && h >= 14 && h < 14 + DG_HOURS[d] ? DG_KWH[d] / DG_HOURS[d] : 0)));
}

// pre-compute grid ToD split (hours 0..23 -> kWh) for cost engine
export const GRID_HOURLY = new Float32Array(DAYS * 24);
for (let d = 0; d < DAYS; d++) {
  const gh = gridHourly(d);
  const s = gh.reduce((a, b) => a + b, 0) || 1;
  for (let h = 0; h < 24; h++) GRID_HOURLY[d * 24 + h] = (gh[h] / s) * GRID[d];
}

export const SIMULATION_INFO = {
  generatedFrom: DATES[0],
  generatedTo: DATES[DAYS - 1],
  seed: 20241102,
  granularity: 'Daily records with derived hourly profiles; machine and shift splits computed on demand',
};
