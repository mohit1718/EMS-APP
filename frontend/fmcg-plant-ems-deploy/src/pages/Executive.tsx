import { go } from '../store';
import { useMemo, useState } from 'react';
import { BUILDINGS, CATEGORIES, LINES, UTILITIES } from '../data/assets';
import { Config, dailyCo2, dailyCost, deptKwh, DEPARTMENTS, expectedPlantKwh, lineMetrics, pct, Range, sum, Granularity, plantRegression } from '../data/engine';
import { generateInsights } from '../data/insights';
import { BLD, CONS, DG_KWH, GRID, INCOMING, LINE, machineDay, PEAK_KVA, PF, PROD_TEQ, SOLAR_KWH, UTIL, UTIL_KWH, UTIL_TOTAL, PROD_KWH, BLD_TOTAL, EXPORT } from '../data/sim';
import { C, kwh, n0, n1, n2, PALETTE, pctS, rs, rsS } from '../format';
import { Combo, Donut, HBar, Kpi, PageHeader, Panel, SevBadge, Tabs } from '../components/ui';
import { bucketSeries, SankeyChart, SLink, SNode, spark, useView } from './common';

export function plantSankey(r: Range) {
  const nodes: SNode[] = [];
  const links: SLink[] = [];
  const n = (name: string, color?: string) => (nodes.push({ name, color }), nodes.length - 1);
  const grid = n('Grid import', C.blue), sol = n('Solar', C.amber), dg = n('Diesel gen.', C.grey);
  const inc = n('Plant incoming', '#3b6fd8');
  links.push({ source: grid, target: inc, value: sum(GRID, r.i0, r.i1) - sum(EXPORT, r.i0, r.i1) }, { source: sol, target: inc, value: sum(SOLAR_KWH, r.i0, r.i1) }, { source: dg, target: inc, value: sum(DG_KWH, r.i0, r.i1) });
  const prd = n('Production', C.cyan), utl = n('Utilities', C.violet), bld = n('Buildings & logistics', C.teal), loss = n('Losses / unaccounted', C.red);
  links.push({ source: inc, target: prd, value: sum(PROD_KWH, r.i0, r.i1) }, { source: inc, target: utl, value: sum(UTIL_TOTAL, r.i0, r.i1) }, { source: inc, target: bld, value: sum(BLD_TOTAL, r.i0, r.i1) }, { source: inc, target: loss, value: sum(INCOMING, r.i0, r.i1) - sum(CONS, r.i0, r.i1) });
  CATEGORIES.forEach((c, i) => {
    const id = n(c, PALETTE[i]);
    links.push({ source: prd, target: id, value: LINES.filter((l) => l.category === c).reduce((s, l) => s + sum(LINE[l.idx].kwh, r.i0, r.i1), 0) });
  });
  UTILITIES.forEach((u, i) => { const id = n(u.name, PALETTE[(i + 5) % PALETTE.length]); links.push({ source: utl, target: id, value: sum(UTIL_KWH[u.key], r.i0, r.i1) }); });
  const adm = n('Admin building'), wh = n('Warehouse'), hubs = n('Distribution hubs');
  links.push({ source: bld, target: adm, value: sum(BLD.ADM.kwh, r.i0, r.i1) }, { source: bld, target: wh, value: sum(BLD.WH.kwh, r.i0, r.i1) }, { source: bld, target: hubs, value: sum(BLD.HUB1.kwh, r.i0, r.i1) + sum(BLD.HUB2.kwh, r.i0, r.i1) + sum(BLD.HUB3.kwh, r.i0, r.i1) });
  return { nodes, links };
}

