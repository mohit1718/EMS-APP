// Calculation engine: period aggregation, comparisons, cost, carbon, baselines.
import { BUILDINGS, LINES, PLANT, UTILITIES, UtilityKey } from './assets';
import {
  ACT, BLD, BLD_TOTAL, CONS, DAYS, DATES, DG_FUEL, DG_KWH, EXPORT, GRID, GRID_HOURLY, idxOf, INCOMING, KVARH, LINE, MONTH, NS, PEAK_KVA, PEAK_KW, PF,
  PROD_KWH, PROD_TEQ, shiftShares, SOLAR_KWH, UTIL, UTIL_KWH, UTIL_TOTAL, YEAR,
} from './sim';

// ---------------- configuration ----------------
export interface TariffZone { name: string; from: number; to: number; rate: number }
export interface Config {
  tariff: {
    zones: TariffZone[];
    demandCharge: number; // ₹/kVA/month
    duty: number; // % on energy charges
    otherPerKwh: number; // ₹/kWh (FAC, wheeling, etc.)
    pfThreshold: number;
    pfPenaltyPct: number; // % of energy charge per 0.01 below threshold
    dieselPrice: number; // ₹/L
    dgOm: number; // ₹/kWh
    solarRate: number; // ₹/kWh (PPA / levelised)
    gasPrice: number; // ₹/SCM
  };
  ef: { grid: number; diesel: number; gas: number; solar: number }; // tCO2/MWh, kg/L, kg/SCM, tCO2/MWh
  baseline: { from: string; to: string };
  targets: {
    lineSecPct: number; // target = baseline × (1 - pct)
    lineSec: Record<string, number>; // explicit override per line
    utilSecPct: number;
    plantMonthlyKwh: number;
    annualBudgetRs: number;
    carbonReductionPct: number;
    savingsTargetRs: number;
    contractDemandKva: number;
    pfTarget: number;
    idleShareMax: number;
  };
}

export const DEFAULT_CONFIG: Config = {
  tariff: {
    zones: [
      { name: 'Off-peak', from: 22, to: 6, rate: 7.1 },
      { name: 'Normal', from: 6, to: 9, rate: 8.6 },
      { name: 'Morning peak', from: 9, to: 12, rate: 9.4 },
      { name: 'Normal', from: 12, to: 18, rate: 8.6 },
      { name: 'Evening peak', from: 18, to: 22, rate: 9.7 },
    ],
    demandCharge: 600,
    duty: 7.5,
    otherPerKwh: 0.35,
    pfThreshold: 0.95,
    pfPenaltyPct: 1,
    dieselPrice: 92,
    dgOm: 1.6,
    solarRate: 3.4,
    gasPrice: 48,
  },
  ef: { grid: 0.716, diesel: 2.68, gas: 2.02, solar: 0 },
  baseline: { from: DATES[0], to: '2025-10-31' },
  targets: {
    lineSecPct: 5,
    lineSec: {},
    utilSecPct: 5,
    plantMonthlyKwh: 2450000,
    annualBudgetRs: 300000000,
    carbonReductionPct: 8,
    savingsTargetRs: 15000000,
    contractDemandKva: PLANT.contractDemandKva,
    pfTarget: 0.95,
    idleShareMax: 15,
  },
};

// ---------------- helpers ----------------
export const clampIdx = (i: number) => Math.max(0, Math.min(DAYS - 1, i));
export function sum(a: ArrayLike<number>, i0: number, i1: number) {
  let s = 0;
  for (let i = i0; i <= i1; i++) s += a[i];
  return s;
}
export function max(a: ArrayLike<number>, i0: number, i1: number) {
  let s = -Infinity;
  for (let i = i0; i <= i1; i++) if (a[i] > s) s = a[i];
  return s;
}
export function avg(a: ArrayLike<number>, i0: number, i1: number) {
  return sum(a, i0, i1) / (i1 - i0 + 1);
}
/** Percentage change; returns null when previous value is missing or zero */
export function pct(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || !isFinite(prev) || Math.abs(prev) < 1e-9) return null;
  return ((cur - prev) / prev) * 100;
}
export const safeDiv = (a: number, b: number) => (b ? a / b : 0);

export type CompareMode = 'prev' | 'yoy' | 'baseline' | 'none';
export type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'year';
export interface Range { i0: number; i1: number }

