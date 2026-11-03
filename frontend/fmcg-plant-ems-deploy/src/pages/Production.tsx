import { go } from '../store';
import { useMemo, useState } from 'react';
import { CATEGORIES, LINES, LineDef } from '../data/assets';
import { buckets, lineBaselineSec, lineMetrics, lineTargetSec, pct, Range, safeDiv, sum } from '../data/engine';
import { DATES, DAYS, LINE, lineHourly, machineDay, NS, STATES, shiftShares, UTIL_TOTAL, PROD_KWH, PROD_TEQ } from '../data/sim';
import { hash01 } from '../data/rng';
import { meterById, registerRows } from '../data/meters';
import { C, kwh, kwhS, n0, n1, n2, PALETTE, pctS, rs, rsS } from '../format';
import { Badge, Combo, DataTable, Donut, HBar, Kpi, PageHeader, Panel, Scatter2, Stat, Tabs } from '../components/ui';
import { bucketSeries, spark, useView } from './common';

const STATE_COLORS = [C.green, C.amber, '#60a5fa', C.violet, '#64748b', C.red, '#be123c', '#94a3b8', C.teal, '#334155'];

// ---------------- lines overview ----------------
export function ProductionLines() {
  const { r, cmp, cfg, filters, P, cmpLabel } = useView();
  const rows = useMemo(() => LINES.filter((L) => filters.category === 'ALL' || L.category === filters.category).map((L) => {
    const m = lineMetrics(L.idx, r, filters.shift);
    const c = cmp ? lineMetrics(L.idx, cmp, filters.shift) : null;
    const base = lineBaselineSec(L.idx, cfg), tgt = lineTargetSec(L.idx, cfg);
    return { L, id: L.id, name: L.short, cat: L.category, kwh: m.kwh, good: m.good, unit: L.unit, sec: m.sec, secUnit: L.secUnit, base, tgt, vsT: pct(m.sec, tgt), vsB: pct(m.sec, base), ch: pct(m.kwh, c?.kwh), idle: safeDiv(m.nonProdKwh, m.kwh) * 100, util: safeDiv(m.runH, m.availableH) * 100, cost: m.kwh * P.cost.perKwh };
  }), [r, cmp, cfg, filters.category, filters.shift]);
  const tot = rows.reduce((s, x) => s + x.kwh, 0);
  return (
    <div>
      <PageHeader title="Production Energy Intelligence" sub={`${rows.length} production lines${filters.shift != null ? ` · Shift ${'ABC'[filters.shift]}` : ''}${filters.category !== 'ALL' ? ' · ' + filters.category : ''} · ${cmpLabel}`} actions={<><a className="btn" href="#/intel">Energy vs production →</a><a className="btn" href="#/benchmark">Benchmarking →</a></>} />
      <div className="grid g4">
        <Kpi label="Production energy" value={kwh(tot)[0]} unit={kwh(tot)[1]} change={null} cmpLabel={`${n1((tot / P.cons) * 100)}% of plant`} status="info" />
        <Kpi label="Lines above SEC target" value={String(rows.filter((x) => (x.vsT ?? 0) > 0).length)} unit={`of ${rows.length}`} change={null} cmpLabel="SEC > target" status={rows.filter((x) => (x.vsT ?? 0) > 5).length ? 'warn' : 'good'} />
        <Kpi label="Non-production energy" value={n1(rows.reduce((s, x) => s + (x.idle * x.kwh) / 100, 0) / tot * 100)} unit="%" change={null} cmpLabel="Idle, standby, changeover, cleaning…" status="warn" href="#/losses" />
        <Kpi label="Production energy cost" value={rs(tot * P.cost.perKwh)[0]} unit={rs(tot * P.cost.perKwh)[1]} change={null} cmpLabel={`@ ${n2(P.cost.perKwh)} ₹/kWh blended`} status="info" />
      </div>
      {CATEGORIES.filter((c) => filters.category === 'ALL' || c === filters.category).map((cat) => (
        <Panel key={cat} title={cat} className="mt" sub="Click a line card to open its dashboard">
          <div className="grid g5">
            {rows.filter((x) => x.cat === cat).map((x) => (
              <a key={x.id} href={`#/line/${x.id}`} className="kpi click" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                <div className="kpi-l"><span>{x.name}</span><span className="status-dot" style={{ background: (x.vsT ?? 0) > 8 ? C.red : (x.vsT ?? 0) > 0 ? C.amber : C.green }} /></div>
                <div className="kpi-v">{n2(x.sec)}<small>{x.secUnit}</small></div>
                <div className="kpi-c"><span className={(x.vsT ?? 0) > 0 ? 'up-bad' : 'up-good'}>{pctS(x.vsT)} vs target</span><span>{kwhS(x.kwh)}</span></div>
                <div className="kpi-spark"><SparkLine l={x.L.idx} r={r} /></div>
              </a>
            ))}
          </div>
        </Panel>
      ))}
      <Panel title="Line energy table" className="mt">
        <DataTable exportName="line-energy" onRow={(x: any) => go(`#/line/${x.id}`)} cols={[
          { key: 'name', label: 'Line' }, { key: 'cat', label: 'Category' }, { key: 'kwh', label: 'Energy kWh', num: true, bar: true }, { key: 'ch', label: cmpLabel, num: true, render: (x: any) => <span className={(x.ch ?? 0) > 0 ? 'up-bad' : 'up-good'}>{pctS(x.ch)}</span> },
          { key: 'good', label: 'Good production', num: true, render: (x: any) => `${n0(x.good)} ${x.unit}` }, { key: 'sec', label: 'SEC', num: true, render: (x: any) => n2(x.sec) }, { key: 'secUnit', label: 'Unit' },
          { key: 'base', label: 'Baseline', num: true, render: (x: any) => n2(x.base) }, { key: 'tgt', label: 'Target', num: true, render: (x: any) => n2(x.tgt) }, { key: 'vsT', label: 'vs target', num: true, render: (x: any) => <span className={(x.vsT ?? 0) > 0 ? 'up-bad' : 'up-good'}>{pctS(x.vsT)}</span> },
          { key: 'idle', label: 'Non-prod. %', num: true, render: (x: any) => n1(x.idle) }, { key: 'util', label: 'Utilisation %', num: true, render: (x: any) => n1(x.util) }, { key: 'cost', label: 'Cost ₹', num: true },
        ]} rows={rows} />
      </Panel>
    </div>
  );
}
function SparkLine({ l, r }: { l: number; r: Range }) {
  const d = spark(r, (d) => safeDiv(LINE[l].kwh[d], LINE[l].good[d]) || NaN, 24).filter((x) => isFinite(x));
  return <SparkInner d={d} />;
}
import { Sparkline } from '../components/ui';
function SparkInner({ d }: { d: number[] }) { return <Sparkline data={d} color={C.cyan} />; }