export function topConsumers(r: Range) {
  const lines = LINES.map((L) => ({ name: L.short, value: sum(LINE[L.idx].kwh, r.i0, r.i1), href: `#/line/${L.id}` })).sort((a, b) => b.value - a.value);
  const utils = UTILITIES.flatMap((u) => u.assets.map((a, i) => ({ name: a.name, value: sum(UTIL[u.key].kwh[i], r.i0, r.i1), href: `#/utilities/${u.key}` }))).sort((a, b) => b.value - a.value);
  const machines = LINES.flatMap((L) => L.machines.map((M, m) => { let v = 0; for (let d = r.i0; d <= r.i1; d++) v += machineDay(L.idx, m, d).kwh; return { name: `${L.id} ${M.name}`, value: v, href: `#/machine/${M.id}` }; })).sort((a, b) => b.value - a.value);
  const depts = [
    ...CATEGORIES.map((c) => ({ name: `Production – ${c}`, value: LINES.filter((l) => l.category === c).reduce((s, l) => s + sum(LINE[l.idx].kwh, r.i0, r.i1), 0), href: '#/production' })),
    ...UTILITIES.map((u) => ({ name: `Utilities – ${u.name}`, value: sum(UTIL_KWH[u.key], r.i0, r.i1), href: `#/utilities/${u.key}` })),
    ...BUILDINGS.map((b) => ({ name: b.name, value: sum(BLD[b.id].kwh, r.i0, r.i1), href: b.kind === 'Hub' ? '#/hubs' : '#/buildings' })),
  ].sort((a, b) => b.value - a.value);
  const blds = BUILDINGS.map((b) => ({ name: b.name, value: sum(BLD[b.id].kwh, r.i0, r.i1), href: b.kind === 'Hub' ? '#/hubs' : '#/buildings' })).sort((a, b) => b.value - a.value);
  return { lines, utils, machines, depts, blds };
}

export function budgetFor(r: Range, cfg: Config) {
  return (cfg.targets.plantMonthlyKwh / 30.4) * (r.i1 - r.i0 + 1);
}