export function compareRange(r: Range, mode: CompareMode): Range | null {
  const n = r.i1 - r.i0 + 1;
  if (mode === 'prev') {
    const i1 = r.i0 - 1, i0 = r.i0 - n;
    if (i1 < 0) return null;
    return { i0: Math.max(0, i0), i1 };
  }
  if (mode === 'yoy') {
    const i0 = r.i0 - 364, i1 = r.i1 - 364;
    if (i1 < 0) return null;
    return { i0: Math.max(0, i0), i1 };
  }
  if (mode === 'baseline') return null;
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(i: number) {
  const s = DATES[i];
  return `${s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]} ${s.slice(2, 4)}`;
}
export function rangeLabel(r: Range | null) {
  if (!r) return 'n/a';
  return r.i0 === r.i1 ? fmtDate(r.i0) : `${fmtDate(r.i0)} – ${fmtDate(r.i1)}`;
}

export interface Bucket { label: string; i0: number; i1: number }
export function buckets(r: Range, g: Granularity): Bucket[] {
  const out: Bucket[] = [];
  let cur: Bucket | null = null;
  for (let i = r.i0; i <= r.i1; i++) {
    const s = DATES[i];
    const y = +s.slice(0, 4), m = +s.slice(5, 7) - 1;
    let key: string;
    if (g === 'day') key = `${s.slice(8, 10)} ${MONTHS[m]}`;
    else if (g === 'week') {
      // ISO-like weeks starting Monday
      const dt = new Date(s + 'T00:00:00Z');
      const dow = (dt.getUTCDay() + 6) % 7;
      const mon = new Date(dt.getTime() - dow * 86400000).toISOString().slice(0, 10);
      key = `Wk ${mon.slice(8, 10)} ${MONTHS[+mon.slice(5, 7) - 1]}${mon.slice(2, 4) !== s.slice(2, 4) || true ? " '" + mon.slice(2, 4) : ''}`;
    } else if (g === 'month') key = `${MONTHS[m]} '${String(y).slice(2)}`;
    else if (g === 'quarter') key = `Q${Math.floor(m / 3) + 1} '${String(y).slice(2)}`;
    else key = String(y);
    if (!cur || cur.label !== key) {
      cur = { label: key, i0: i, i1: i };
      out.push(cur);
    } else cur.i1 = i;
  }
  return out;
}
export function autoGran(r: Range): Granularity {
  const n = r.i1 - r.i0 + 1;
  if (n <= 45) return 'day';
  if (n <= 200) return 'week';
  if (n <= 800) return 'month';
  return 'quarter';
}

// ---------------- line metrics ----------------
export interface LineMetrics {
  kwh: number; prod: number; good: number; rej: number; planned: number; peakKw: number; batches: number;
  hours: number[]; kwhS: number[]; sec: number; nonProdKwh: number; idleKwh: number; runH: number; idleH: number; availableH: number;
  skuProd: number[]; skuKwh: number[]; days: number;
}
export function lineMetrics(l: number, r: Range, shift: number | null = null): LineMetrics {
  const S = LINE[l];
  const ns = LINES[l].skus.length;
  const m: LineMetrics = { kwh: 0, prod: 0, good: 0, rej: 0, planned: 0, peakKw: 0, batches: 0, hours: new Array(NS).fill(0), kwhS: new Array(NS).fill(0), sec: 0, nonProdKwh: 0, idleKwh: 0, runH: 0, idleH: 0, availableH: 0, skuProd: new Array(ns).fill(0), skuKwh: new Array(ns).fill(0), days: r.i1 - r.i0 + 1 };
  for (let d = r.i0; d <= r.i1; d++) {
    let fe = 1, fp = 1;
    if (shift != null) {
      const sh = shiftShares(l, d);
      fe = sh.e[shift];
      fp = sh.p[shift];
    }
    m.kwh += S.kwh[d] * fe;
    m.prod += S.prod[d] * fp;
    m.good += S.good[d] * fp;
    m.rej += S.rej[d] * fp;
    m.planned += S.planned[d] * fp;
    m.batches += S.batches[d] * fp;
    if (S.peakKw[d] > m.peakKw) m.peakKw = S.peakKw[d];
    for (let s = 0; s < NS; s++) {
      m.hours[s] += S.hours[d * NS + s] * (shift != null ? (s === 0 ? fp : fe) : 1);
      m.kwhS[s] += S.kwhS[d * NS + s] * (s === 0 ? fp || fe * 0 : fe);
    }
    for (let k = 0; k < ns; k++) {
      m.skuProd[k] += S.skuProd[d * ns + k] * fp;
      m.skuKwh[k] += S.skuKwh[d * ns + k] * fp;
    }
  }
  if (shift != null) {
    // keep running energy consistent with total
    const others = m.kwhS.slice(1).reduce((a, b) => a + b, 0);
    m.kwhS[0] = Math.max(0, m.kwh - others);
    m.hours = m.hours.map((h) => h); // already scaled
  }
  m.nonProdKwh = m.kwh - m.kwhS[0];
  m.idleKwh = m.kwhS[1];
  m.runH = m.hours[0];
  m.idleH = m.hours[1];
  m.availableH = m.hours.reduce((a, b) => a + b, 0) - m.hours[9] - m.hours[4] - m.hours[7];
  m.sec = safeDiv(m.kwh, m.good);
  return m;
}

/** SEC for each day (for trends) */
export function lineDailySec(l: number, d: number) {
  return safeDiv(LINE[l].kwh[d], LINE[l].good[d]);
}

// ---------------- baselines & targets ----------------
export function baselineRange(cfg: Config): Range {
  return { i0: Math.max(0, idxOf(cfg.baseline.from)), i1: Math.min(DAYS - 1, idxOf(cfg.baseline.to)) };
}
export function lineBaselineSec(l: number, cfg: Config) {
  const b = baselineRange(cfg);
  return safeDiv(sum(LINE[l].kwh, b.i0, b.i1), sum(LINE[l].good, b.i0, b.i1));
}
export function lineTargetSec(l: number, cfg: Config) {
  const o = cfg.targets.lineSec[LINES[l].id];
  if (o) return o;
  return lineBaselineSec(l, cfg) * (1 - cfg.targets.lineSecPct / 100);
}

/** Production-normalised plant baseline: kWh = a + b × t-eq (least squares on baseline window, production days only) */
export function plantRegression(cfg: Config) {
  const b = baselineRange(cfg);
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let d = b.i0; d <= b.i1; d++) {
    const x = PROD_TEQ[d], y = CONS[d];
    n++; sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const icpt = (sy - slope * sx) / n;
  let ssr = 0, sst = 0;
  const my = sy / n;
  for (let d = b.i0; d <= b.i1; d++) {
    const p = icpt + slope * PROD_TEQ[d];
    ssr += (CONS[d] - p) ** 2;
    sst += (CONS[d] - my) ** 2;
  }
  return { a: icpt, b: slope, r2: 1 - ssr / sst };
}
export function expectedPlantKwh(r: Range, cfg: Config) {
  const reg = plantRegression(cfg);
  let s = 0;
  for (let d = r.i0; d <= r.i1; d++) s += reg.a + reg.b * PROD_TEQ[d];
  return s;
}

export function utilSecBaseline(key: UtilityKey, cfg: Config) {
  const b = baselineRange(cfg);
  return utilSec(key, b);
}
export function utilSec(key: UtilityKey, r: Range) {
  const out = sum(UTIL[key].sysOut, r.i0, r.i1);
  const k = sum(UTIL_KWH[key], r.i0, r.i1);
  if (key === 'BLR') return safeDiv(k, out);
  return safeDiv(k, out);
}

// ---------------- cost ----------------
function zoneRate(cfg: Config, h: number) {
  for (const z of cfg.tariff.zones) {
    if (z.from < z.to ? h >= z.from && h < z.to : h >= z.from || h < z.to) return z.rate;
  }
  return cfg.tariff.zones[0]?.rate ?? 8;
}

export interface CostBreak {
  energy: number; tod: Record<string, number>; demand: number; duty: number; other: number; pf: number; dg: number; solar: number; fuel: number;
  electricity: number; total: number; perKwh: number; mdKva: number;
}

export function costPeriod(r: Range, cfg: Config): CostBreak {
  const t = cfg.tariff;
  const rates = Array.from({ length: 24 }, (_, h) => zoneRate(cfg, h));
  const zoneName = Array.from({ length: 24 }, (_, h) => {
    const z = t.zones.find((z) => (z.from < z.to ? h >= z.from && h < z.to : h >= z.from || h < z.to));
    return z?.name ?? 'Normal';
  });
  let energy = 0;
  const tod: Record<string, number> = {};
  for (let d = r.i0; d <= r.i1; d++) {
    for (let h = 0; h < 24; h++) {
      const v = GRID_HOURLY[d * 24 + h] * rates[h];
      energy += v;
      tod[zoneName[h]] = (tod[zoneName[h]] || 0) + GRID_HOURLY[d * 24 + h];
    }
  }
  // monthly demand & PF charges, prorated for partial months
  let demand = 0, pfAdj = 0, mdKva = 0;
  const months = new Map<string, { i0: number; i1: number; inRange: number }>();
  for (let d = 0; d < DAYS; d++) {
    const k = DATES[d].slice(0, 7);
    const m = months.get(k) || { i0: d, i1: d, inRange: 0 };
    m.i1 = d;
    if (d >= r.i0 && d <= r.i1) m.inRange++;
    months.set(k, m);
  }
  months.forEach((m) => {
    if (!m.inRange) return;
    const frac = m.inRange / (m.i1 - m.i0 + 1);
    const md = Math.max(max(PEAK_KVA, m.i0, m.i1), 0.75 * cfg.targets.contractDemandKva);
    mdKva = Math.max(mdKva, max(PEAK_KVA, Math.max(m.i0, r.i0), Math.min(m.i1, r.i1)));
    demand += md * t.demandCharge * frac;
    const kwh = sum(INCOMING, m.i0, m.i1), kvarh = sum(KVARH, m.i0, m.i1);
    const pfm = kwh / Math.sqrt(kwh * kwh + kvarh * kvarh);
    if (pfm < t.pfThreshold) {
      let e = 0;
      for (let d = Math.max(m.i0, r.i0); d <= Math.min(m.i1, r.i1); d++) for (let h = 0; h < 24; h++) e += GRID_HOURLY[d * 24 + h] * rates[h];
      pfAdj += e * (((t.pfThreshold - pfm) / 0.01) * t.pfPenaltyPct) / 100;
    }
  });
  const gridKwh = sum(GRID, r.i0, r.i1);
  const duty = (energy * t.duty) / 100;
  const other = gridKwh * t.otherPerKwh;
  const dg = sum(DG_FUEL, r.i0, r.i1) * t.dieselPrice + sum(DG_KWH, r.i0, r.i1) * t.dgOm;
  const solar = sum(SOLAR_KWH, r.i0, r.i1) * t.solarRate;
  const fuel = (sum(UTIL.BLR.extra.fuel1, r.i0, r.i1) + sum(UTIL.BLR.extra.fuel2, r.i0, r.i1)) * t.gasPrice;
  const electricity = energy + demand + duty + other + pfAdj + dg + solar;
  return { energy, tod, demand, duty, other, pf: pfAdj, dg, solar, fuel, electricity, total: electricity + fuel, perKwh: safeDiv(electricity, sum(INCOMING, r.i0, r.i1)), mdKva };
}

/** Fast daily electricity cost estimate (₹) used for trends: ToD energy + duty + other + DG + solar + prorated demand */
export function dailyCost(d: number, cfg: Config) {
  const t = cfg.tariff;
  let e = 0;
  for (let h = 0; h < 24; h++) e += GRID_HOURLY[d * 24 + h] * zoneRate(cfg, h);
  const dem = (Math.max(PEAK_KVA[d], 0.75 * cfg.targets.contractDemandKva) * t.demandCharge) / 30.4;
  return e * (1 + t.duty / 100) + GRID[d] * t.otherPerKwh + DG_FUEL[d] * t.dieselPrice + DG_KWH[d] * t.dgOm + SOLAR_KWH[d] * t.solarRate + dem;
}

// ---------------- carbon ----------------
export function co2Period(r: Range, cfg: Config) {
  const grid = (sum(GRID, r.i0, r.i1) - sum(EXPORT, r.i0, r.i1)) / 1000 * cfg.ef.grid;
  const dg = (sum(DG_FUEL, r.i0, r.i1) * cfg.ef.diesel) / 1000;
  const gas = ((sum(UTIL.BLR.extra.fuel1, r.i0, r.i1) + sum(UTIL.BLR.extra.fuel2, r.i0, r.i1)) * cfg.ef.gas) / 1000;
  const solar = (sum(SOLAR_KWH, r.i0, r.i1) / 1000) * cfg.ef.solar;
  return { grid, dg, gas, solar, total: grid + dg + gas + solar, scope1: dg + gas, scope2: grid + solar, avoided: (sum(SOLAR_KWH, r.i0, r.i1) / 1000) * cfg.ef.grid };
}
export function dailyCo2(d: number, cfg: Config) {
  return ((GRID[d] - EXPORT[d]) / 1000) * cfg.ef.grid + (DG_FUEL[d] * cfg.ef.diesel) / 1000 + ((UTIL.BLR.extra.fuel1[d] + UTIL.BLR.extra.fuel2[d]) * cfg.ef.gas) / 1000;
}

// ---------------- plant metrics ----------------
export function plantMetrics(r: Range, cfg: Config) {
  const incoming = sum(INCOMING, r.i0, r.i1);
  const cons = sum(CONS, r.i0, r.i1);
  const kvarh = sum(KVARH, r.i0, r.i1);
  const teq = sum(PROD_TEQ, r.i0, r.i1);
  const cost = costPeriod(r, cfg);
  const co2 = co2Period(r, cfg);
  const solar = sum(SOLAR_KWH, r.i0, r.i1);
  const days = r.i1 - r.i0 + 1;
  const peakKw = max(PEAK_KW, r.i0, r.i1);
  return {
    days, incoming, cons, losses: incoming - cons, grid: sum(GRID, r.i0, r.i1), solar, dg: sum(DG_KWH, r.i0, r.i1), exported: sum(EXPORT, r.i0, r.i1),
    dgFuel: sum(DG_FUEL, r.i0, r.i1),
    prod: sum(PROD_KWH, r.i0, r.i1), util: sum(UTIL_TOTAL, r.i0, r.i1), bld: sum(BLD_TOTAL, r.i0, r.i1),
    peakKw, peakKva: max(PEAK_KVA, r.i0, r.i1), pf: incoming / Math.sqrt(incoming * incoming + kvarh * kvarh), teq, intensity: safeDiv(cons, teq),
    loadFactor: safeDiv(incoming / (days * 24), peakKw) * 100, cost, co2, renewablePct: safeDiv(solar, incoming) * 100,
    fuelScm: sum(UTIL.BLR.extra.fuel1, r.i0, r.i1) + sum(UTIL.BLR.extra.fuel2, r.i0, r.i1),
  };
}
export type PlantM = ReturnType<typeof plantMetrics>;

// ---------------- departments ----------------
export interface DeptDef { id: string; name: string; kind: 'Production' | 'Utilities' | 'Buildings' | 'Logistics'; series: (d: number) => number }
export const DEPARTMENTS: DeptDef[] = [
  { id: 'PRD', name: 'Production', kind: 'Production', series: (d) => PROD_KWH[d] },
  { id: 'UTL', name: 'Utilities', kind: 'Utilities', series: (d) => UTIL_TOTAL[d] },
  { id: 'ADM', name: 'Administration', kind: 'Buildings', series: (d) => BLD.ADM.kwh[d] },
  { id: 'WH', name: 'Central Warehouse', kind: 'Logistics', series: (d) => BLD.WH.kwh[d] },
  { id: 'HUB1', name: 'Distribution Hub 01', kind: 'Logistics', series: (d) => BLD.HUB1.kwh[d] },
  { id: 'HUB2', name: 'Distribution Hub 02', kind: 'Logistics', series: (d) => BLD.HUB2.kwh[d] },
  { id: 'HUB3', name: 'Distribution Hub 03', kind: 'Logistics', series: (d) => BLD.HUB3.kwh[d] },
];
export function deptKwh(id: string, r: Range) {
  const dd = DEPARTMENTS.find((x) => x.id === id)!;
  let s = 0;
  for (let d = r.i0; d <= r.i1; d++) s += dd.series(d);
  return s;
}
/** Series for the department filter ("ALL" = plant consumption) */
export function deptSeries(id: string): (d: number) => number {
  if (id === 'ALL') return (d) => CONS[d];
  return DEPARTMENTS.find((x) => x.id === id)!.series;
}

export { ACT, BUILDINGS, UTILITIES, LINES };
void YEAR;
void MONTH;