// ---------------- line dashboard ----------------
function machineInstant(L: LineDef, m: number, d: number) {
  const M = L.machines[m];
  const running = LINE[L.idx].sched[d] > 0 && LINE[L.idx].hours[d * NS] > 0;
  const load = running ? 0.55 + 0.3 * hash01(L.idx, m, d, 5) : L.standby + 0.04 * hash01(m, d);
  const kw = M.active ? M.ratedKw * load : 0;
  const pf = 0.84 + 0.1 * hash01(L.idx, m, 9);
  const v = 412 + 8 * (hash01(m, d, 3) - 0.5);
  const i = (kw * 1000) / (Math.sqrt(3) * v * pf);
  return { kw, pf, v, i, status: !M.active ? 'Not installed' : running ? (hash01(L.idx, m, d, 8) < 0.08 ? 'Idle' : 'Running') : 'No Production' };
}

export function LineDashboard({ id }: { id: string }) {
  const { r, cmp, cfg, filters, P, gran, cmpLabel, assetVersion } = useView();
  const L = LINES.find((x) => x.id === id) ?? LINES[0];
  const l = L.idx;
  const sh = filters.shift;
  const m = useMemo(() => lineMetrics(l, r, sh), [l, r, sh, assetVersion]);
  const c = useMemo(() => (cmp ? lineMetrics(l, cmp, sh) : null), [l, cmp, sh]);
  const base = lineBaselineSec(l, cfg), tgt = lineTargetSec(l, cfg);
  const rate = P.cost.perKwh;
  const trend = useMemo(() => bucketSeries(r, gran, { kwh: (d) => LINE[l].kwh[d], good: (d) => LINE[l].good[d], idle: (d) => LINE[l].kwhS[d * NS + 1] + LINE[l].kwhS[d * NS + 9], nonprod: (d) => LINE[l].kwh[d] - LINE[l].kwhS[d * NS] }).map((x: any) => ({ ...x, sec: safeDiv(x.kwh, x.good) || null, base, tgt })), [l, r, gran]);
  const hourly = useMemo(() => {
    const last = lineHourly(l, r.i1);
    const avg = new Array(24).fill(0);
    for (let d = r.i0; d <= r.i1; d++) lineHourly(l, d).forEach((v, h) => (avg[h] += v / (r.i1 - r.i0 + 1)));
    return avg.map((v, h) => ({ label: `${String(h).padStart(2, '0')}:00`, avg: v, last: last[h] }));
  }, [l, r]);
  const scatter = useMemo(() => {
    const pts: { x: number; y: number; label: string; flag?: boolean }[] = [];
    for (let d = r.i0; d <= r.i1; d++) if (LINE[l].good[d] > 0) pts.push({ x: LINE[l].good[d], y: LINE[l].kwh[d], label: DATES[d] });
    // flag residual outliers
    const n = pts.length; if (n > 5) {
      let sx = 0, sy = 0, sxx = 0, sxy = 0; pts.forEach((p) => { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; });
      const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
      const res = pts.map((p) => p.y - (a + b * p.x)); const sd = Math.sqrt(res.reduce((s, v) => s + v * v, 0) / n);
      pts.forEach((p, i) => (p.flag = res[i] > 2 * sd));
    }
    return pts;
  }, [l, r]);
  const shifts = useMemo(() => [0, 1, 2].map((s) => { const x = lineMetrics(l, r, s); return { label: `Shift ${'ABC'[s]}`, kwh: x.kwh, good: x.good, sec: safeDiv(x.kwh, x.good) }; }), [l, r]);
  const skus = L.skus.map((s, k) => ({ code: s.code, name: s.name, prod: m.skuProd[k], kwh: m.skuKwh[k], sec: safeDiv(m.skuKwh[k], m.skuProd[k] * 0.985), sel: filters.sku === s.code }));
  const machines = useMemo(() => L.machines.map((M, mi) => {
    let k = 0, run = 0, idle = 0, down = 0;
    for (let d = r.i0; d <= r.i1; d++) { const x = machineDay(l, mi, d); k += x.kwh; run += x.run; idle += x.idle; down += x.down; }
    const ins = machineInstant(L, mi, r.i1);
    return { id: M.id, name: M.name, rated: M.ratedKw, kwh: k, run, idle, down, share: safeDiv(k, m.kwh) * 100, ...ins, opH: M.active ? m.runH + m.idleH * 0.6 : 0, intensity: safeDiv(k, m.good), active: M.active, metered: M.ratedKw >= 15 };
  }), [l, r, assetVersion]);
  const states = STATES.map((s, i) => ({ name: s, hours: m.hours[i], kwh: m.kwhS[i], color: STATE_COLORS[i] }));
  // batches for last 3 days of range
  const batches = useMemo(() => {
    const out: any[] = [];
    for (let d = Math.max(r.i0, r.i1 - 4); d <= r.i1; d++) {
      const n = LINE[l].batches[d];
      for (let b = 0; b < n; b++) {
        const k = Math.floor(hash01(l, d, b) * L.skus.length);
        const f = 0.8 + 0.4 * hash01(d, b, 2);
        const qty = (LINE[l].good[d] / n) * f;
        const e = (LINE[l].kwh[d] / n) * f * (0.97 + 0.08 * hash01(d, b, 4)) * L.skus[k].secMul;
        out.push({ batch: `B${DATES[d].replace(/-/g, '').slice(2)}-${L.id}-${b + 1}`, order: `PO-${4500000 + l * 1000 + (d % 1000)}`, sku: L.skus[k].code, date: DATES[d], qty, kwh: e, sec: e / qty, shift: 'ABC'[b % 3] });
      }
    }
    return out;
  }, [l, r]);
  const util = safeDiv(m.runH, m.availableH) * 100;
  const throughput = safeDiv(m.good, m.runH);
  const eff = safeDiv(m.prod, m.planned) * 100;
  const sec = m.sec;
  return (
    <div>
      <PageHeader title={L.name} sub={`${L.category} · ${L.machines.length} machines · panel ${L.panel} · ${L.transformer}${sh != null ? ` · Shift ${'ABC'[sh]}` : ''} · ${cmpLabel}`} crumbs={[{ label: 'Plant', href: '#/plant' }, { label: 'Production', href: '#/production' }, { label: L.short }]}
        actions={<select value={L.id} onChange={(e) => go(`#/line/${e.target.value}`)}>{LINES.map((x) => <option key={x.id} value={x.id}>{x.short}</option>)}</select>} />
      <div className="grid g6">
        <Kpi label="Energy consumption" value={kwh(m.kwh)[0]} unit={kwh(m.kwh)[1]} change={pct(m.kwh, c?.kwh)} cmpLabel={cmpLabel} spark={spark(r, (d) => LINE[l].kwh[d])} />
        <Kpi label="Energy cost" value={rs(m.kwh * rate)[0]} unit={rs(m.kwh * rate)[1]} change={pct(m.kwh, c?.kwh)} cmpLabel={cmpLabel} />
        <Kpi label="Production quantity" value={n0(m.prod)} unit={L.unit} change={pct(m.prod, c?.prod)} lowerIsBetter={false} cmpLabel={cmpLabel} spark={spark(r, (d) => LINE[l].prod[d])} />
        <Kpi label="Good production" value={n0(m.good)} unit={L.unit} change={pct(m.good, c?.good)} lowerIsBetter={false} cmpLabel={cmpLabel} />
        <Kpi label="Rejected quantity" value={n0(m.rej)} unit={`${L.unit} · ${n1(safeDiv(m.rej, m.prod) * 100)}%`} change={pct(m.rej, c?.rej)} cmpLabel={cmpLabel} />
        <Kpi label="Energy intensity (SEC)" value={n2(sec)} unit={L.secUnit} change={pct(sec, c?.sec)} cmpLabel={cmpLabel} spark={spark(r, (d) => safeDiv(LINE[l].kwh[d], LINE[l].good[d]))} />
        <Kpi label="Energy vs target" value={pctS(pct(sec, tgt))} change={pct(sec, tgt)} cmpLabel={`target ${n2(tgt)}`} href="#/targets" />
        <Kpi label="Energy vs baseline" value={pctS(pct(sec, base))} change={pct(sec, base)} cmpLabel={`baseline ${n2(base)}`} />
        <Kpi label="Operating hours" value={n0(m.availableH)} unit="h" change={pct(m.availableH, c?.availableH)} lowerIsBetter={false} cmpLabel={cmpLabel} />
        <Kpi label="Idle hours" value={n0(m.idleH)} unit="h" change={pct(m.idleH, c?.idleH)} cmpLabel={cmpLabel} />
        <Kpi label="Energy during idle" value={kwh(m.idleKwh)[0]} unit={kwh(m.idleKwh)[1]} change={pct(m.idleKwh, c?.idleKwh)} cmpLabel={cmpLabel} />
        <Kpi label="Machine utilisation" value={n1(util)} unit="%" change={pct(util, c ? safeDiv(c.runH, c.availableH) * 100 : null)} lowerIsBetter={false} cmpLabel={cmpLabel} />
        <Kpi label="Throughput" value={n2(throughput)} unit={`${L.unit}/h`} change={pct(throughput, c ? safeDiv(c.good, c.runH) : null)} lowerIsBetter={false} cmpLabel={cmpLabel} />
        <Kpi label="Production efficiency" value={n1(eff)} unit="% of plan" change={pct(eff, c ? safeDiv(c.prod, c.planned) * 100 : null)} lowerIsBetter={false} cmpLabel={cmpLabel} />
        <Kpi label="Non-production energy" value={n1(safeDiv(m.nonProdKwh, m.kwh) * 100)} unit="%" change={pct(m.nonProdKwh, c?.nonProdKwh)} cmpLabel={cmpLabel} href="#/losses" />
        <Kpi label="Energy per batch" value={n0(safeDiv(m.kwh, m.batches))} unit="kWh/batch" change={pct(safeDiv(m.kwh, m.batches), c ? safeDiv(c.kwh, c.batches) : null)} cmpLabel={cmpLabel} />
        <Kpi label="Energy per operating hour" value={n0(safeDiv(m.kwh, m.availableH))} unit="kWh/h" change={pct(safeDiv(m.kwh, m.availableH), c ? safeDiv(c.kwh, c.availableH) : null)} cmpLabel={cmpLabel} />
        <Kpi label="Peak line demand" value={n0(m.peakKw)} unit="kW" change={pct(m.peakKw, c?.peakKw)} cmpLabel={cmpLabel} />
      </div>
      <div className="grid g2 mt">
        <Panel title="Energy consumption vs production"><Combo data={trend} series={[{ key: 'kwh', name: 'Energy (kWh)', color: C.blue }, { key: 'good', name: `Good production (${L.unit})`, type: 'line', color: C.green, axis: 'right' }]} height={250} /></Panel>
        <Panel title="Energy intensity trend" sub={L.secUnit}><Combo data={trend} series={[{ key: 'sec', name: 'SEC', type: 'line', color: C.cyan }, { key: 'base', name: 'Baseline', type: 'line', color: C.amber, dashed: true }, { key: 'tgt', name: 'Target', type: 'line', color: C.green, dashed: true }]} height={250} digits={2} /></Panel>
      </div>
      <div className="grid g3 mt">
        <Panel title="Hourly power trend" sub="kW by hour, period average vs last day"><Combo data={hourly} series={[{ key: 'avg', name: 'Average kW', type: 'area', color: C.blue }, { key: 'last', name: DATES[r.i1], type: 'line', color: C.amber }]} height={220} /></Panel>
        <Panel title="Production vs energy correlation" sub="Daily points; amber = energy > fit + 2σ"><Scatter2 data={scatter} xName={`Good ${L.unit}`} yName="kWh" height={200} /></Panel>
        <Panel title="Energy by shift"><Combo data={shifts} series={[{ key: 'kwh', name: 'kWh', color: C.violet }, { key: 'sec', name: 'SEC', type: 'line', color: C.amber, axis: 'right' }]} height={220} digits={1} /></Panel>
      </div>
      <div className="grid g3 mt">
        <Panel title="Machine-wise energy contribution" className="span2">
          <HBar data={machines.filter((x) => x.active).map((x) => ({ name: x.name, value: x.kwh, id: x.id })).sort((a, b) => b.value - a.value)} unit="kWh" onClick={(d) => go(`#/machine/${d.id}`)} labelWidth={200} />
        </Panel>
        <Panel title="Machine state vs energy" sub="Hours and kWh by operating state">
          <Donut height={130} data={states.filter((s) => s.kwh > 0).map((s) => ({ name: s.name, value: s.kwh, color: s.color }))} />
          <table className="tbl mt"><thead><tr><th>State</th><th className="num">Hours</th><th className="num">kWh</th></tr></thead><tbody>{states.map((s) => <tr key={s.name}><td><span className="status-dot" style={{ background: s.color, marginRight: 6 }} />{s.name}</td><td className="num">{n0(s.hours)}</td><td className="num">{n0(s.kwh)}</td></tr>)}</tbody></table>
        </Panel>
      </div>
      <div className="grid g2 mt">
        <Panel title="Idle & non-production energy trend"><Combo data={trend} series={[{ key: 'idle', name: 'Idle + standby kWh', color: C.amber, stack: 'i' }, { key: 'nonprod', name: 'All non-running kWh', type: 'line', color: C.red }]} height={220} /></Panel>
        <Panel title="Energy by SKU" sub={filters.sku !== 'ALL' ? `SKU filter: ${filters.sku}` : 'Running-state energy allocated by SKU'}>
          <DataTable cols={[{ key: 'code', label: 'SKU', render: (x: any) => x.sel ? <b style={{ color: C.cyan }}>{x.code}</b> : x.code }, { key: 'name', label: 'Product' }, { key: 'prod', label: `Qty (${L.unit})`, num: true }, { key: 'kwh', label: 'kWh', num: true, bar: true }, { key: 'sec', label: L.secUnit, num: true, render: (x: any) => n2(x.sec) }]} rows={skus} exportName={`${L.id}-sku-energy`} />
        </Panel>
      </div>
      <Panel title="Energy by batch" sub="Batches in the last 5 days of the selected range" className="mt">
        <DataTable cols={[{ key: 'batch', label: 'Batch' }, { key: 'order', label: 'Production order' }, { key: 'date', label: 'Date' }, { key: 'shift', label: 'Shift' }, { key: 'sku', label: 'SKU' }, { key: 'qty', label: `Qty (${L.unit})`, num: true, render: (x: any) => n1(x.qty) }, { key: 'kwh', label: 'kWh', num: true }, { key: 'sec', label: 'kWh/unit', num: true, render: (x: any) => n2(x.sec) }]} rows={batches} exportName={`${L.id}-batches`} pageSize={10} />
      </Panel>
      <Panel title="Machine-level drill-down" sub={`Instantaneous values simulated for ${DATES[r.i1]} 10:00. Click a row for full machine history.`} className="mt">
        <DataTable onRow={(x: any) => go(`#/machine/${x.id}`)} exportName={`${L.id}-machines`} cols={[
          { key: 'name', label: 'Machine', render: (x: any) => <>{x.name} {!x.active && <Badge kind="grey">not installed</Badge>} {!x.metered && x.active && <Badge kind="est">allocated</Badge>}</> },
          { key: 'rated', label: 'Rated kW', num: true }, { key: 'kw', label: 'Current kW', num: true, render: (x: any) => n1(x.kw) }, { key: 'kwh', label: 'Period kWh', num: true, bar: true }, { key: 'share', label: 'Share %', num: true, render: (x: any) => n1(x.share) },
          { key: 'v', label: 'Voltage V', num: true, render: (x: any) => n0(x.v) }, { key: 'i', label: 'Current A', num: true, render: (x: any) => n0(x.i) }, { key: 'pf', label: 'PF', num: true, render: (x: any) => n2(x.pf) },
          { key: 'status', label: 'Status', render: (x: any) => <Badge kind={x.status === 'Running' ? 'good' : x.status === 'Idle' ? 'med' : 'grey'}>{x.status}</Badge> }, { key: 'opH', label: 'Op. hours', num: true },
          { key: 'intensity', label: `kWh/${L.unit}`, num: true, render: (x: any) => n2(x.intensity) }, { key: 'idle', label: 'Idle kWh', num: true }, { key: 'down', label: 'Downtime kWh', num: true },
        ]} rows={machines} />
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Machines ≥ 15 kW have their own meter. Smaller machines show energy allocated from the line meter by rated load (marked "allocated").</div>
      </Panel>
    </div>
  );
}

