// Rule-based insights engine and alert generator. Every insight is calculated from the
// simulated dataset and carries its calculation so nothing is an unsupported "AI" claim.
import { BUILDINGS, LINES, UTILITIES, TRANSFORMERS } from './assets';
import { Config, costPeriod, lineBaselineSec, lineMetrics, lineTargetSec, pct, plantMetrics, Range, rangeLabel, safeDiv, sum, utilSecBaseline, utilSec, co2Period, expectedPlantKwh, fmtDate } from './engine';
import { APFC_FAULT, BLD, DATES, DAYS, HUB2_METER_OFFLINE, INCOMING, CONS, LINE, NS, PEAK_KVA, PF, TR_PEAK_KVA, UTIL, UTIL_KWH, UTIL_TOTAL, LOSSPCT } from './sim';

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';
export interface Insight {
  id: string;
  category: string;
  title: string;
  description: string;
  asset: string;
  department: string;
  period: string;
  metric: string;
  actual: string;
  reference: string;
  deviation: number | null;
  severity: Severity;
  energyImpact: number; // kWh (+ = excess)
  costImpact: number; // ₹
  action: string;
  calc: string;
  trend: { label: string; value: number; ref?: number }[];
  link?: string;
}

const f0 = (v: number) => Math.round(v).toLocaleString('en-IN');
const f1 = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const f2 = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const sev = (dev: number): Severity => (dev >= 15 ? 'High' : dev >= 8 ? 'Medium' : dev >= 3 ? 'Low' : 'Informational');

function dailyTrend(r: Range, fn: (d: number) => number, ref?: number) {
  const out: Insight['trend'] = [];
  const step = Math.max(1, Math.ceil((r.i1 - r.i0 + 1) / 60));
  for (let d = r.i0; d <= r.i1; d += step) {
    let v = 0, n = 0;
    for (let k = d; k < Math.min(d + step, r.i1 + 1); k++) { v += fn(k); n++; }
    out.push({ label: DATES[d].slice(5), value: v / n, ref });
  }
  return out;
}

