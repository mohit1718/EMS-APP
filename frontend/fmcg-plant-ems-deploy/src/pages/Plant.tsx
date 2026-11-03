import { useMemo, useState } from 'react';
import { BUILDINGS, CATEGORIES, LINES, PLANT, UTILITIES } from '../data/assets';
import { baselineRange, dailyCost, deptKwh, DEPARTMENTS, lineMetrics, pct, Range, sum, safeDiv } from '../data/engine';
import { BLD, CONS, DATES, DG_KWH, DOW, EXPORT, GRID, INCOMING, LINE, LOSSPCT, machineDay, PEAK_KVA, PEAK_KW, plantHourly, PROD_TEQ, SOLAR_KWH, UTIL, UTIL_KWH, PROD_KWH, UTIL_TOTAL, BLD_TOTAL, HUB2_METER_OFFLINE } from '../data/sim';
import { ELECTRIC_METERS } from '../data/meters';
import { C, kwh, kwhS, n0, n1, n2, PALETTE, pctS, rs, rsS } from '../format';
import { Badge, Combo, DataTable, Heatmap, HBar, Kpi, PageHeader, Panel, Tabs, Donut } from '../components/ui';
import { bucketSeries, SankeyChart, spark, useView } from './common';
import { plantSankey } from './Executive';
import { useStore } from '../store';