// ---------------- machine dashboard ----------------
export function MachineDashboard({ id }: { id: string }) {
  const { r, cmp, P, gran, cmpLabel } = useView();
  const L = LINES.find((x) => id.startsWith(x.id)) ?? LINES[0];
  const mi = Math.max(0, L.machines.findIndex((m) => m.id === id));
  const M = L.machines[mi];
  const agg = (rr: Range) => { let k = 0, run = 0, idle = 0, down = 0; for (let d = rr.i0; d <= rr.i1; d++) { const x = machineDay(L.idx, mi, d); k += x.kwh; run += x.run; idle += x.idle; down += x.down; } return { k, run, idle, down }; };
  const a = agg(r), c = cmp ? agg(cmp) : null;
  const lm = lineMetrics(L.idx, r);
  const ins = machineInstant(L, mi, r.i1);
  const trend = bucketSeries(r, gran, { run: (d) => machineDay(L.idx, mi, d).run, idle: (d) => machineDay(L.idx, mi, d).idle - machineDay(L.idx, mi, d).down, down: (d) => machineDay(L.idx, mi, d).down, good: (d) => LINE[L.idx].good[d] });
  const hourly = lineHourly(L.idx, r.i1).map((v, h) => ({ label: `${String(h).padStart(2, '0')}:00`, kw: v * (machineDay(L.idx, mi, r.i1).kwh / Math.max(1, LINE[L.idx].kwh[r.i1])) }));
  const meter = meterById(`EM-${M.id}`);
  const regs = meter ? registerRows(meter, Math.max(0, r.i1 - 13), r.i1) : [];
  const hist = []; for (let d = r.i0; d <= r.i1; d++) { const x = machineDay(L.idx, mi, d); hist.push({ date: DATES[d], kwh: x.kwh, run: x.run, idle: x.idle, down: x.down, runH: LINE[L.idx].hours[d * NS], prod: LINE[L.idx].good[d] }); }
  const totalCum = (() => { let s = 0; for (let d = 0; d <= r.i1; d++) s += machineDay(L.idx, mi, d).kwh; return s; })();
  return (
    <div>
      <PageHeader title={`${M.name}`} sub={`${M.id} · ${L.name} · rated ${M.ratedKw} kW · ${meter ? `meter ${meter.id}` : 'no dedicated meter – energy allocated from line meter'}`} crumbs={[{ label: 'Plant', href: '#/plant' }, { label: 'Production', href: '#/production' }, { label: L.short, href: `#/line/${L.id}` }, { label: M.name }]}
        actions={<select value={M.id} onChange={(e) => go(`#/machine/${e.target.value}`)}>{L.machines.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>} />
      <div className="grid g6">
        <Kpi label="Current kW" value={n1(ins.kw)} unit="kW" change={null} cmpLabel={`${n0((ins.kw / M.ratedKw) * 100)}% of rated`} status="info" tag={<Badge kind="sim">SIM</Badge>} />
        <Kpi label="Cumulative kWh (register)" value={n0(totalCum)} unit="kWh" change={null} cmpLabel="since data start" status="info" />
        <Kpi label="Period energy" value={kwh(a.k)[0]} unit={kwh(a.k)[1]} change={pct(a.k, c?.k)} cmpLabel={cmpLabel} spark={spark(r, (d) => machineDay(L.idx, mi, d).kwh)} />
        <Kpi label="Voltage (L-L)" value={n0(ins.v)} unit="V" change={null} cmpLabel="phase avg" status="info" />
        <Kpi label="Current" value={n0(ins.i)} unit="A" change={null} cmpLabel="phase avg" status="info" />
        <Kpi label="Power factor" value={n2(ins.pf)} change={null} cmpLabel="instantaneous" status={ins.pf < 0.88 ? 'warn' : 'good'} />
        <Kpi label="Running status" value={ins.status} change={null} cmpLabel={DATES[r.i1]} status={ins.status === 'Running' ? 'good' : 'warn'} />
        <Kpi label="Operating hours" value={n0(lm.runH + lm.idleH * 0.6)} unit="h" change={null} cmpLabel="in period" status="info" />
        <Kpi label="Production quantity" value={n0(lm.good)} unit={L.unit} change={null} cmpLabel="line good output" status="info" />
        <Kpi label="Machine energy intensity" value={n2(safeDiv(a.k, lm.good))} unit={`kWh/${L.unit}`} change={pct(safeDiv(a.k, lm.good), c ? safeDiv(c.k, lineMetrics(L.idx, cmp!).good) : null)} cmpLabel={cmpLabel} />
        <Kpi label="Energy during idle" value={kwh(a.idle - a.down)[0]} unit={kwh(a.idle - a.down)[1]} change={c ? pct(a.idle - a.down, c.idle - c.down) : null} cmpLabel={cmpLabel} />
        <Kpi label="Energy during downtime" value={kwh(a.down)[0]} unit={kwh(a.down)[1]} change={pct(a.down, c?.down)} cmpLabel={cmpLabel} />
      </div>
      <div className="grid g2 mt">
        <Panel title="Historical energy by state" sub="Running vs idle/standby vs downtime"><Combo data={trend} series={[{ key: 'run', name: 'Running kWh', stack: 's', color: C.green }, { key: 'idle', name: 'Idle / standby kWh', stack: 's', color: C.amber }, { key: 'down', name: 'Downtime kWh', stack: 's', color: C.red }]} height={250} /></Panel>
        <Panel title="Load profile" sub={`kW by hour on ${DATES[r.i1]}`}><Combo data={hourly} series={[{ key: 'kw', name: 'kW', type: 'area', color: C.cyan }]} refLines={[{ y: M.ratedKw, label: 'Rated kW', color: C.red }]} height={250} digits={1} /></Panel>
      </div>
      <div className="grid g2 mt">
        <Panel title="Meter register & consumption calculation" sub="Consumption = difference between cumulative readings (resets / gaps handled)">
          {meter ? <DataTable cols={[{ key: 'date', label: 'Date' }, { key: 'reading', label: 'Register kWh', num: true, render: (x: any) => x.reading == null ? <Badge kind="grey">missing</Badge> : n1(x.reading) }, { key: 'consumption', label: 'Δ kWh', num: true, render: (x: any) => n1(x.consumption) }, { key: 'status', label: 'Status', render: (x: any) => <Badge kind={x.status === 'OK' ? 'good' : 'est'}>{x.status}</Badge> }, { key: 'method', label: 'Method' }]} rows={regs} /> : <div className="muted">No dedicated meter. Energy is allocated from {L.id} line meter by rated load share.</div>}
        </Panel>
        <Panel title="Daily history" sub="Full machine history for the selected range">
          <DataTable cols={[{ key: 'date', label: 'Date' }, { key: 'kwh', label: 'kWh', num: true, bar: true }, { key: 'run', label: 'Running kWh', num: true }, { key: 'idle', label: 'Non-running kWh', num: true }, { key: 'runH', label: 'Line run h', num: true, render: (x: any) => n1(x.runH) }, { key: 'prod', label: `Line good ${L.unit}`, num: true }]} rows={hist.reverse()} exportName={`${M.id}-history`} pageSize={12} />
        </Panel>
      </div>
      <div className="note mt">Recommended next step: compare this machine's idle energy with its running energy. If idle energy is above 15% of total, consider a standby interlock (see <a href="#/projects">Improvement Projects</a>). Cost of this machine in period ≈ {rsS(a.k * P.cost.perKwh)}.</div>
    </div>
  );
}

// ---------------- energy vs production ----------------
export function EnergyVsProduction() {
  const { r, filters } = useView();
  const [lineId, setLineId] = useState(filters.category === 'ALL' ? 'L04' : LINES.find((x) => x.category === filters.category)!.id);
  const L = LINES.find((x) => x.id === lineId)!;
  const l = L.idx;
  const days = useMemo(() => { const o: number[] = []; for (let d = r.i0; d <= r.i1; d++) if (LINE[l].good[d] > 0) o.push(d); return o; }, [l, r]);
  const H = (d: number, s: number) => LINE[l].hours[d * NS + s];
  const pts = (fx: (d: number) => number, fy: (d: number) => number) => days.map((d) => ({ x: fx(d), y: fy(d), label: DATES[d] }));
  const kwhD = (d: number) => LINE[l].kwh[d];
  const flagged = useMemo(() => {
    const p = pts((d) => LINE[l].good[d], kwhD);
    const n = p.length; if (n < 5) return p.map((q) => ({ ...q, flag: false }));
    let sx = 0, sy = 0, sxx = 0, sxy = 0; p.forEach((q) => { sx += q.x; sy += q.y; sxx += q.x * q.x; sxy += q.x * q.y; });
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
    const res = p.map((q) => q.y - (a + b * q.x)); const sd = Math.sqrt(res.reduce((s, v) => s + v * v, 0) / n);
    return p.map((q, i) => ({ ...q, flag: res[i] > 2 * sd }));
  }, [days]);
  // findings
  const findings = useMemo(() => {
    const out: { t: string; kind: string; d?: string }[] = [];
    const fl = flagged.filter((p) => p.flag);
    if (fl.length) out.push({ kind: 'High energy, low production', t: `${fl.length} day(s) used more than 2σ above expected energy for their output, e.g. ${fl.slice(0, 3).map((x) => x.label).join(', ')}.` });
    // rolling SEC trend vs production stability
    if (days.length > 20) {
      const half = Math.floor(days.length / 2);
      const s1 = days.slice(0, half), s2 = days.slice(half);
      const sec = (ds: number[]) => ds.reduce((s, d) => s + LINE[l].kwh[d], 0) / ds.reduce((s, d) => s + LINE[l].good[d], 0);
      const pr = (ds: number[]) => ds.reduce((s, d) => s + LINE[l].good[d], 0) / ds.length;
      const ds = pct(sec(s2), sec(s1))!, dp = pct(pr(s2), pr(s1))!;
      if (ds > 4 && Math.abs(dp) < 6) out.push({ kind: 'Intensity rising with stable production', t: `SEC rose ${n1(ds)}% in the second half of the range while daily production changed only ${n1(dp)}%.` });
      if (dp > 4 && ds < 0) out.push({ kind: 'Production up without proportional energy', t: `Production per day grew ${n1(dp)}% while SEC fell ${n1(-ds)}% (economies of scale / better loading).` });
    }
    let np = 0, tot = 0; for (let d = r.i0; d <= r.i1; d++) { np += LINE[l].kwhS[d * NS + 9] + LINE[l].kwhS[d * NS + 4]; tot += LINE[l].kwh[d]; }
    out.push({ kind: 'Energy during non-production', t: `${kwhS(np)} (${n1((np / tot) * 100)}%) consumed while the line was not scheduled or on planned stop.` });
    let mx = 0, md = r.i0; for (let d = r.i0; d <= r.i1; d++) if (LINE[l].kwh[d] > mx) { mx = LINE[l].kwh[d]; md = d; }
    out.push({ kind: 'Largest daily energy', t: `${kwhS(mx)} on ${DATES[md]} with ${n0(LINE[l].good[md])} ${L.unit} good output.` });
    return out;
  }, [flagged, l, r]);
  const mixPts = days.map((d) => { const ns = L.skus.length; let hi = 0, all = 0; const k = L.skus.reduce((bi, s, i) => (s.secMul > L.skus[bi].secMul ? i : bi), 0); for (let i = 0; i < ns; i++) { all += LINE[l].skuProd[d * ns + i]; if (i === k) hi += LINE[l].skuProd[d * ns + i]; } return { x: (hi / all) * 100, y: safeDiv(LINE[l].kwh[d], LINE[l].good[d]), label: DATES[d] }; });
  return (
    <div>
      <PageHeader title="Energy vs Production Intelligence" sub="Correlation of energy with production volume, rate, hours, utilisation, downtime, changeover and product mix (daily points)"
        actions={<select value={lineId} onChange={(e) => setLineId(e.target.value)}>{LINES.map((x) => <option key={x.id} value={x.id}>{x.short}</option>)}</select>} />
      <div className="grid g3">
        <Panel title="kWh vs production quantity" sub="Amber = energy > fit + 2σ" className="span2"><Scatter2 data={flagged} xName={`Good ${L.unit}`} yName="kWh" height={260} /></Panel>
        <Panel title="Findings" sub="Rule-based, from the selected range">
          {findings.map((f, i) => <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #142d57' }}><Badge kind={i === 0 ? 'high' : 'info'}>{f.kind}</Badge><div style={{ marginTop: 4, fontSize: 12.5 }}>{f.t}</div></div>)}
          <a className="btn small mt" href="#/insights">See plant-wide insights →</a>
        </Panel>
      </div>
      <div className="grid g3 mt">
        <Panel title="kW vs production rate"><Scatter2 data={pts((d) => safeDiv(LINE[l].prod[d], H(d, 0)), (d) => safeDiv(LINE[l].kwhS[d * NS], H(d, 0)))} xName={`${L.unit}/h`} yName="avg running kW" height={210} /></Panel>
        <Panel title="Energy intensity vs throughput"><Scatter2 data={pts((d) => safeDiv(LINE[l].good[d], H(d, 0)), (d) => safeDiv(LINE[l].kwh[d], LINE[l].good[d]))} xName={`${L.unit}/h`} yName={L.secUnit} height={210} color={C.violet} /></Panel>
        <Panel title="Energy vs operating hours"><Scatter2 data={pts((d) => 24 - H(d, 9) - H(d, 4) - H(d, 7), kwhD)} xName="operating h" yName="kWh" height={210} color={C.teal} /></Panel>
        <Panel title="Energy vs machine utilisation"><Scatter2 data={pts((d) => (H(d, 0) / Math.max(1, 24 - H(d, 9) - H(d, 4) - H(d, 7))) * 100, (d) => safeDiv(LINE[l].kwh[d], LINE[l].good[d]))} xName="utilisation %" yName={L.secUnit} height={210} color={C.amber} /></Panel>
        <Panel title="Energy vs downtime"><Scatter2 data={pts((d) => H(d, 5) + H(d, 6), (d) => safeDiv(LINE[l].kwh[d], LINE[l].good[d]))} xName="downtime h" yName={L.secUnit} height={210} color={C.red} /></Panel>
        <Panel title="Energy vs changeover"><Scatter2 data={pts((d) => H(d, 3) + H(d, 2), (d) => safeDiv(LINE[l].kwh[d], LINE[l].good[d]))} xName="changeover + setup h" yName={L.secUnit} height={210} color={C.blue} /></Panel>
      </div>
      <div className="grid g2 mt">
        <Panel title="Energy vs product mix" sub={`Share of the most energy-intensive SKU vs line SEC`}><Scatter2 data={mixPts} xName="high-SEC SKU share %" yName={L.secUnit} height={220} color={C.cyan} /></Panel>
        <Panel title="Plant: production energy vs normalised production" sub="All lines, tonne-equivalent normalisation">
          <Scatter2 data={(() => { const o = []; for (let d = r.i0; d <= r.i1; d++) o.push({ x: PROD_TEQ[d], y: PROD_KWH[d], label: DATES[d] }); return o; })()} xName="t-eq" yName="production kWh" height={220} />
        </Panel>
      </div>
    </div>
  );
}

// ---------------- benchmarking ----------------
export function Benchmarking() {
  const { r, cfg } = useView();
  const [lineId, setLineId] = useState('L04');
  const L = LINES.find((x) => x.id === lineId)!;
  const shiftRows = LINES.map((Ln) => { const s = [0, 1, 2].map((k) => lineMetrics(Ln.idx, r, k)); return { id: Ln.id, name: Ln.short, unit: Ln.secUnit, a: safeDiv(s[0].kwh, s[0].good), b: safeDiv(s[1].kwh, s[1].good), c: safeDiv(s[2].kwh, s[2].good) }; });
  const monthly = buckets({ i0: 0, i1: DAYS - 1 }, 'month').map((b) => ({ label: b.label, sec: safeDiv(sum(LINE[L.idx].kwh, b.i0, b.i1), sum(LINE[L.idx].good, b.i0, b.i1)), base: lineBaselineSec(L.idx, cfg), tgt: lineTargetSec(L.idx, cfg) }));
  const weekly = buckets({ i0: Math.max(0, r.i1 - 7 * 16), i1: r.i1 }, 'week').map((b) => ({ label: b.label, sec: safeDiv(sum(LINE[L.idx].kwh, b.i0, b.i1), sum(LINE[L.idx].good, b.i0, b.i1)) }));
  const daily = []; for (let d = Math.max(0, r.i1 - 27); d <= r.i1; d++) daily.push({ label: DATES[d].slice(5), sec: safeDiv(LINE[L.idx].kwh[d], LINE[L.idx].good[d]) || null });
  // Cola family normalised per kL
  const cola = [{ line: 0, k: 0, l: 0.3 }, { line: 2, k: 0, l: 0.6 }, { line: 2, k: 2, l: 2.0 }].map((x) => {
    const Ln = LINES[x.line]; const ns = Ln.skus.length;
    let p = 0, e = 0; for (let d = r.i0; d <= r.i1; d++) { p += LINE[x.line].skuProd[d * ns + x.k]; e += LINE[x.line].skuKwh[d * ns + x.k]; }
    const nonRunShare = safeDiv(lineMetrics(x.line, r).nonProdKwh, lineMetrics(x.line, r).kwhS[0]);
    const kl = p * x.l; // 1,000 bottles × litres = kL
    return { name: `${Ln.skus[x.k].code} on ${Ln.id}`, perKl: safeDiv(e * (1 + nonRunShare), kl), perK: safeDiv(e * (1 + nonRunShare), p) };
  });
  const enpi = LINES.map((Ln) => { const m = lineMetrics(Ln.idx, r); const b = lineBaselineSec(Ln.idx, cfg), t = lineTargetSec(Ln.idx, cfg); return { name: Ln.short, sec: m.sec, unit: Ln.secUnit, base: b, tgt: t, enpi: safeDiv(m.sec, b), achieve: safeDiv(t, m.sec) * 100 }; });
  const pu = buckets({ i0: 0, i1: DAYS - 1 }, 'month').map((b) => ({ label: b.label, prod: sum(PROD_KWH, b.i0, b.i1), util: sum(UTIL_TOTAL, b.i0, b.i1), ratio: safeDiv(sum(UTIL_TOTAL, b.i0, b.i1), sum(PROD_KWH, b.i0, b.i1)) }));
  return (
    <div>
      <PageHeader title="Energy Benchmarking" sub="Shifts, days, weeks, months, SKUs, lines, baseline and target" actions={<select value={lineId} onChange={(e) => setLineId(e.target.value)}>{LINES.map((x) => <option key={x.id} value={x.id}>{x.short}</option>)}</select>} />
      <div className="grid g3">
        <Panel title={`${L.short}: SEC across days`} sub="Last 28 days of range"><Combo data={daily} series={[{ key: 'sec', name: 'SEC', color: C.cyan }]} height={220} digits={2} /></Panel>
        <Panel title={`${L.short}: SEC across weeks`}><Combo data={weekly} series={[{ key: 'sec', name: 'SEC', type: 'line', color: C.violet }]} height={220} digits={2} /></Panel>
        <Panel title={`${L.short}: SEC across months (2 yrs)`}><Combo data={monthly} series={[{ key: 'sec', name: 'SEC', color: C.blue }, { key: 'base', name: 'Baseline', type: 'line', color: C.amber, dashed: true }, { key: 'tgt', name: 'Target', type: 'line', color: C.green, dashed: true }]} height={220} digits={2} /></Panel>
      </div>
      <div className="grid g2 mt">
        <Panel title="Same line across shifts" sub="SEC by shift (lower is better)">
          <DataTable exportName="shift-benchmark" cols={[{ key: 'name', label: 'Line' }, { key: 'unit', label: 'Unit' }, { key: 'a', label: 'Shift A', num: true, render: (x: any) => n2(x.a) }, { key: 'b', label: 'Shift B', num: true, render: (x: any) => n2(x.b) }, { key: 'c', label: 'Shift C', num: true, render: (x: any) => n2(x.c) }, { key: 'w', label: 'Worst vs best', num: true, value: (x: any) => { const v = [x.a, x.b, x.c].filter((y) => y > 0); return v.length > 1 ? (Math.max(...v) / Math.min(...v) - 1) * 100 : 0; }, render: (x: any) => { const v = [x.a, x.b, x.c].filter((y) => y > 0); return v.length > 1 ? pctS((Math.max(...v) / Math.min(...v) - 1) * 100) : 'n/a'; } }]} rows={shiftRows} />
        </Panel>
        <Panel title="Current SEC vs baseline vs target" sub="Energy Performance Index = SEC / baseline SEC">
          <DataTable exportName="enpi" cols={[{ key: 'name', label: 'Line' }, { key: 'sec', label: 'SEC', num: true, render: (x: any) => n2(x.sec) }, { key: 'base', label: 'Baseline', num: true, render: (x: any) => n2(x.base) }, { key: 'tgt', label: 'Target', num: true, render: (x: any) => n2(x.tgt) }, { key: 'unit', label: 'Unit' }, { key: 'enpi', label: 'EnPI', num: true, render: (x: any) => <span className={x.enpi > 1 ? 'up-bad' : 'up-good'}>{n2(x.enpi)}</span> }, { key: 'achieve', label: 'Target achievement %', num: true, render: (x: any) => n0(x.achieve) }]} rows={enpi} />
        </Panel>
      </div>
      <div className="grid g2 mt">
        <Panel title="Same product family across lines" sub="Cola SKUs normalised per kL (bottle size accounted for) – no unit mixing">
          <HBar data={cola.map((c) => ({ name: c.name, value: c.perKl }))} unit="kWh/kL" digits={1} labelWidth={180} />
          <div className="muted" style={{ fontSize: 11 }}>Per 1,000 bottles: {cola.map((c) => `${c.name} ${n2(c.perK)}`).join(' · ')}</div>
        </Panel>
        <Panel title="Production department vs utility consumption" sub="Monthly; ratio = utility kWh per production kWh">
          <Combo data={pu} series={[{ key: 'prod', name: 'Production kWh', stack: 'p', color: C.cyan }, { key: 'util', name: 'Utilities kWh', stack: 'p', color: C.violet }, { key: 'ratio', name: 'Utility / production', type: 'line', color: C.amber, axis: 'right' }]} height={240} digits={2} />
        </Panel>
      </div>
    </div>
  );
}
export { Stat, Tabs, PALETTE, shiftShares };