export function generateInsights(r: Range, cmp: Range | null, cfg: Config): Insight[] {
  const out: Insight[] = [];
  const P = plantMetrics(r, cfg);
  const C = cmp ? plantMetrics(cmp, cfg) : null;
  const rate = P.cost.perKwh || 9;
  const period = rangeLabel(r);
  const wide: Range = { i0: Math.max(0, (cmp?.i0 ?? r.i0) ), i1: r.i1 };

  // 1/2 Plant consumption change
  if (C) {
    const ch = pct(P.cons, C.cons)!;
    const pch = pct(P.teq, C.teq)!;
    out.push({
      id: 'plant-change', category: ch >= 0 ? 'Energy Consumption Increase' : 'Energy Consumption Decrease',
      title: `Plant energy consumption ${ch >= 0 ? 'increased' : 'decreased'} ${f1(Math.abs(ch))}% vs comparison period`,
      description: `Accounted plant consumption was ${f0(P.cons)} kWh against ${f0(C.cons)} kWh in ${rangeLabel(cmp)}. Normalised production changed by ${f1(pch)}%.`,
      asset: 'Plant', department: 'All', period, metric: 'Total accounted kWh', actual: `${f0(P.cons)} kWh`, reference: `${f0(C.cons)} kWh`, deviation: ch,
      severity: ch > 0 && ch - pch > 5 ? 'Medium' : 'Informational', energyImpact: P.cons - C.cons, costImpact: (P.cons - C.cons) * rate,
      action: ch - pch > 3 ? 'Energy grew faster than production. Review the departments with the largest increase below.' : 'No action – change is in line with production.',
      calc: '% change = (current − previous) / previous × 100 using difference-based meter consumption.',
      trend: dailyTrend(wide, (d) => CONS[d]), link: '#/analytics',
    });
    // 11 cost vs production
    const cch = pct(P.cost.total, C.cost.total)!;
    if (cch > 0 && pch < 0) out.push({
      id: 'cost-up-prod-down', category: 'Energy Cost Increase', title: `Energy cost increased ${f1(cch)}% despite ${f1(Math.abs(pch))}% lower production`,
      description: `Total energy cost was ₹${f0(P.cost.total)} vs ₹${f0(C.cost.total)} while normalised production fell from ${f0(C.teq)} to ${f0(P.teq)} t-eq.`,
      asset: 'Plant', department: 'All', period, metric: 'Energy cost ₹', actual: `₹${f0(P.cost.total)}`, reference: `₹${f0(C.cost.total)}`, deviation: cch, severity: 'High',
      energyImpact: 0, costImpact: P.cost.total - C.cost.total, action: 'Check demand charges, ToD mix (peak-hour share) and PF penalty in Cost Management.', calc: 'Cost engine: ToD energy + demand + duty + PF + DG + solar + boiler fuel.', trend: dailyTrend(wide, (d) => CONS[d]), link: '#/cost',
    });
    // 15 carbon change
    const co2c = pct(P.co2.total, C.co2.total)!;
    if (co2c > 2) out.push({
      id: 'co2-up', category: 'Carbon Emission Increase', title: `Carbon emissions up ${f1(co2c)}% (${f1(P.co2.total - C.co2.total)} tCO₂e)`,
      description: `Scope 1+2 emissions were ${f1(P.co2.total)} tCO₂e vs ${f1(C.co2.total)} tCO₂e. Grid electricity contributes ${f0((P.co2.grid / P.co2.total) * 100)}%.`,
      asset: 'Plant', department: 'Sustainability', period, metric: 'tCO₂e', actual: f1(P.co2.total), reference: f1(C.co2.total), deviation: co2c, severity: 'Low',
      energyImpact: 0, costImpact: 0, action: 'Prioritise electricity savings and increase solar self-consumption.', calc: 'CO₂e = grid MWh × grid EF + diesel L × EF + gas SCM × EF (configurable).', trend: [], link: '#/carbon',
    });
  }
  // 2 utilities share
  const us = (P.util / P.cons) * 100;
  out.push({
    id: 'util-share', category: 'Energy Distribution Imbalance', title: `Utilities account for ${f0(us)}% of plant electricity`,
    description: `Utilities used ${f0(P.util)} kWh of ${f0(P.cons)} kWh. Production used ${f0((P.prod / P.cons) * 100)}%, buildings & logistics ${f0((P.bld / P.cons) * 100)}%.`,
    asset: 'Utilities', department: 'Utilities', period, metric: 'Utility share %', actual: `${f1(us)}%`, reference: '35% (typical FMCG benchmark, illustrative)', deviation: us - 35,
    severity: us > 40 ? 'Medium' : 'Informational', energyImpact: 0, costImpact: 0, action: 'Focus on compressed air and chiller plant, the two largest utility consumers.', calc: 'Share = utility kWh / accounted kWh.', trend: dailyTrend(r, (d) => (UTIL_TOTAL[d] / CONS[d]) * 100), link: '#/utilities',
  });
  // Baseline deviation (production-normalised)
  const exp = expectedPlantKwh(r, cfg);
  const bdev = pct(P.cons, exp)!;
  out.push({
    id: 'plant-baseline', category: 'Energy Baseline Deviation', title: `Plant energy ${bdev >= 0 ? 'exceeded' : 'was below'} the production-normalised baseline by ${f1(Math.abs(bdev))}%`,
    description: `Expected consumption for the production achieved is ${f0(exp)} kWh (baseline regression), actual was ${f0(P.cons)} kWh.`,
    asset: 'Plant', department: 'All', period, metric: 'EnPI (actual / expected)', actual: f2(P.cons / exp), reference: '1.00', deviation: bdev, severity: bdev > 5 ? 'High' : bdev > 2 ? 'Medium' : 'Informational',
    energyImpact: P.cons - exp, costImpact: (P.cons - exp) * rate, action: bdev > 0 ? 'Drill into lines with highest SEC deviation from baseline.' : 'Performance better than baseline – verify savings against improvement projects.',
    calc: 'Expected = Σ(a + b × t-eq) per day; a, b from least-squares fit on the baseline year.', trend: [], link: '#/targets',
  });

  // per line
  LINES.forEach((L, l) => {
    const m = lineMetrics(l, r);
    if (m.good <= 0) return;
    const base = lineBaselineSec(l, cfg);
    const tgt = lineTargetSec(l, cfg);
    const dev = pct(m.sec, base)!;
    if (cmp) {
      const c = lineMetrics(l, cmp);
      const ech = pct(m.kwh, c.kwh), pch = pct(m.good, c.good), sch = pct(m.sec, c.sec);
      if (ech != null && pch != null && sch != null && sch > 6) out.push({
        id: `line-mismatch-${L.id}`, category: 'Production-Energy Mismatch', title: `${L.short} consumed ${f1(ech)}% more energy while production changed ${f1(pch)}%`,
        description: `SEC rose from ${f2(c.sec)} to ${f2(m.sec)} ${L.secUnit} (+${f1(sch)}%).`, asset: L.name, department: 'Production', period, metric: L.secUnit,
        actual: f2(m.sec), reference: f2(c.sec), deviation: sch, severity: sev(sch), energyImpact: (m.sec - c.sec) * m.good, costImpact: (m.sec - c.sec) * m.good * rate,
        action: L.idx === 3 ? 'Inspect tunnel oven burners, insulation and zone setpoints; check door seals. Compare with oven kWh trend.' : 'Review machine-wise energy and machine-state breakdown for this line.',
        calc: 'SEC = line kWh / good production; compared with same metric in the comparison period.',
        trend: dailyTrend(wide, (d) => safeDiv(LINE[l].kwh[d], LINE[l].good[d]), base), link: `#/line/${L.id}`,
      });
    }
    if (dev > 8) out.push({
      id: `line-high-sec-${L.id}`, category: 'High Energy Intensity', title: `${L.short} SEC is ${f1(dev)}% above baseline`,
      description: `Current SEC ${f2(m.sec)} vs baseline ${f2(base)} and target ${f2(tgt)} ${L.secUnit}.`, asset: L.name, department: 'Production', period, metric: L.secUnit,
      actual: f2(m.sec), reference: f2(base), deviation: dev, severity: sev(dev), energyImpact: (m.sec - base) * m.good, costImpact: (m.sec - base) * m.good * rate,
      action: 'Open the line dashboard, identify the machine with the largest increase and raise an improvement project.', calc: 'Deviation = (SEC − baseline SEC) / baseline SEC.',
      trend: dailyTrend(r, (d) => safeDiv(LINE[l].kwh[d], LINE[l].good[d]), base), link: `#/line/${L.id}`,
    });
  });
  // idle energy
  const idle = LINES.map((L, l) => { const m = lineMetrics(l, r); return { L, l, m, share: safeDiv(m.nonProdKwh, m.kwh) * 100 }; }).filter((x) => x.share > cfg.targets.idleShareMax).sort((a, b) => b.share - a.share);
  if (idle.length) {
    const tot = idle.reduce((s, x) => s + x.m.kwhS[1] + x.m.kwhS[9], 0);
    out.push({
      id: 'idle-lines', category: 'Idle Energy Loss', title: `${idle.length} production line${idle.length > 1 ? 's' : ''} consumed significant energy while not producing`,
      description: idle.slice(0, 5).map((x) => `${x.L.short}: ${f0(x.share)}% of energy outside Running state`).join('; ') + '.',
      asset: idle.map((x) => x.L.id).join(', '), department: 'Production', period, metric: 'Non-production energy share', actual: `${f0(idle[0].share)}% (worst)`, reference: `${cfg.targets.idleShareMax}% threshold`,
      deviation: idle[0].share - cfg.targets.idleShareMax, severity: idle.length >= 3 ? 'High' : 'Medium', energyImpact: tot * 0.5, costImpact: tot * 0.5 * rate,
      action: 'Introduce auto-shutdown / standby interlocks for ovens, plodders and pulverisers when no production order is active. Estimated 50% of idle + unscheduled energy is avoidable.',
      calc: 'Non-production share = (total − Running-state kWh) / total. Avoidable estimate assumes 50% of Idle + No-Production kWh (estimate, not measured).',
      trend: [], link: '#/losses',
    });
  }
  // compressor
  const airBase = UTILITIES[0].assets.slice(0, 3).map((_, c) => {
    const b = { i0: Math.max(0, cfg.baseline ? 0 : 0), i1: 364 };
    return safeDiv(sum(UTIL.AIR.kwh[c], b.i0, b.i1), sum(UTIL.AIR.out[c], b.i0, b.i1));
  });
  [0, 1, 2].forEach((c) => {
    const spc = safeDiv(sum(UTIL.AIR.kwh[c], r.i0, r.i1), sum(UTIL.AIR.out[c], r.i0, r.i1));
    const dv = pct(spc, airBase[c])!;
    if (dv > 6) out.push({
      id: `air-spc-${c}`, category: 'Utility Efficiency Degradation', title: `${UTILITIES[0].assets[c].name} specific power is ${f1(dv)}% above baseline`,
      description: `${f2(spc * 1000)} Wh/Nm³ vs baseline ${f2(airBase[c] * 1000)} Wh/Nm³. Unload energy in the period: ${f0(sum(UTIL.AIR.unloadKwh[c], r.i0, r.i1))} kWh.`,
      asset: UTILITIES[0].assets[c].name, department: 'Utilities', period, metric: 'kWh/Nm³', actual: f2(spc * 1000) + ' Wh/Nm³', reference: f2(airBase[c] * 1000) + ' Wh/Nm³', deviation: dv, severity: sev(dv),
      energyImpact: (spc - airBase[c]) * sum(UTIL.AIR.out[c], r.i0, r.i1), costImpact: (spc - airBase[c]) * sum(UTIL.AIR.out[c], r.i0, r.i1) * rate,
      action: 'Check air-end wear, inlet filter ΔP and intercooler fouling; review load/unload pressure band. Shift base load to Compressor 01/03.', calc: 'SPC = compressor kWh / air delivered (Nm³), baseline = first 12 months.',
      trend: dailyTrend(wide, (d) => safeDiv(UTIL.AIR.kwh[c][d], UTIL.AIR.out[c][d]) * 1000, airBase[c] * 1000), link: '#/utilities/AIR',
    });
    const np = sum(UTIL.AIR.nonProdKwh[c], r.i0, r.i1);
    if (c === 1 && np > 0) out.push({
      id: 'air-nonprod-1', category: 'Energy Savings Opportunity', title: `Compressor 02 consumed ${f0(np)} kWh during non-production hours`,
      description: 'Compressed air demand outside scheduled production is mostly leakage and unloaded running.', asset: UTILITIES[0].assets[1].name, department: 'Utilities', period,
      metric: 'Non-production kWh', actual: `${f0(np)} kWh`, reference: '—', deviation: null, severity: 'Medium', energyImpact: np * 0.6, costImpact: np * 0.6 * rate,
      action: 'Isolate idle headers with solenoid valves at shift end and run an ultrasonic leak survey. Estimated 60% recoverable.', calc: 'Non-production kWh = compressor kWh × non-scheduled share × 0.75 load allocation (estimated).', trend: [], link: '#/utilities/AIR',
    });
  });
  // chillers
  const chl = [0, 1, 2].map((c) => ({ c, v: safeDiv(sum(UTIL.CHL.kwh[c], r.i0, r.i1), sum(UTIL.CHL.out[c], r.i0, r.i1)) }));
  const worst = chl.reduce((a, b) => (b.v > a.v ? b : a));
  const best = chl.reduce((a, b) => (b.v < a.v ? b : a));
  const cdv = pct(worst.v, best.v)!;
  out.push({
    id: 'chiller-compare', category: 'Utility Efficiency Degradation', title: `Chiller 0${worst.c + 1} runs at ${f2(worst.v)} kW/TR, ${f0(cdv)}% worse than Chiller 0${best.c + 1}`,
    description: `Chiller kW/TR in period: ${chl.map((x) => `Ch0${x.c + 1} ${f2(x.v)}`).join(', ')}.`, asset: `Chiller 0${worst.c + 1}`, department: 'Utilities', period, metric: 'kW/TR',
    actual: f2(worst.v), reference: f2(best.v), deviation: cdv, severity: sev(cdv), energyImpact: (worst.v - best.v) * sum(UTIL.CHL.out[worst.c], r.i0, r.i1), costImpact: (worst.v - best.v) * sum(UTIL.CHL.out[worst.c], r.i0, r.i1) * rate,
    action: 'Sequence Chiller 01 as lead, clean condenser tubes on Chiller 02 and check refrigerant charge.', calc: 'kW/TR = chiller kWh / TR-h delivered (BTU meter).', trend: dailyTrend(r, (d) => safeDiv(UTIL.CHL.kwh[worst.c][d], UTIL.CHL.out[worst.c][d]), best.v), link: '#/utilities/CHL',
  });
  // hubs
  const hp = BUILDINGS.filter((b) => b.kind === 'Hub').map((b) => ({ b, v: safeDiv(sum(BLD[b.id].kwh, r.i0, r.i1), sum(BLD[b.id].act, r.i0, r.i1)) }));
  const h1 = hp[0], h3 = hp[2];
  const hdv = pct(h3.v, h1.v)!;
  out.push({
    id: 'hub-compare', category: 'Energy Distribution Imbalance', title: `Distribution Hub 03 consumed ${f0(hdv)}% more energy per pallet than Hub 01`,
    description: `kWh/pallet: ${hp.map((x) => `${x.b.id} ${f2(x.v)}`).join(', ')}.`, asset: h3.b.name, department: 'Logistics', period, metric: 'kWh/pallet', actual: f2(h3.v), reference: f2(h1.v), deviation: hdv,
    severity: sev(hdv), energyImpact: (h3.v - h1.v) * sum(BLD.HUB3.act, r.i0, r.i1), costImpact: (h3.v - h1.v) * sum(BLD.HUB3.act, r.i0, r.i1) * rate,
    action: 'Audit cold-storage door discipline and lighting schedule at Hub 03; benchmark against Hub 01 practices.', calc: 'kWh per pallet = hub kWh / pallets handled.', trend: [], link: '#/buildings',
  });
  // peak demand
  let pk = 0, pkd = r.i0;
  for (let d = r.i0; d <= r.i1; d++) if (PEAK_KVA[d] > pk) { pk = PEAK_KVA[d]; pkd = d; }
  const cd = cfg.targets.contractDemandKva;
  const exceed = []; for (let d = r.i0; d <= r.i1; d++) if (PEAK_KVA[d] > cd) exceed.push(d);
  if (exceed.length) out.push({
    id: 'peak-demand', category: 'Peak Demand Exceeded', title: `Peak demand exceeded contract demand on ${exceed.length} day${exceed.length > 1 ? 's' : ''}`,
    description: `Maximum demand reached ${f0(pk)} kVA on ${fmtDate(pkd)} against contract demand ${f0(cd)} kVA.`, asset: 'Grid incomer', department: 'Electrical', period, metric: 'kVA', actual: f0(pk), reference: f0(cd),
    deviation: pct(pk, cd), severity: 'High', energyImpact: 0, costImpact: (pk - cd) * cfg.tariff.demandCharge * 1.5, action: 'Stagger chiller and compressor starts at shift change, enable demand controller load-shedding of non-critical loads.',
    calc: 'Daily max kVA (15-min block) compared with configured contract demand; excess billed at 150% (illustrative).', trend: dailyTrend(r, (d) => PEAK_KVA[d], cd), link: '#/electrical',
  });
  // PF
  let pfDays = 0; for (let d = r.i0; d <= r.i1; d++) if (PF[d] < cfg.tariff.pfThreshold) pfDays++;
  if (pfDays) out.push({
    id: 'pf-low', category: 'Power Factor Degradation', title: `Power factor dropped below ${cfg.tariff.pfThreshold} on ${pfDays} day${pfDays > 1 ? 's' : ''}`,
    description: `Period average PF ${f2(P.pf)}. Low PF coincides with APFC capacitor stage failure (simulated event, 08–19 Oct 2026).`, asset: 'APFC panel / Main incomer', department: 'Electrical', period,
    metric: 'Power factor', actual: f2(P.pf), reference: String(cfg.tariff.pfThreshold), deviation: pct(P.pf, cfg.tariff.pfThreshold), severity: pfDays > 5 ? 'High' : 'Medium', energyImpact: 0, costImpact: P.cost.pf,
    action: 'Replace failed capacitor stages and verify APFC controller C/k setting.', calc: 'PF = kWh / √(kWh² + kVARh²); penalty per configured tariff rule.', trend: dailyTrend(wide, (d) => PF[d], cfg.tariff.pfThreshold), link: '#/electrical',
  });
  // transformer loading
  TRANSFORMERS.forEach((t) => {
    let mx = 0; for (let d = r.i0; d <= r.i1; d++) mx = Math.max(mx, TR_PEAK_KVA[t.id][d]);
    const lp = (mx / t.ratedKva) * 100;
    if (lp > 85) out.push({
      id: `tr-load-${t.id}`, category: 'Energy Distribution Imbalance', title: `${t.id} peak loading reached ${f0(lp)}% of rating`, description: `${t.name} peaked at ${f0(mx)} kVA vs ${t.ratedKva} kVA rated.`,
      asset: t.name, department: 'Electrical', period, metric: 'Loading %', actual: `${f0(lp)}%`, reference: '85%', deviation: lp - 85, severity: lp > 95 ? 'High' : 'Medium', energyImpact: 0, costImpact: 0,
      action: 'Rebalance loads between TR-03 and TR-01 (TR-01 peak loading is much lower).', calc: 'Loading = peak kVA / rated kVA.', trend: dailyTrend(r, (d) => (TR_PEAK_KVA[t.id][d] / t.ratedKva) * 100, 85), link: '#/electrical',
    });
  });
  // energy balance
  const inc = sum(INCOMING, r.i0, r.i1), acc = sum(CONS, r.i0, r.i1);
  const ub = ((inc - acc) / inc) * 100;
  if (ub > 3) out.push({
    id: 'balance', category: 'Energy Distribution Imbalance', title: `Unaccounted energy is ${f1(ub)}% of incoming`, description: `Incoming ${f0(inc)} kWh vs department-level metered ${f0(acc)} kWh. Normal level is ~2.6%.`,
    asset: 'Distribution network', department: 'Electrical', period, metric: 'Unaccounted %', actual: `${f1(ub)}%`, reference: '3.0%', deviation: ub - 3, severity: 'Medium', energyImpact: inc - acc - inc * 0.026, costImpact: (inc - acc - inc * 0.026) * rate,
    action: 'Run meter-hierarchy reconciliation; check for unmetered temporary loads and transformer losses.', calc: 'Unaccounted = incoming − Σ department meters − export.', trend: dailyTrend(wide, (d) => LOSSPCT[d] * 100, 3), link: '#/quality',
  });
  // meter anomaly
  const off = [...HUB2_METER_OFFLINE].filter((d) => d >= r.i0 && d <= r.i1).length;
  if (off) out.push({
    id: 'meter-hub2', category: 'Meter Data Anomaly', title: `Hub 02 main meter offline for ${off} day${off > 1 ? 's' : ''}`, description: 'Hub 02 consumption in these days is estimated from the 7-day average and flagged as Estimated.',
    asset: 'EM-P-HUB-02', department: 'Logistics', period, metric: 'Data completeness', actual: '0%', reference: '≥ 98%', deviation: -100, severity: 'High', energyImpact: 0, costImpact: 0,
    action: 'Dispatch technician to check gateway / RS-485 loop at Hub 02.', calc: 'Completeness = received samples / expected samples (1-min).', trend: [], link: '#/meters',
  });
  // savings opportunity unloading
  const unl = [0, 1, 2].reduce((s, c) => s + sum(UTIL.AIR.unloadKwh[c], r.i0, r.i1), 0);
  out.push({
    id: 'air-unload', category: 'Energy Savings Opportunity', title: `Compressor unloading consumed ${f0(unl)} kWh`, description: 'Fixed-speed compressors 01/02 spend significant time unloaded at ~28% power.',
    asset: 'Compressed air system', department: 'Utilities', period, metric: 'Unload kWh', actual: f0(unl), reference: '—', deviation: null, severity: 'Low', energyImpact: unl * 0.7, costImpact: unl * 0.7 * rate,
    action: 'Install a master sequencer so the VFD compressor trims and fixed-speed units stay fully loaded or off.', calc: 'Unload kWh = unload hours × unload kW (28% of rated).', trend: [], link: '#/utilities/AIR',
  });
  // utility system vs baseline
  UTILITIES.forEach((u) => {
    if (u.key === 'OTH' || u.key === 'AIR' || u.key === 'CHL') return;
    const cur = utilSec(u.key, r), b = utilSecBaseline(u.key, cfg);
    const dv = pct(cur, b);
    if (dv != null && dv > 6) out.push({
      id: `util-${u.key}`, category: 'Utility Efficiency Degradation', title: `${u.name} specific energy is ${f1(dv)}% above baseline`, description: `${f2(cur)} vs ${f2(b)} ${u.secUnit}.`, asset: u.name, department: 'Utilities', period,
      metric: u.secUnit, actual: f2(cur), reference: f2(b), deviation: dv, severity: sev(dv), energyImpact: (cur - b) * sum(UTIL[u.key].sysOut, r.i0, r.i1), costImpact: (cur - b) * sum(UTIL[u.key].sysOut, r.i0, r.i1) * rate,
      action: 'Review operating schedule and setpoints.', calc: 'Specific energy = system kWh / system output.', trend: dailyTrend(r, (d) => safeDiv(UTIL_KWH[u.key][d], UTIL[u.key].sysOut[d]), b), link: `#/utilities/${u.key}`,
    });
  });
  // highest intensity per category (normalised to target)
  const cats = Array.from(new Set(LINES.map((l) => l.category)));
  cats.forEach((cat) => {
    const ls = LINES.filter((L) => L.category === cat).map((L) => { const m = lineMetrics(L.idx, r); return { L, idx: safeDiv(m.sec, lineTargetSec(L.idx, cfg)) }; }).filter((x) => x.idx > 0);
    if (ls.length < 2) return;
    const w = ls.reduce((a, b) => (b.idx > a.idx ? b : a));
    if (w.idx > 1.05) out.push({
      id: `cat-${cat}`, category: 'High Energy Intensity', title: `${w.L.short} has the highest energy intensity (vs target) in ${cat}`, description: `SEC is ${f0((w.idx - 1) * 100)}% above its target. Lines are compared on SEC ÷ own target, so different product units are not mixed.`,
      asset: w.L.name, department: 'Production', period, metric: 'SEC / target', actual: f2(w.idx), reference: '1.00', deviation: (w.idx - 1) * 100, severity: 'Low', energyImpact: 0, costImpact: 0, action: 'Benchmark against the best line in the category.', calc: 'Index = SEC / line target SEC.', trend: [], link: `#/line/${w.L.id}`,
    });
  });
  void costPeriod; void co2Period; void NS;
  const order: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Informational: 4 };
  return out.sort((a, b) => order[a.severity] - order[b.severity] || Math.abs(b.costImpact) - Math.abs(a.costImpact));
}