export function PlantOverview() {
  const { r, P, Pc, cfg, gran, cmpLabel } = useView();
  const series = useMemo(() => bucketSeries(r, gran, { grid: (d) => GRID[d] - EXPORT[d], solar: (d) => SOLAR_KWH[d], dg: (d) => DG_KWH[d], cons: (d) => CONS[d], inc: (d) => INCOMING[d], prod: (d) => PROD_KWH[d], util: (d) => UTIL_TOTAL[d], bld: (d) => BLD_TOTAL[d] }), [r, gran]);
  const peak = useMemo(() => bucketSeries(r, gran, { kva: (d) => PEAK_KVA[d], kw: (d) => PEAK_KW[d] }, 'max'), [r, gran]);
  const prof = useMemo(() => {
    const avg = new Array(24).fill(0);
    const n = r.i1 - r.i0 + 1;
    for (let d = r.i0; d <= r.i1; d++) plantHourly(d).forEach((v, h) => (avg[h] += v / n));
    const last = plantHourly(r.i1);
    return avg.map((v, h) => ({ label: `${String(h).padStart(2, '0')}:00`, avg: v, last: last[h] }));
  }, [r]);
  const heat = useMemo(() => {
    const vals = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const cnt = new Array(7).fill(0);
    for (let d = r.i0; d <= r.i1; d++) {
      const w = (DOW[d] + 6) % 7;
      cnt[w]++;
      plantHourly(d).forEach((v, h) => (vals[w][h] += v));
    }
    return vals.map((row, w) => row.map((v) => (cnt[w] ? v / cnt[w] : 0)));
  }, [r]);
  const sk = useMemo(() => plantSankey(r), [r]);
  const gen = P.solar + P.dg;
  const unacc = P.incoming - P.cons - P.exported;
  const k = (v: number) => kwh(v);
  return (
    <div>
      <PageHeader title="Plant Energy Overview" sub={`${PLANT.name} · ${P.days} days · ${cmpLabel}`} actions={<a className="btn" href="#/tree">Drill down hierarchy →</a>} />
      <div className="grid g6">
        <Kpi label="Total incoming energy" value={k(P.incoming)[0]} unit={k(P.incoming)[1]} change={pct(P.incoming, Pc?.incoming)} cmpLabel={cmpLabel} spark={spark(r, (d) => INCOMING[d])} />
        <Kpi label="Total energy consumed" value={k(P.cons)[0]} unit={k(P.cons)[1]} change={pct(P.cons, Pc?.cons)} cmpLabel={cmpLabel} spark={spark(r, (d) => CONS[d])} href="#/departments" />
        <Kpi label="Energy generated on-site" value={k(gen)[0]} unit={k(gen)[1]} change={pct(gen, Pc ? Pc.solar + Pc.dg : null)} lowerIsBetter={false} cmpLabel={cmpLabel} />
        <Kpi label="Energy exported" value={k(P.exported)[0]} unit={k(P.exported)[1]} change={pct(P.exported, Pc?.exported)} lowerIsBetter={false} cmpLabel={cmpLabel} status="info" />
        <Kpi label="DG generation" value={k(P.dg)[0]} unit={k(P.dg)[1]} change={pct(P.dg, Pc?.dg)} cmpLabel={cmpLabel} href="#/electrical" />
        <Kpi label="Solar generation" value={k(P.solar)[0]} unit={k(P.solar)[1]} change={pct(P.solar, Pc?.solar)} lowerIsBetter={false} cmpLabel={cmpLabel} spark={spark(r, (d) => SOLAR_KWH[d])} href="#/electrical" />
        <Kpi label="Total energy cost" value={rs(P.cost.total)[0]} unit={rs(P.cost.total)[1]} change={pct(P.cost.total, Pc?.cost.total)} cmpLabel={cmpLabel} href="#/cost" />
        <Kpi label="Peak demand" value={n0(P.peakKva)} unit="kVA" change={pct(P.peakKva, Pc?.peakKva)} cmpLabel={cmpLabel} status={P.peakKva > cfg.targets.contractDemandKva ? 'bad' : 'good'} />
        <Kpi label="Plant load factor" value={n1(P.loadFactor)} unit="%" change={pct(P.loadFactor, Pc?.loadFactor)} lowerIsBetter={false} cmpLabel={cmpLabel} title="Average kW / peak kW" />
        <Kpi label="Power factor" value={n2(P.pf)} change={pct(P.pf, Pc?.pf)} lowerIsBetter={false} cmpLabel={cmpLabel} status={P.pf < cfg.tariff.pfThreshold ? 'bad' : 'good'} />
        <Kpi label="Energy balance (unaccounted)" value={n1((unacc / P.incoming) * 100)} unit="%" change={pct(unacc, Pc ? Pc.incoming - Pc.cons - Pc.exported : null)} cmpLabel={cmpLabel} status={unacc / P.incoming > 0.03 ? 'warn' : 'good'} href="#/quality" title="Incoming − department-level metered − export" />
        <Kpi label="Energy intensity" value={n0(P.intensity)} unit="kWh/t-eq" change={pct(P.intensity, Pc?.intensity)} cmpLabel={cmpLabel} href="#/intel" />
      </div>
      <div className="grid g3 mt">
        <Panel title="Plant energy trend by source" sub="Grid vs DG vs Solar (stacked) with accounted consumption" className="span2">
          <Combo data={series} series={[{ key: 'grid', name: 'Grid (net)', stack: 's', color: C.blue }, { key: 'solar', name: 'Solar', stack: 's', color: C.amber }, { key: 'dg', name: 'DG', stack: 's', color: C.grey }, { key: 'cons', name: 'Consumed (sub-metered)', type: 'line', color: C.cyan }]} height={260} />
        </Panel>
        <Panel title="Incoming vs outgoing energy" sub="Where incoming energy goes">
          <Donut height={150} data={[{ name: 'Production', value: P.prod, color: C.cyan }, { name: 'Utilities', value: P.util, color: C.violet }, { name: 'Buildings & logistics', value: P.bld, color: C.teal }, { name: 'Losses / unaccounted', value: unacc, color: C.red }, { name: 'Exported', value: P.exported, color: C.amber }]} />
          <div className="note mt">Incoming {kwhS(P.incoming)} = Grid {kwhS(P.grid)} + DG {kwhS(P.dg)} + Solar {kwhS(P.solar)}. Accounted {kwhS(P.cons)}, export {kwhS(P.exported)}, difference {kwhS(unacc)} ({n1((unacc / P.incoming) * 100)}%).</div>
        </Panel>
      </div>
      <div className="grid g2 mt">
        <Panel title="Hourly load profile" sub="Average kW by hour for the period vs the last day in range">
          <Combo data={prof} series={[{ key: 'avg', name: 'Period average (kW)', type: 'area', color: C.blue }, { key: 'last', name: `${DATES[r.i1]} (kW)`, type: 'line', color: C.amber }]} height={240} />
        </Panel>
        <Panel title="Daily peak demand profile" sub="Max kVA / kW per bucket vs contract demand">
          <Combo data={peak} series={[{ key: 'kva', name: 'Peak kVA', color: C.violet }, { key: 'kw', name: 'Peak kW', type: 'line', color: C.cyan }]} refLines={[{ y: cfg.targets.contractDemandKva, label: `Contract ${cfg.targets.contractDemandKva} kVA`, color: C.red }]} height={240} />
        </Panel>
      </div>
      <div className="grid g2 mt">
        <Panel title="Energy consumption heatmap" sub="Average kW by weekday and hour">
          <Heatmap rows={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']} cols={Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))} values={heat} unit="kW" />
        </Panel>
        <Panel title="Department-wise energy trend">
          <Combo data={series} series={[{ key: 'prod', name: 'Production', stack: 'd', color: C.cyan }, { key: 'util', name: 'Utilities', stack: 'd', color: C.violet }, { key: 'bld', name: 'Buildings & logistics', stack: 'd', color: C.teal }]} height={240} />
        </Panel>
      </div>
      <Panel title="Energy balance (Sankey)" className="mt" sub="Click Energy Hierarchy for asset-level drill-down">
        <SankeyChart nodes={sk.nodes} links={sk.links} height={340} />
      </Panel>
      <Panel title="Drill down to departments" className="mt">
        <div className="grid g4">
          {DEPARTMENTS.map((d) => {
            const v = deptKwh(d.id, r);
            const c = useStore;
            void c;
            return (
              <a key={d.id} className="kpi click" href={`#/departments/${d.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                <div className="kpi-l"><span>{d.name}</span><span>{n1((v / P.cons) * 100)}%</span></div>
                <div className="kpi-v">{kwh(v)[0]}<small>{kwh(v)[1]}</small></div>
                <div className="kpi-c"><span>{rsS(v * P.cost.perKwh)}</span><span>open →</span></div>
              </a>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

// ---------------- Energy hierarchy tree ----------------
interface TNode { id: string; name: string; kwh: number; prev: number | null; kids?: TNode[]; href?: string; tag?: string }
function sumR(fn: (d: number) => number, r: Range) { let s = 0; for (let d = r.i0; d <= r.i1; d++) s += fn(d); return s; }

function buildConsumptionTree(r: Range, c: Range | null): TNode {
  const both = (fn: (d: number) => number) => ({ kwh: sumR(fn, r), prev: c ? sumR(fn, c) : null });
  const prodKids: TNode[] = CATEGORIES.map((cat) => {
    const lines = LINES.filter((l) => l.category === cat).map((L) => ({
      id: L.id, name: L.name, href: `#/line/${L.id}`, ...both((d) => LINE[L.idx].kwh[d]),
      kids: [
        ...L.machines.filter((m) => m.active).map((M, m) => ({ id: M.id, name: M.name, href: `#/machine/${M.id}`, tag: `${M.ratedKw} kW`, ...both((d) => machineDay(L.idx, L.machines.indexOf(M), d).kwh) })),
      ],
    }));
    return { id: cat, name: cat, kwh: lines.reduce((s, x) => s + x.kwh, 0), prev: c ? lines.reduce((s, x) => s + (x.prev ?? 0), 0) : null, kids: lines };
  });
  const utilKids: TNode[] = UTILITIES.map((u) => ({ id: u.key, name: u.name, href: `#/utilities/${u.key}`, ...both((d) => UTIL_KWH[u.key][d]), kids: u.assets.map((a, i) => ({ id: a.id, name: a.name, tag: `${a.ratedKw} kW`, ...both((d) => UTIL[u.key].kwh[i][d]) })) }));
  const bldKids: TNode[] = BUILDINGS.map((b) => ({ id: b.id, name: b.name, href: b.kind === 'Hub' ? '#/hubs' : '#/buildings', ...both((d) => BLD[b.id].kwh[d]), kids: b.assets.map((a) => ({ id: b.id + a.name, name: a.name, tag: a.group, ...both((d) => BLD[b.id].kwh[d] * a.share) })) }));
  const prod = { id: 'PRD', name: 'Production Department', kwh: prodKids.reduce((s, x) => s + x.kwh, 0), prev: c ? prodKids.reduce((s, x) => s + (x.prev ?? 0), 0) : null, kids: prodKids, href: '#/production' };
  const util = { id: 'UTL', name: 'Utilities Department', ...both((d) => UTIL_TOTAL[d]), kids: utilKids, href: '#/utilities' };
  const bld = { id: 'BLD', name: 'Buildings, Warehouse & Hubs', ...both((d) => BLD_TOTAL[d]), kids: bldKids, href: '#/buildings' };
  const loss = { id: 'LOSS', name: 'Distribution losses & unaccounted', ...both((d) => INCOMING[d] - CONS[d]), href: '#/quality' };
  return { id: 'PLANT', name: PLANT.name, ...both((d) => INCOMING[d]), kids: [prod, util, bld, loss] };
}

function buildMeterTree(r: Range, c: Range | null): TNode {
  const ms = ELECTRIC_METERS.filter((m) => m.level !== 'Generation');
  const mk = (id: string): TNode => {
    const m = ms.find((x) => x.id === id)!;
    const kids = ms.filter((x) => x.parent === id).map((x) => mk(x.id));
    return { id, name: `${m.id} · ${m.name}`, kwh: sumR(m.daily, r), prev: c ? sumR(m.daily, c) : null, kids: kids.length ? kids : undefined, tag: m.level, href: '#/meters/' + m.id };
  };
  return mk('EM-MAIN-01');
}

function TreeRows({ node, depth, open, toggle, parentKwh }: { node: TNode; depth: number; open: Set<string>; toggle: (id: string) => void; parentKwh: number }) {
  const isOpen = open.has(node.id);
  const ch = pct(node.kwh, node.prev);
  return (
    <>
      <div className="tree-row">
        <div className="tree-name" style={{ paddingLeft: depth * 18 }}>
          {node.kids?.length ? <button className="tg" onClick={() => toggle(node.id)}>{isOpen ? '−' : '+'}</button> : <span style={{ width: 18 }} />}
          {node.href ? <a href={node.href} style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</a> : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>}
          {node.tag && <Badge kind="grey">{node.tag}</Badge>}
        </div>
        <div className="right mono">{kwhS(node.kwh)}</div>
        <div className="tree-bar"><div style={{ width: `${Math.min(100, (node.kwh / (parentKwh || node.kwh)) * 100)}%` }} /></div>
        <div className="right">{n1((node.kwh / (parentKwh || node.kwh)) * 100)}%</div>
        <div className={'right ' + (ch == null ? 'neutral' : ch > 1 ? 'up-bad' : ch < -1 ? 'up-good' : 'neutral')}>{pctS(ch)}</div>
      </div>
      {isOpen && node.kids?.map((k) => <TreeRows key={k.id} node={k} depth={depth + 1} open={open} toggle={toggle} parentKwh={node.kwh} />)}
    </>
  );
}

export function EnergyTree() {
  const { r, cmp, cmpLabel } = useView();
  const [mode, setMode] = useState<'cons' | 'elec'>('cons');
  const [open, setOpen] = useState<Set<string>>(new Set(['PLANT', 'PRD', 'EM-MAIN-01']));
  const tree = useMemo(() => (mode === 'cons' ? buildConsumptionTree(r, cmp) : buildMeterTree(r, cmp)), [r, cmp, mode]);
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandAll = () => { const s = new Set<string>(); const walk = (n: TNode) => { s.add(n.id); n.kids?.forEach(walk); }; walk(tree); setOpen(s); };
  return (
    <div>
      <PageHeader title="Energy Hierarchy / Energy Tree" sub="Enterprise → Plant → Distribution → Department → Area → Line → Machine → Equipment" actions={<><button className="btn small" onClick={expandAll}>Expand all</button><button className="btn small" onClick={() => setOpen(new Set(['PLANT']))}>Collapse</button></>} />
      <Tabs tabs={[{ key: 'cons', label: 'Consumption hierarchy (departments & assets)' }, { key: 'elec', label: 'Electrical distribution (meter tree)' }]} value={mode} onChange={setMode} />
      <Panel>
        <div className="tree-row" style={{ color: 'var(--muted)', fontSize: 11.5, fontWeight: 600 }}>
          <div>Asset / meter</div><div className="right">Energy</div><div>Share of parent</div><div className="right">% parent</div><div className="right">{cmpLabel}</div>
        </div>
        <div style={{ paddingLeft: 0 }}>
          <div className="tree-row"><div className="tree-name"><Badge kind="info">Enterprise</Badge> Sample FMCG Enterprise Ltd. (1 plant)</div><div className="right mono">{kwhS(tree.kwh)}</div><div /><div /><div /></div>
          <TreeRows node={tree} depth={1} open={open} toggle={toggle} parentKwh={tree.kwh} />
        </div>
        {mode === 'elec' && <div className="note mt">Machine meters cover only major machines (≥ 15 kW). The gap between a line meter and its machine meters is unmetered small loads, not a loss. Plant totals use department-level meters only, so parent and child meters are never double counted.</div>}
      </Panel>
    </div>
  );
}

// ---------------- Departments ----------------
export function Departments({ id }: { id?: string }) {
  const { r, cmp, P, cfg, gran, cmpLabel, alerts } = useView();
  const dept = DEPARTMENTS.find((d) => d.id === (id ?? 'PRD')) ?? DEPARTMENTS[0];
  const kw = deptKwh(dept.id, r);
  const pv = cmp ? deptKwh(dept.id, cmp) : null;
  const b = baselineRange(cfg);
  const baseDaily = deptKwh(dept.id, b) / (b.i1 - b.i0 + 1);
  const baseKwh = baseDaily * (r.i1 - r.i0 + 1);
  const target = baseKwh * (1 - cfg.targets.lineSecPct / 100);
  const teq = sum(PROD_TEQ, r.i0, r.i1);
  const bld = BUILDINGS.find((x) => x.id === dept.id);
  const intensity = dept.id === 'PRD' || dept.id === 'UTL' ? { v: kw / teq, u: 'kWh/t-eq' } : dept.id === 'ADM' ? { v: kw / bld!.areaM2, u: 'kWh/m²' } : { v: kw / sum(BLD[dept.id].act, r.i0, r.i1), u: 'kWh/pallet' };
  let pk = 0; for (let d = r.i0; d <= r.i1; d++) pk = Math.max(pk, (dept.series(d) / 24) * 1.28);
  const trend = bucketSeries(r, gran, { kwh: dept.series, base: () => baseDaily });
  // abnormal days (> mean + 2σ)
  const vals: number[] = []; for (let d = r.i0; d <= r.i1; d++) vals.push(dept.series(d));
  const mean = vals.reduce((a, b2) => a + b2, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
  const abn = vals.map((v, i) => ({ d: r.i0 + i, v })).filter((x) => x.v > mean + 2 * sd);
  let tops: { name: string; value: number }[] = [];
  if (dept.id === 'PRD') tops = LINES.map((L) => ({ name: L.short, value: sum(LINE[L.idx].kwh, r.i0, r.i1) }));
  else if (dept.id === 'UTL') tops = UTILITIES.map((u) => ({ name: u.name, value: sum(UTIL_KWH[u.key], r.i0, r.i1) }));
  else tops = bld!.assets.map((a) => ({ name: a.name, value: sum(BLD[bld!.id].kwh, r.i0, r.i1) * a.share }));
  tops.sort((a, b2) => b2.value - a.value);
  const deptAlerts = alerts.filter((a) => a.d >= r.i0 && a.d <= r.i1 && (dept.id === 'PRD' ? a.department === 'Production' : dept.id === 'UTL' ? a.department === 'Utilities' : a.department === dept.name || a.asset.includes(dept.id))).slice(0, 8);
  const compare = DEPARTMENTS.map((d, i) => ({ name: d.name, value: deptKwh(d.id, r), color: d.id === dept.id ? C.cyan : PALETTE[i] }));
  const estimated = dept.id === 'HUB2' && [...HUB2_METER_OFFLINE].some((d) => d >= r.i0 && d <= r.i1);
  return (
    <div>
      <PageHeader title={`Department: ${dept.name}`} sub={`${cmpLabel} · baseline ${cfg.baseline.from} → ${cfg.baseline.to}`} crumbs={[{ label: 'Plant', href: '#/plant' }, { label: 'Departments' }, { label: dept.name }]} />
      <div className="row" style={{ marginBottom: 12 }}>
        {DEPARTMENTS.map((d) => <a key={d.id} href={`#/departments/${d.id}`} className={'chip' + (d.id === dept.id ? ' on' : '')} style={{ textDecoration: 'none' }}>{d.name}</a>)}
      </div>
      <div className="grid g6">
        <Kpi label="Total energy" value={kwh(kw)[0]} unit={kwh(kw)[1]} change={pct(kw, pv)} cmpLabel={cmpLabel} spark={spark(r, dept.series)} tag={estimated ? <Badge kind="est">EST</Badge> : undefined} />
        <Kpi label="Energy cost" value={rs(kw * P.cost.perKwh)[0]} unit={rs(kw * P.cost.perKwh)[1]} change={pct(kw, pv)} cmpLabel={cmpLabel} title="Allocated at plant blended ₹/kWh" />
        <Kpi label="Energy intensity" value={n2(intensity.v)} unit={intensity.u} change={null} cmpLabel="see trend" status="info" />
        <Kpi label="Energy vs target" value={pctS(pct(kw, target))} change={pct(kw, target)} cmpLabel={`target ${kwhS(target)}`} />
        <Kpi label="Energy vs baseline" value={pctS(pct(kw, baseKwh))} change={pct(kw, baseKwh)} cmpLabel={`baseline ${kwhS(baseKwh)}`} />
        <Kpi label="Peak demand (est.)" value={n0(pk)} unit="kW" change={null} cmpLabel={`share of plant ${n1((kw / P.cons) * 100)}%`} status="info" tag={<Badge kind="est">EST</Badge>} />
      </div>
      {estimated && <div className="note mt">⚠ Hub 02 main meter was offline for part of this period. Missing days are estimated from the 7-day average and flagged as EST.</div>}
      <div className="grid g3 mt">
        <Panel title="Energy trend vs baseline" className="span2"><Combo data={trend} series={[{ key: 'kwh', name: 'kWh', color: C.blue }, { key: 'base', name: 'Baseline daily avg × days', type: 'line', color: C.amber, dashed: true }]} height={250} /></Panel>
        <Panel title="Top consumers"><HBar data={tops.slice(0, 10)} unit="kWh" labelWidth={160} /></Panel>
      </div>
      <div className="grid g3 mt">
        <Panel title="Department comparison" sub="All departments, same period"><HBar data={compare} unit="kWh" labelWidth={150} /></Panel>
        <Panel title="Abnormal consumption days" sub={`Days above mean + 2σ (${kwhS(mean + 2 * sd)})`}>
          <DataTable cols={[{ key: 'date', label: 'Date', value: (x: any) => DATES[x.d] }, { key: 'v', label: 'kWh', num: true }, { key: 'dev', label: 'vs mean', num: true, render: (x: any) => pctS(pct(x.v, mean)) , value: (x: any) => x.v - mean}]} rows={abn} maxHeight={220} />
        </Panel>
        <Panel title="Energy alerts" sub="Alerts raised for this department in the period">
          {deptAlerts.length ? deptAlerts.map((a) => <div key={a.id} className="row" style={{ padding: '4px 0', borderBottom: '1px solid #142d57', flexWrap: 'nowrap' }}><Badge kind={a.severity === 'Critical' ? 'crit' : a.severity === 'High' ? 'high' : 'med'}>{a.severity}</Badge><span style={{ fontSize: 12 }}>{a.time.slice(0, 10)} · {a.message}</span></div>) : <div className="muted">No alerts in period.</div>}
          <a href="#/alerts" className="btn small mt">Alert centre →</a>
        </Panel>
      </div>
    </div>
  );
}
export { lineMetrics, dailyCost, safeDiv, LOSSPCT };