export default function Executive() {
  const { r, cmp, P, Pc, cfg, gran, cmpLabel, filters } = useView();
  const [tg, setTg] = useState<Granularity>('day');
  const exp = useMemo(() => expectedPlantKwh(r, cfg), [r, cfg]);
  const vsBase = pct(P.cons, exp);
  const budget = budgetFor(r, cfg);
  const vsTarget = pct(P.cons, budget);
  const savings = (exp - P.cons) * P.cost.perKwh;
  const insights = useMemo(() => generateInsights(r, cmp, cfg).slice(0, 8), [r, cmp, cfg]);
  const tops = useMemo(() => topConsumers(r), [r]);
  const sk = useMemo(() => plantSankey(r), [r]);
  const reg = useMemo(() => plantRegression(cfg), [cfg]);
  const trendRange: Range = tg === 'day' ? { i0: Math.max(r.i0, r.i1 - 89), i1: r.i1 } : tg === 'week' ? { i0: Math.max(0, r.i1 - 7 * 26), i1: r.i1 } : { i0: 0, i1: r.i1 };
  const trend = useMemo(() => bucketSeries(trendRange, tg, { kwh: (d) => CONS[d], cost: (d) => dailyCost(d, cfg), teq: (d) => PROD_TEQ[d], exp: (d) => reg.a + reg.b * PROD_TEQ[d] }).map((x: any) => ({ ...x, intensity: x.kwh / x.teq, mwh: x.kwh / 1000, expMwh: x.exp / 1000, costL: x.cost / 1e5 })), [tg, r, cfg]);
  const [tc, setTc] = useState<'lines' | 'utils' | 'machines' | 'depts' | 'blds'>('lines');
  const k = (v: number) => kwh(v);
  const sp = (f: (d: number) => number) => spark({ i0: Math.max(0, r.i1 - 29 > r.i0 ? r.i0 : r.i1 - 29), i1: r.i1 }, f);
  return (
    <div>
      <PageHeader title="Executive Energy Dashboard" sub={`Plant Head · COO · CFO · Energy & Sustainability heads — ${P.days} days, ${cmpLabel}${filters.dept !== 'ALL' ? ' · department filter applies to Departments & Analytics views' : ''}`} />
      <div className="grid g5">
        <Kpi label="Total plant energy" value={k(P.cons)[0]} unit={k(P.cons)[1]} change={pct(P.cons, Pc?.cons)} prev={Pc ? k(Pc.cons).join(' ') : undefined} cmpLabel={cmpLabel} spark={sp((d) => CONS[d])} href="#/plant" />
        <Kpi label="Total energy cost" value={rs(P.cost.total)[0]} unit={rs(P.cost.total)[1]} change={pct(P.cost.total, Pc?.cost.total)} prev={Pc ? rsS(Pc.cost.total) : undefined} cmpLabel={cmpLabel} spark={sp((d) => dailyCost(d, cfg))} href="#/cost" />
        <Kpi label="Peak demand" value={n0(P.peakKva)} unit={`kVA · ${n0(P.peakKw)} kW`} change={pct(P.peakKva, Pc?.peakKva)} prev={Pc ? n0(Pc.peakKva) + ' kVA' : undefined} cmpLabel={cmpLabel} status={P.peakKva > cfg.targets.contractDemandKva ? 'bad' : P.peakKva > 0.9 * cfg.targets.contractDemandKva ? 'warn' : 'good'} spark={sp((d) => PEAK_KVA[d])} href="#/electrical" />
        <Kpi label="Average power factor" value={n2(P.pf)} change={pct(P.pf, Pc?.pf)} lowerIsBetter={false} prev={Pc ? n2(Pc.pf) : undefined} cmpLabel={cmpLabel} status={P.pf < cfg.tariff.pfThreshold ? 'bad' : 'good'} spark={sp((d) => PF[d])} href="#/electrical" />
        <Kpi label="Energy intensity (normalised)" value={n0(P.intensity)} unit="kWh/t-eq" change={pct(P.intensity, Pc?.intensity)} prev={Pc ? n0(Pc.intensity) : undefined} cmpLabel={cmpLabel} spark={sp((d) => CONS[d] / Math.max(1, PROD_TEQ[d]))} href="#/intel" title="Mixed products normalised to tonne-equivalent with configurable factors" />
        <Kpi label="Energy vs baseline" value={pctS(vsBase)} unit="vs production-normalised" change={vsBase} cmpLabel={`expected ${k(exp).join(' ')}`} status={vsBase! > 2 ? 'bad' : vsBase! > 0 ? 'warn' : 'good'} href="#/targets" />
        <Kpi label="Energy vs target / budget" value={pctS(vsTarget)} unit="vs budget" change={vsTarget} cmpLabel={`budget ${k(budget).join(' ')}`} status={vsTarget! > 3 ? 'bad' : vsTarget! > 0 ? 'warn' : 'good'} href="#/targets" />
        <Kpi label="Renewable contribution" value={n1(P.renewablePct)} unit="%" change={pct(P.renewablePct, Pc?.renewablePct)} lowerIsBetter={false} prev={Pc ? n1(Pc.renewablePct) + '%' : undefined} cmpLabel={cmpLabel} spark={sp((d) => SOLAR_KWH[d])} href="#/electrical" />
        <Kpi label="Carbon emissions" value={n0(P.co2.total)} unit="tCO₂e" change={pct(P.co2.total, Pc?.co2.total)} prev={Pc ? n0(Pc.co2.total) : undefined} cmpLabel={cmpLabel} spark={sp((d) => dailyCo2(d, cfg))} href="#/carbon" />
        <Kpi label="Energy savings vs baseline" value={rs(savings)[0]} unit={rs(savings)[1]} change={null} cmpLabel={savings >= 0 ? 'saved vs expected' : 'overspend vs expected'} status={savings >= 0 ? 'good' : 'bad'} href="#/projects" />
      </div>

      <div className="grid g3 mt">
        <Panel title="Plant energy flow (Sankey)" sub="Sources → plant → departments → systems, period total" className="span2" actions={<a href="#/tree" className="btn small">Energy hierarchy →</a>}>
          <SankeyChart nodes={sk.nodes} links={sk.links} height={420} />
        </Panel>
        <div className="grid" style={{ gap: 12 }}>
          <Panel title="Department-wise energy" sub="Share of accounted consumption">
            <Donut height={150} data={DEPARTMENTS.map((d, i) => ({ name: d.name, value: deptKwh(d.id, r), color: PALETTE[i] }))} center={k(P.cons).join(' ')} />
          </Panel>
          <Panel title="Energy source mix">
            <Donut height={110} data={[{ name: 'Grid', value: P.grid - P.exported, color: C.blue }, { name: 'Solar', value: P.solar, color: C.amber }, { name: 'Diesel generator', value: P.dg, color: C.grey }]} />
          </Panel>
        </div>
      </div>

      <div className="grid g3 mt">
        <Panel title="Energy performance trend" sub="Consumption (MWh) vs production-normalised baseline and cost" className="span2" actions={<Tabs tabs={[{ key: 'day', label: 'Daily' }, { key: 'week', label: 'Weekly' }, { key: 'month', label: 'Monthly' }, { key: 'quarter', label: 'Quarterly' }]} value={tg} onChange={setTg} />}>
          <Combo data={trend} series={[{ key: 'mwh', name: 'Energy (MWh)', color: C.blue }, { key: 'expMwh', name: 'Baseline expected (MWh)', type: 'line', color: C.amber, dashed: true }, { key: 'costL', name: 'Cost (₹ lakh)', type: 'line', color: C.green, axis: 'right' }]} height={250} digits={1} y2Label="₹ lakh" />
        </Panel>
        <Panel title="Production vs utilities vs buildings" sub="Share of accounted energy">
          <Donut height={150} data={[{ name: 'Production', value: P.prod, color: C.cyan }, { name: 'Utilities', value: P.util, color: C.violet }, { name: 'Buildings & logistics', value: P.bld, color: C.teal }]} />
          <div className="mt" style={{ height: 90 }}>
            <Combo data={trend.slice(-24)} series={[{ key: 'intensity', name: 'kWh/t-eq', type: 'line', color: C.cyan }]} height={90} legend={false} />
          </div>
          <div className="muted" style={{ fontSize: 11 }}>Energy intensity trend (kWh per tonne-equivalent)</div>
        </Panel>
      </div>

      <div className="grid g2 mt">
        <Panel title="Top 10 energy consumers" actions={<Tabs tabs={[{ key: 'lines', label: 'Lines' }, { key: 'utils', label: 'Utilities' }, { key: 'machines', label: 'Machines' }, { key: 'depts', label: 'Departments' }, { key: 'blds', label: 'Buildings / Hubs' }]} value={tc} onChange={setTc} />}>
          <HBar data={tops[tc].slice(0, 10)} unit="kWh" onClick={(d) => d.href && go(d.href)} labelWidth={190} />
          <div className="muted" style={{ fontSize: 11 }}>Click a bar to drill down.</div>
        </Panel>
        <Panel title="Energy insights" sub="Calculated automatically from the dataset for the selected period" actions={<a className="btn small" href="#/insights">All insights →</a>}>
          {insights.map((i) => (
            <div key={i.id} className="row" style={{ alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid #142d57', flexWrap: 'nowrap' }}>
              <SevBadge s={i.severity} />
              <div style={{ minWidth: 0 }}>
                <a href={i.link ?? '#/insights'} style={{ color: 'var(--text)' }}>{i.title}</a>
                <div className="muted" style={{ fontSize: 11.5 }}>{i.category}{i.costImpact > 0 ? ` · impact ≈ ${rsS(i.costImpact)}` : ''}</div>
              </div>
            </div>
          ))}
        </Panel>
      </div>
      <div className="muted mt" style={{ fontSize: 11 }}>Granularity setting: {gran}. All figures simulated.</div>
    </div>
  );
}
void UTIL;