// ---------------- alerts ----------------
export interface Alert {
  id: string; time: string; d: number; type: string; severity: Severity; asset: string; department: string; message: string; value: string; threshold: string;
  status: 'Active' | 'Acknowledged' | 'Assigned' | 'Escalated' | 'Resolved'; assignee?: string; rootCause?: string; action?: string; comments: { by: string; text: string; at: string }[];
}

export function generateAlerts(cfg: Config): Alert[] {
  const out: Alert[] = [];
  let n = 0;
  const push = (d: number, a: Omit<Alert, 'id' | 'time' | 'd' | 'status' | 'comments'>, hh = 10) => {
    const age = DAYS - 1 - d;
    const status: Alert['status'] = age > 10 ? 'Resolved' : age > 5 ? 'Acknowledged' : 'Active';
    n++;
    out.push({ ...a, id: `ALM-${String(n).padStart(5, '0')}`, time: `${DATES[d]} ${String(hh).padStart(2, '0')}:${String((n * 7) % 60).padStart(2, '0')}`, d, status, comments: [], rootCause: status === 'Resolved' ? 'Simulated root cause recorded by shift engineer' : undefined, action: status === 'Resolved' ? 'Corrective action completed' : undefined, assignee: status !== 'Active' ? 'Shift Electrical Engineer' : undefined });
  };
  for (let d = 0; d < DAYS; d++) {
    if (PF[d] < cfg.tariff.pfThreshold - 0.01) push(d, { type: 'Low power factor', severity: 'High', asset: 'Main incomer', department: 'Electrical', message: `Daily average PF ${PF[d].toFixed(3)}`, value: PF[d].toFixed(3), threshold: `< ${cfg.tariff.pfThreshold}` }, 11);
    if (PEAK_KVA[d] > cfg.targets.contractDemandKva) push(d, { type: 'Abnormal power demand', severity: 'Critical', asset: 'Main incomer', department: 'Electrical', message: `Maximum demand ${Math.round(PEAK_KVA[d])} kVA above contract demand`, value: `${Math.round(PEAK_KVA[d])} kVA`, threshold: `${cfg.targets.contractDemandKva} kVA` }, 15);
    TRANSFORMERS.forEach((t) => { const lp = (TR_PEAK_KVA[t.id][d] / t.ratedKva) * 100; if (lp > 90) push(d, { type: 'High transformer loading', severity: lp > 100 ? 'Critical' : 'High', asset: t.id, department: 'Electrical', message: `${t.id} loading ${lp.toFixed(0)}%`, value: `${lp.toFixed(0)}%`, threshold: '> 90%' }, 14); });
    if (LOSSPCT[d] > 0.034) push(d, { type: 'Energy balance mismatch', severity: 'Medium', asset: 'Distribution network', department: 'Electrical', message: `Unaccounted energy ${(LOSSPCT[d] * 100).toFixed(1)}%`, value: `${(LOSSPCT[d] * 100).toFixed(1)}%`, threshold: '> 3.4%' }, 6);
    if (HUB2_METER_OFFLINE.has(d)) push(d, { type: 'Meter communication failure', severity: 'High', asset: 'EM-P-HUB-02', department: 'Distribution Hub 02', message: 'No data received from Hub 02 main meter', value: '0% completeness', threshold: '< 98%' }, 0);
    if (APFC_FAULT.has(d) && DATES[d] === '2026-10-08') push(d, { type: 'Device offline', severity: 'Medium', asset: 'APFC controller', department: 'Electrical', message: 'APFC stage 3–5 not responding', value: 'Offline', threshold: '—' }, 9);
    if (d % 7 === 0) {
      LINES.forEach((L, l) => {
        const s0 = Math.max(0, d - 6);
        const k = sum(LINE[l].kwh, s0, d), g = sum(LINE[l].good, s0, d);
        const sec = safeDiv(k, g), t = lineTargetSec(l, cfg);
        if (g > 0 && sec > t * 1.12) push(d, { type: 'Excessive energy intensity', severity: sec > t * 1.2 ? 'High' : 'Medium', asset: L.id, department: 'Production', message: `${L.short} weekly SEC ${sec.toFixed(2)} ${L.secUnit}`, value: sec.toFixed(2), threshold: `> ${(t * 1.12).toFixed(2)}` }, 8);
        let non = 0; for (let x = s0; x <= d; x++) non += LINE[l].kwhS[x * NS + 1] + LINE[l].kwhS[x * NS + 9];
        if (non / k > 0.16) push(d, { type: 'Idle energy consumption', severity: 'Medium', asset: L.id, department: 'Production', message: `${L.short}: ${((non / k) * 100).toFixed(0)}% of weekly energy in Idle / No-production`, value: `${((non / k) * 100).toFixed(0)}%`, threshold: '> 16%' }, 7);
      });
      const c2 = safeDiv(sum(UTIL.AIR.kwh[1], Math.max(0, d - 6), d), sum(UTIL.AIR.out[1], Math.max(0, d - 6), d));
      if (c2 > 0.118 * 1.1) push(d, { type: 'Utility efficiency deterioration', severity: 'High', asset: 'Screw air compressor 02', department: 'Utilities', message: `Compressor 02 SPC ${(c2 * 1000).toFixed(0)} Wh/Nm³`, value: `${(c2 * 1000).toFixed(0)} Wh/Nm³`, threshold: '> 130 Wh/Nm³' }, 12);
    }
    if (DATES[d].slice(8) === '01' && d > 0) {
      const m0 = Math.max(0, d - 30);
      const k = sum(CONS, m0, d - 1);
      if (k > cfg.targets.plantMonthlyKwh) push(d, { type: 'Energy target exceeded', severity: 'Medium', asset: 'Plant', department: 'All', message: `Previous month consumption ${Math.round(k / 1000)} MWh above budget`, value: `${Math.round(k / 1000)} MWh`, threshold: `${Math.round(cfg.targets.plantMonthlyKwh / 1000)} MWh` }, 1);
    }
  }
  // recent meter/data alerts
  push(DAYS - 1, { type: 'Meter data missing', severity: 'Medium', asset: 'EM-L12', department: 'Production', message: 'Line 12 meter intermittent – 8% samples missing (30 days)', value: '92%', threshold: '< 98%' }, 7);
  push(DAYS - 1, { type: 'Device offline', severity: 'Low', asset: 'EM-CHL-02', department: 'Utilities', message: 'Chiller 02 meter stale – last value 04:12', value: 'Stale 3 h', threshold: '> 15 min' }, 7);
  push(DAYS - 2, { type: 'High current', severity: 'Medium', asset: 'L04 Tunnel oven', department: 'Production', message: 'Phase R current 12% above rated during heat-up', value: '412 A', threshold: '> 368 A' }, 6);
  push(DAYS - 3, { type: 'High kW', severity: 'Low', asset: 'L13 Pulverizer', department: 'Production', message: 'kW 18% above typical during low throughput', value: '88 kW', threshold: '> 82 kW' }, 16);
  return out.sort((a, b) => b.d - a.d || a.severity.localeCompare(b.severity));
}

// ---------------- improvement projects ----------------
export interface Project {
  id: string; name: string; department: string; asset: string; problem: string; solution: string; baselineKwh: number; targetKwh: number; savingsKwh: number; savingsRs: number; co2: number;
  capex: number; payback: number; roi: number; owner: string; status: 'Idea' | 'Approved' | 'In Progress' | 'Implemented' | 'Verified'; date: string; actualKwh: number; verification: string;
}
const pj = (p: Omit<Project, 'savingsRs' | 'co2' | 'payback' | 'roi' | 'savingsKwh'> & { rate?: number }): Project => {
  const savingsKwh = p.baselineKwh - p.targetKwh;
  const savingsRs = savingsKwh * (p.rate ?? 9.1);
  return { ...p, savingsKwh, savingsRs, co2: (savingsKwh / 1000) * 0.716, payback: p.capex / savingsRs, roi: (savingsRs / p.capex) * 100 };
};
export const DEFAULT_PROJECTS: Project[] = [
  pj({ id: 'EIP-001', name: 'VFD on Line 05 oven blowers', department: 'Production', asset: 'L05 Baking oven', problem: 'Fixed-speed blowers run at full speed irrespective of bake load', solution: 'Install VFDs with zone-temperature feedback', baselineKwh: 1180000, targetKwh: 1100000, capex: 2200000, owner: 'Production Manager – Bakery', status: 'Verified', date: '2026-03-01', actualKwh: 84000, verification: 'M&V: IPMVP Option B – verified' }),
  pj({ id: 'EIP-002', name: 'Compressor sequencer & leak program', department: 'Utilities', asset: 'Compressed air system', problem: 'High unload hours and ~20% leakage', solution: 'Master controller + quarterly ultrasonic leak survey', baselineKwh: 3900000, targetKwh: 3550000, capex: 3500000, owner: 'Utility Manager', status: 'In Progress', date: '2026-12-15', actualKwh: 0, verification: 'Pending' }),
  pj({ id: 'EIP-003', name: 'Chiller sequencing optimisation', department: 'Utilities', asset: 'Chiller 01–03', problem: 'Chiller 02 (worst kW/TR) used as lead on night shift', solution: 'Efficiency-based lead/lag + condenser tube cleaning', baselineKwh: 4200000, targetKwh: 3950000, capex: 900000, owner: 'Utility Manager', status: 'Approved', date: '2026-12-01', actualKwh: 0, verification: 'Pending' }),
  pj({ id: 'EIP-004', name: 'HVAC schedule optimisation', department: 'Utilities', asset: 'AHU 01–05', problem: 'AHUs run 24×7 including non-production Sundays', solution: 'BMS schedule linked to production calendar', baselineKwh: 1200000, targetKwh: 1090000, capex: 450000, owner: 'Energy Manager', status: 'Implemented', date: '2026-08-10', actualKwh: 31000, verification: 'Under verification' }),
  pj({ id: 'EIP-005', name: 'Idle machine auto-shutdown (L04, L07, L13)', department: 'Production', asset: 'Ovens, plodder, pulverizer', problem: 'High standby energy when lines are not scheduled', solution: 'PLC interlock: standby mode after 15 min idle, shutdown when no order', baselineKwh: 760000, targetKwh: 560000, capex: 1200000, owner: 'Maintenance Lead', status: 'Approved', date: '2027-01-10', actualKwh: 0, verification: 'Pending' }),
  pj({ id: 'EIP-006', name: 'IE4 motor replacement – process pumps', department: 'Utilities', asset: 'Water & ETP pumps', problem: 'Old IE1 motors, 40% loaded', solution: 'Replace with right-sized IE4 motors', baselineKwh: 520000, targetKwh: 480000, capex: 1600000, owner: 'Maintenance Lead', status: 'Idea', date: '2027-03-01', actualKwh: 0, verification: '—' }),
  pj({ id: 'EIP-007', name: 'LED + daylight sensors – warehouse & hubs', department: 'Logistics', asset: 'Warehouse / Hub lighting', problem: 'Metal halide fixtures, no occupancy control', solution: 'LED high-bays with occupancy & daylight dimming', baselineKwh: 850000, targetKwh: 520000, capex: 2800000, owner: 'Logistics Head', status: 'In Progress', date: '2026-11-30', actualKwh: 0, verification: 'Pending' }),
  pj({ id: 'EIP-008', name: 'Steam trap survey & leakage reduction', department: 'Utilities', asset: 'Steam distribution', problem: 'Condensate recovery fell to ~59%', solution: 'Trap survey, replace failed traps, insulate valves', baselineKwh: 0, targetKwh: 0, capex: 650000, owner: 'Utility Manager', status: 'Approved', date: '2026-12-20', actualKwh: 0, verification: 'Pending (fuel savings ≈ 95,000 SCM/yr)' }),
  pj({ id: 'EIP-009', name: 'Cooling tower fan VFD', department: 'Utilities', asset: 'CT 01–03 fans', problem: 'Fans run at full speed in winter', solution: 'VFD with approach-temperature control', baselineKwh: 420000, targetKwh: 330000, capex: 750000, owner: 'Utility Manager', status: 'Idea', date: '2027-02-01', actualKwh: 0, verification: '—' }),
  pj({ id: 'EIP-010', name: 'APFC refurbishment & PF > 0.98', department: 'Electrical', asset: 'APFC panels', problem: 'Capacitor stage failures causing PF penalties', solution: 'Detuned capacitor banks + real-time thyristor switching', baselineKwh: 0, targetKwh: 0, capex: 1800000, owner: 'Electrical Head', status: 'In Progress', date: '2026-11-20', actualKwh: 0, verification: 'Savings in ₹ (penalty avoidance)' }),
  pj({ id: 'EIP-011', name: 'Line 04 tunnel oven recovery', department: 'Production', asset: 'L04 Tunnel oven', problem: 'SEC up ~15% since Sep 2026', solution: 'Burner tuning, insulation repair, door seal replacement', baselineKwh: 2100000, targetKwh: 1830000, capex: 950000, owner: 'Production Manager – Bakery', status: 'Idea', date: '2026-12-05', actualKwh: 0, verification: '—' }),
];
export { INCOMING };
