import { useMemo, useState } from 'react';
import { BUILDINGS, LINES, UTILITIES } from '../data/assets';
import { baselineRange, buckets, compareRange, costPeriod, dailyCo2, dailyCost, deptSeries, DEPARTMENTS, expectedPlantKwh, lineMetrics, pct, Range, safeDiv, sum, Granularity, deptKwh, co2Period, utilSecBaseline } from '../data/engine';
import { generateInsights, Insight, Alert } from '../data/insights';
import { BLD, CONS, DATES, DAYS, DOW, INCOMING, LINE, machineDay, NS, PEAK_KVA, plantHourly, PROD_TEQ, UTIL, UTIL_KWH, UTIL_TOTAL, NONPROD_FRAC } from '../data/sim';
import { budgetFor } from './Executive';
import { C, kwh, kwhS, n0, n1, n2, PALETTE, pctS, rs, rsS } from '../format';
import { Badge, Combo, DataTable, Heatmap, HBar, Kpi, Modal, PageHeader, Panel, SevBadge, Tabs, Waterfall } from '../components/ui';
import { bucketSeries, useView } from './common';
import { useStore } from '../store';

// ---------------- analytics ----------------
interface CmpRow { name: string; cur: number; prev: number | null; prod: number; prodPrev: number | null; cost: number; costPrev: number | null; co2: number; co2Prev: number | null; note?: string }

export function Analytics() {
  const { r, cmp, cfg, filters, gran, cmpLabel, P } = useView();
  const ser = deptSeries(filters.dept);
  const deptName = filters.dept === 'ALL' ? 'Plant' : DEPARTMENTS.find((d) => d.id === filters.dept)!.name;
  const rate = P.cost.perKwh;
  const [tg, setTg] = useState<Granularity>(gran);
  const comps = useMemo<CmpRow[]>(() => {
    const L = DAYS - 1;
    const agg = (rr: Range | null) => {
      if (!rr) return null;
      let e = 0, p = 0, c = 0, co = 0;
      for (let d = rr.i0; d <= rr.i1; d++) { e += ser(d); p += PROD_TEQ[d]; c += dailyCost(d, cfg) * (ser(d) / CONS[d]); co += dailyCo2(d, cfg) * (ser(d) / CONS[d]); }
      return { e, p, c, co };
    };
    const row = (name: string, a: Range, b: Range | null, note?: string): CmpRow => { const x = agg(a)!, y = agg(b); return { name, cur: x.e, prev: y?.e ?? null, prod: x.p, prodPrev: y?.p ?? null, cost: x.c, costPrev: y?.c ?? null, co2: x.co, co2Prev: y?.co ?? null, note }; };
    const hp = plantHourly(L);
    const hf = (h: number) => (hp[h] / hp.reduce((a, b) => a + b, 0));
    const hourRow = (name: string, hA: number, hB: number): CmpRow => {
      const e = (h: number) => ser(L) * hf(h) * 24 / 24 * 1;
      return { name, cur: e(hA), prev: e(hB), prod: PROD_TEQ[L] * hf(hA), prodPrev: PROD_TEQ[L] * hf(hB), cost: e(hA) * rate, costPrev: e(hB) * rate, co2: (e(hA) / 1000) * cfg.ef.grid, co2Prev: (e(hB) / 1000) * cfg.ef.grid, note: `${DATES[L]} ${hA}:00 vs ${hB}:00` };
    };
    const shiftE = (d: number, s: number) => { const h = plantHourly(d); const hrs = s === 0 ? [6, 14] : s === 1 ? [14, 22] : [22, 30]; let v = 0; for (let k = hrs[0]; k < hrs[1]; k++) v += h[k % 24]; return v * (ser(d) / INCOMING[d]); };
    const shiftRow: CmpRow = (() => { const a = shiftE(L, 1), b = shiftE(L, 0); const pa = PROD_TEQ[L] * (a / ser(L)), pb = PROD_TEQ[L] * (b / ser(L)); return { name: 'Current shift vs previous shift', cur: a, prev: b, prod: pa, prodPrev: pb, cost: a * rate, costPrev: b * rate, co2: a / 1000 * cfg.ef.grid, co2Prev: b / 1000 * cfg.ef.grid, note: 'Shift B vs Shift A, latest day' }; })();
    const ds = DATES[L], y = +ds.slice(0, 4), m = +ds.slice(5, 7) - 1;
    const idx = (yy: number, mm: number, dd: number) => Math.max(0, Math.min(L, Math.round((Date.UTC(yy, mm, dd) - Date.parse(DATES[0] + 'T00:00:00Z')) / 86400000)));
    const dow = (DOW[L] + 6) % 7;
    const wk: Range = { i0: L - dow, i1: L }, wkp: Range = { i0: L - dow - 7, i1: L - 7 };
    const mo: Range = { i0: idx(y, m, 1), i1: L }, mop: Range = { i0: idx(y, m - 1, 1), i1: Math.min(idx(y, m, 0), idx(y, m - 1, 1) + (L - idx(y, m, 1))) };
    const q0 = Math.floor(m / 3) * 3;
    const qt: Range = { i0: idx(y, q0, 1), i1: L }, qtp: Range = { i0: idx(y, q0 - 3, 1), i1: idx(y, q0 - 3, 1) + (L - idx(y, q0, 1)) };
    const yr: Range = { i0: idx(y, 0, 1), i1: L }, yrp: Range = { i0: idx(y - 1, 0, 1), i1: L - 365 };
    const exp = expectedPlantKwh(r, cfg) * (filters.dept === 'ALL' ? 1 : deptKwh(filters.dept, r) / sum(CONS, r.i0, r.i1));
    const budget = budgetFor(r, cfg) * (filters.dept === 'ALL' ? 1 : deptKwh(filters.dept, r) / sum(CONS, r.i0, r.i1));
    const sel = row('Selected period vs comparison', r, cmp, `${cmpLabel}`);
    return [
      hourRow('Last hour vs previous hour', 10, 9),
      row('Today vs yesterday', { i0: L, i1: L }, { i0: L - 1, i1: L - 1 }, 'latest simulated day'),
      shiftRow,
      row('This week vs last week (to date)', wk, wkp),
      row('This month vs last month (to date)', mo, mop),
      row('This quarter vs last quarter (to date)', qt, qtp),
      row('This year vs last year (to date)', yr, yrp),
      row('Current period vs same period previous year', r, compareRange(r, 'yoy'), compareRange(r, 'yoy') ? undefined : 'no data one year earlier'),
      { ...sel },
      { name: 'Current period vs baseline (production-normalised)', cur: sel.cur, prev: exp, prod: sel.prod, prodPrev: sel.prod, cost: sel.cost, costPrev: exp * rate, co2: sel.co2, co2Prev: (exp / 1000) * cfg.ef.grid, note: 'baseline regression' },
      { name: 'Actual vs target (budget)', cur: sel.cur, prev: budget, prod: sel.prod, prodPrev: null, cost: sel.cost, costPrev: budget * rate, co2: sel.co2, co2Prev: null, note: 'monthly budget prorated' },
    ];
  }, [r, cmp, cfg, filters.dept]);
  const tr: Range = tg === 'day' ? { i0: Math.max(0, r.i1 - 89), i1: r.i1 } : tg === 'week' ? { i0: Math.max(0, r.i1 - 7 * 52), i1: r.i1 } : { i0: 0, i1: r.i1 };
  const trend = useMemo(() => bucketSeries(tr, tg, { kwh: ser, teq: (d) => PROD_TEQ[d], cost: (d) => dailyCost(d, cfg) * (ser(d) / CONS[d]) }).map((x: any) => ({ ...x, int: x.kwh / x.teq, costL: x.cost / 1e5 })), [tg, r, cfg, filters.dept]);
  const cmpBar = (items: { name: string; f: (rr: Range) => number }[]) => items.map((it) => ({ name: it.name, cur: it.f(r), prev: cmp ? it.f(cmp) : 0 }));
  const lineCmp = useMemo(() => cmpBar(LINES.map((L) => ({ name: L.id, f: (rr: Range) => sum(LINE[L.idx].kwh, rr.i0, rr.i1) }))), [r, cmp]);
  const deptCmp = useMemo(() => cmpBar(DEPARTMENTS.map((d) => ({ name: d.name.replace('Distribution ', ''), f: (rr: Range) => deptKwh(d.id, rr) }))), [r, cmp]);
  const utilCmp = useMemo(() => cmpBar(UTILITIES.map((u) => ({ name: u.name.split(' ')[0], f: (rr: Range) => sum(UTIL_KWH[u.key], rr.i0, rr.i1) }))), [r, cmp]);
  const machCmp = useMemo(() => {
    const all = LINES.flatMap((L) => L.machines.map((M, m) => ({ name: `${L.id} ${M.name}`, f: (rr: Range) => { let v = 0; for (let d = rr.i0; d <= rr.i1; d++) v += machineDay(L.idx, m, d).kwh; return v; } })));
    return cmpBar(all).sort((a, b) => b.cur - a.cur).slice(0, 12);
  }, [r, cmp]);
  const shiftCmp = useMemo(() => [0, 1, 2].map((s) => { let k = 0, t = 0; LINES.forEach((L) => { const m = lineMetrics(L.idx, r, s); k += m.kwh; t += m.good * L.teq; }); return { label: `Shift ${'ABC'[s]}`, kwh: k, int: safeDiv(k, t) }; }), [r]);
  const skuCmp = useMemo(() => LINES.flatMap((L) => { const m = lineMetrics(L.idx, r); return L.skus.map((s, k) => ({ sku: s.code, line: L.id, prod: m.skuProd[k], unit: L.unit, kwh: m.skuKwh[k], sec: safeDiv(m.skuKwh[k], m.skuProd[k]), idx: safeDiv(safeDiv(m.skuKwh[k], m.skuProd[k]), safeDiv(m.kwhS[0], m.prod)) * 100 })); }), [r]);
  const heatDays = useMemo(() => { const out: number[] = []; for (let d = Math.max(r.i0, r.i1 - 20); d <= r.i1; d++) out.push(d); return out; }, [r]);
  const heat = heatDays.map((d) => plantHourly(d).map((v) => v * (ser(d) / INCOMING[d])));
  return (
    <div>
      <PageHeader title="Energy Analytics & Period Comparison" sub={`${deptName} · % change = (current − previous) / previous × 100; n/a when previous is zero or missing`} />
      <Panel title="Standard period comparisons" sub="Production normalised to tonne-equivalent; cost at ToD tariff; carbon at configured emission factors">
        <DataTable exportName="period-comparison" cols={[
          { key: 'name', label: 'Comparison' }, { key: 'cur', label: 'Current kWh', num: true }, { key: 'prev', label: 'Previous kWh', num: true, render: (x: any) => (x.prev == null ? 'n/a' : n0(x.prev)) },
          { key: 'abs', label: 'Abs. change', num: true, value: (x: any) => (x.prev == null ? 0 : x.cur - x.prev), render: (x: any) => (x.prev == null ? 'n/a' : n0(x.cur - x.prev)) },
          { key: 'pc', label: '% change', num: true, value: (x: any) => pct(x.cur, x.prev) ?? 0, render: (x: any) => <span className={(pct(x.cur, x.prev) ?? 0) > 0 ? 'up-bad' : 'up-good'}>{pctS(pct(x.cur, x.prev))}</span> },
          { key: 'pp', label: 'Production Δ', num: true, render: (x: any) => pctS(pct(x.prod, x.prodPrev)) },
          { key: 'ip', label: 'Intensity Δ', num: true, render: (x: any) => pctS(x.prodPrev == null ? null : pct(x.cur / x.prod, (x.prev ?? 0) / x.prodPrev)) },
          { key: 'cp', label: 'Cost Δ', num: true, render: (x: any) => pctS(pct(x.cost, x.costPrev)) }, { key: 'co', label: 'Carbon Δ', num: true, render: (x: any) => pctS(pct(x.co2, x.co2Prev)) },
          { key: 'note', label: 'Note', render: (x: any) => <span className="muted">{x.note}</span> },
        ]} rows={comps} />
      </Panel>
      <div className="grid g2 mt">
        <Panel title="Energy, intensity & cost trend" actions={<Tabs tabs={[{ key: 'day', label: 'Daily' }, { key: 'week', label: 'Weekly' }, { key: 'month', label: 'Monthly' }, { key: 'quarter', label: 'Quarterly' }, { key: 'year', label: 'Annual' }]} value={tg} onChange={setTg} />}>
          <Combo data={trend} series={[{ key: 'kwh', name: 'kWh', color: C.blue }, { key: 'int', name: 'kWh/t-eq', type: 'line', color: C.amber, axis: 'right' }]} height={250} digits={1} />
        </Panel>
        <Panel title="Production vs energy trend"><Combo data={trend} series={[{ key: 'kwh', name: 'kWh', type: 'area', color: C.blue }, { key: 'teq', name: 'Production t-eq', type: 'line', color: C.green, axis: 'right' }, { key: 'costL', name: 'Cost ₹ lakh', type: 'line', color: C.violet, axis: 'right', dashed: true }]} height={250} digits={1} /></Panel>
      </div>
      <div className="grid g3 mt">
        <Panel title="Department comparison" sub={cmpLabel}><Combo data={deptCmp} x="name" series={[{ key: 'cur', name: 'Current', color: C.blue }, { key: 'prev', name: 'Previous', color: '#334f80' }]} height={230} /></Panel>
        <Panel title="Line comparison"><Combo data={lineCmp} x="name" series={[{ key: 'cur', name: 'Current', color: C.cyan }, { key: 'prev', name: 'Previous', color: '#2b5470' }]} height={230} /></Panel>
        <Panel title="Utility comparison"><Combo data={utilCmp} x="name" series={[{ key: 'cur', name: 'Current', color: C.violet }, { key: 'prev', name: 'Previous', color: '#46407a' }]} height={230} /></Panel>
        <Panel title="Machine comparison (top 12)" className="span2"><Combo data={machCmp} x="name" series={[{ key: 'cur', name: 'Current', color: C.teal }, { key: 'prev', name: 'Previous', color: '#1f5752' }]} height={250} /></Panel>
        <Panel title="Shift comparison" sub="All lines"><Combo data={shiftCmp} series={[{ key: 'kwh', name: 'kWh', color: C.blue }, { key: 'int', name: 'kWh/t-eq', type: 'line', color: C.amber, axis: 'right' }]} height={250} digits={1} /></Panel>
      </div>
      <div className="grid g2 mt">
        <Panel title="SKU comparison" sub="SKU SEC indexed to its line's running SEC (100 = line average) – avoids mixing units">
          <DataTable exportName="sku-comparison" cols={[{ key: 'sku', label: 'SKU' }, { key: 'line', label: 'Line' }, { key: 'prod', label: 'Qty', num: true, render: (x: any) => `${n0(x.prod)} ${x.unit}` }, { key: 'kwh', label: 'kWh', num: true }, { key: 'sec', label: 'kWh/unit', num: true, render: (x: any) => n2(x.sec) }, { key: 'idx', label: 'Index', num: true, bar: true, render: (x: any) => n0(x.idx) }]} rows={skuCmp} maxHeight={330} initialSort={{ key: 'idx', dir: -1 }} />
        </Panel>
        <Panel title="Energy heatmap by hour and day" sub={`${deptName}, last ${heatDays.length} days of range (kWh per hour)`}>
          <Heatmap rows={heatDays.map((d) => DATES[d].slice(5))} cols={Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))} values={heat} />
        </Panel>
      </div>
    </div>
  );
}

// ---------------- insights ----------------
const PEOPLE = ['Energy Manager', 'Utility Manager', 'Production Manager – Bakery', 'Maintenance Lead', 'Electrical Head', 'Logistics Head'];

function InsightCard({ i }: { i: Insight }) {
  const { insightState, setInsightState, persona } = useStore();
  const st = insightState[i.id] ?? { status: 'Open' };
  const [open, setOpen] = useState(false);
  return (
    <div className="ins">
      <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}><SevBadge s={i.severity} /><Badge kind="info">{i.category}</Badge><Badge kind={st.status === 'Resolved' ? 'good' : st.status === 'Open' ? 'grey' : 'low'}>{st.status}{st.assignee ? ` → ${st.assignee}` : ''}</Badge></div>
          <div className="ins-t" style={{ marginTop: 6 }}>{i.title}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{i.description}</div>
        </div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          {i.link && <a className="btn small" href={i.link}>View</a>}
          <button className="btn small" onClick={() => setOpen(!open)}>{open ? 'Less' : 'Details'}</button>
        </div>
      </div>
      <div className="ins-m">
        <div><span>Impacted asset</span>{i.asset}</div><div><span>Department</span>{i.department}</div><div><span>Metric</span>{i.metric}</div><div><span>Period</span>{i.period}</div>
        <div><span>Actual</span>{i.actual}</div><div><span>Reference</span>{i.reference}</div><div><span>Deviation</span>{pctS(i.deviation)}</div><div><span>Est. impact</span>{i.energyImpact ? kwhS(i.energyImpact) + ' · ' : ''}{i.costImpact ? rsS(i.costImpact) : '—'}</div>
      </div>
      {open && (
        <div className="mt">
          <div className="note"><b>Recommended action:</b> {i.action}<br /><b>How it is calculated:</b> {i.calc}</div>
          {i.trend.length > 1 && <div className="mt"><Combo data={i.trend} series={[{ key: 'value', name: i.metric, type: 'line', color: C.cyan }, ...(i.trend[0].ref != null ? [{ key: 'ref', name: 'Reference', type: 'line' as const, color: C.amber, dashed: true }] : [])]} height={150} digits={2} /></div>}
          <div className="row mt">
            <button className="btn small" onClick={() => setInsightState(i.id, { ...st, status: 'Acknowledged' })}>✓ Acknowledge</button>
            <select value={st.assignee ?? ''} onChange={(e) => setInsightState(i.id, { ...st, status: 'Assigned', assignee: e.target.value })}><option value="">Assign to…</option>{PEOPLE.map((p) => <option key={p}>{p}</option>)}</select>
            <button className="btn small" onClick={() => setInsightState(i.id, { ...st, status: 'Resolved' })}>Resolve</button>
            <input placeholder="Note / corrective action" defaultValue={st.note} onBlur={(e) => setInsightState(i.id, { ...st, note: e.target.value })} style={{ flex: 1, minWidth: 160 }} />
            <span className="muted" style={{ fontSize: 11 }}>as {persona?.title}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function Insights() {
  const { r, cmp, cfg, insightState, cmpLabel } = useView();
  const all = useMemo(() => generateInsights(r, cmp, cfg), [r, cmp, cfg]);
  const [sev, setSev] = useState('ALL');
  const [cat, setCat] = useState('ALL');
  const [st, setSt] = useState('ALL');
  const list = all.filter((i) => (sev === 'ALL' || i.severity === sev) && (cat === 'ALL' || i.category === cat) && (st === 'ALL' || (insightState[i.id]?.status ?? 'Open') === st));
  const cats = Array.from(new Set(all.map((i) => i.category)));
  const impact = all.reduce((s, i) => s + Math.max(0, i.costImpact), 0);
  return (
    <div>
      <PageHeader title="Energy Insights" sub={`Rule-based engine · every insight is calculated from the dataset and explains its method · ${cmpLabel}`} />
      <div className="grid g4">
        <Kpi label="Insights generated" value={String(all.length)} change={null} cmpLabel="selected period" status="info" />
        <Kpi label="High / critical" value={String(all.filter((i) => i.severity === 'High' || i.severity === 'Critical').length)} change={null} cmpLabel="need attention" status="bad" />
        <Kpi label="Open" value={String(all.filter((i) => (insightState[i.id]?.status ?? 'Open') === 'Open').length)} change={null} cmpLabel="not yet acknowledged" status="warn" />
        <Kpi label="Estimated cost impact" value={rs(impact)[0]} unit={rs(impact)[1]} change={null} cmpLabel="sum of positive impacts (estimate)" status="warn" />
      </div>
      <div className="row mt">
        <select value={sev} onChange={(e) => setSev(e.target.value)}><option value="ALL">All severities</option>{['Critical', 'High', 'Medium', 'Low', 'Informational'].map((s) => <option key={s}>{s}</option>)}</select>
        <select value={cat} onChange={(e) => setCat(e.target.value)}><option value="ALL">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={st} onChange={(e) => setSt(e.target.value)}><option value="ALL">All statuses</option>{['Open', 'Acknowledged', 'Assigned', 'Resolved'].map((s) => <option key={s}>{s}</option>)}</select>
        <span className="muted">{list.length} shown</span>
      </div>
      <div className="mt">{list.map((i) => <InsightCard key={i.id} i={i} />)}</div>
    </div>
  );
}

// ---------------- losses ----------------
export function Losses() {
  const { r, cfg, P, gran } = useView();
  const days = r.i1 - r.i0 + 1;
  const rate = P.cost.perKwh;
  const loss = useMemo(() => {
    const L = LINES.map((Ln) => lineMetrics(Ln.idx, r));
    const st = (s: number) => L.reduce((a, m) => a + m.kwhS[s], 0);
    const utilOver = UTILITIES.reduce((s, u) => { const k = sum(UTIL_KWH[u.key], r.i0, r.i1), o = sum(UTIL[u.key].sysOut, r.i0, r.i1); const b = utilSecBaseline(u.key, cfg); return s + Math.max(0, k - b * o); }, 0);
    let pkEx = 0; const months = new Set<string>(); for (let d = r.i0; d <= r.i1; d++) months.add(DATES[d].slice(0, 7));
    months.forEach((m) => { let mx = 0; for (let d = r.i0; d <= r.i1; d++) if (DATES[d].startsWith(m)) mx = Math.max(mx, PEAK_KVA[d]); pkEx += Math.max(0, mx - cfg.targets.contractDemandKva) * cfg.tariff.demandCharge * 1.5; });
    const dist = P.incoming - P.cons;
    const unload = [0, 1, 2].reduce((s, c) => s + sum(UTIL.AIR.unloadKwh[c], r.i0, r.i1), 0);
    const hvacNp = UTIL.HVAC.nonProdKwh.reduce((s, a) => s + sum(a, r.i0, r.i1), 0);
    const chl2 = sum(UTIL.CHL.kwh[1], r.i0, r.i1) - sum(UTIL.CHL.out[1], r.i0, r.i1) * safeDiv(sum(UTIL.CHL.kwh[0], r.i0, r.i1), sum(UTIL.CHL.out[0], r.i0, r.i1));
    const sched = UTILITIES.reduce((s, u) => s + UTIL[u.key].nonProdKwh.reduce((a, x) => a + sum(x, r.i0, r.i1), 0), 0) - hvacNp;
    const it = (name: string, kwhV: number, type: 'Measured' | 'Estimated' | 'Calculated', avoid: number, action: string, rs0?: number) => ({ name, kwh: kwhV, cost: rs0 ?? kwhV * rate, type, avoid, monthly: ((rs0 ?? kwhV * rate) / days) * 30.4, annual: ((rs0 ?? kwhV * rate) / days) * 365, saving: (rs0 ?? kwhV * rate) * avoid / 100 * 365 / days, action });
    return [
      it('Idle energy consumption (lines)', st(1), 'Measured', 50, 'Standby interlocks; reduce starved/blocked time'),
      it('Energy during shutdown / not scheduled', st(9) + st(4), 'Measured', 60, 'Auto-shutdown of ovens, plodders, pulverisers when no order'),
      it('Energy during changeover & setup', st(3) + st(2), 'Measured', 25, 'SMED, keep heaters at reduced setpoint during changeover'),
      it('Energy during downtime (unplanned + fault)', st(5) + st(6), 'Measured', 40, 'Reduce breakdowns; power down after 10 min stop'),
      it('Energy during cleaning (CIP)', st(8), 'Measured', 15, 'Optimise CIP temperature and duration – largely necessary'),
      it('Utility over-consumption vs baseline', utilOver, 'Estimated', 70, 'Restore utility SEC to baseline (see Utilities)'),
      it('Peak demand penalty', 0, 'Calculated', 100, 'Demand controller, stagger high-load starts', pkEx),
      it('Power factor penalty', 0, 'Calculated', 100, 'Repair APFC stages, target PF ≥ 0.98', P.cost.pf),
      it('Distribution losses & unaccounted', dist, 'Measured', 20, 'Transformer loading balance; find unmetered loads'),
      it('Excessive compressor unloading', unload, 'Calculated', 70, 'Sequencer + VFD trim compressor'),
      it('Excessive HVAC consumption (outside production)', hvacNp, 'Estimated', 45, 'BMS schedule linked to production calendar'),
      it('Excessive chiller consumption (Ch02 vs Ch01)', Math.max(0, chl2), 'Estimated', 80, 'Efficiency-based chiller sequencing; tube cleaning'),
      it('Utility energy beyond operating schedule', sched, 'Estimated', 35, 'Isolate headers, pumps and fans outside schedule'),
    ];
  }, [r, cfg, P]);
  const totK = loss.reduce((s, x) => s + x.kwh, 0), totR = loss.reduce((s, x) => s + x.cost, 0), save = loss.reduce((s, x) => s + x.saving, 0);
  const wf = [{ name: 'Total consumed', value: P.incoming, total: true }, ...loss.filter((x) => x.kwh > 0).sort((a, b) => b.kwh - a.kwh).slice(0, 7).map((x) => ({ name: x.name.split(' (')[0].replace('Energy during ', '').replace('consumption', '').slice(0, 22), value: -x.kwh })), { name: 'Remaining (productive + other)', value: P.incoming - loss.filter((x) => x.kwh > 0).sort((a, b) => b.kwh - a.kwh).slice(0, 7).reduce((s, x) => s + x.kwh, 0), total: true }];
  const trend = useMemo(() => bucketSeries({ i0: 0, i1: r.i1 }, 'month', {
    idle: (d) => LINES.reduce((s, L) => s + LINE[L.idx].kwhS[d * NS + 1], 0),
    shutdown: (d) => LINES.reduce((s, L) => s + LINE[L.idx].kwhS[d * NS + 9] + LINE[L.idx].kwhS[d * NS + 4], 0),
    change: (d) => LINES.reduce((s, L) => s + LINE[L.idx].kwhS[d * NS + 3] + LINE[L.idx].kwhS[d * NS + 2], 0),
    dist: (d) => INCOMING[d] - CONS[d],
  }), [r]);
  return (
    <div>
      <PageHeader title="Energy Loss Analysis" sub="Measured, calculated and estimated losses kept separate. Not all idle or shutdown energy is avoidable – each line states the avoidable share assumed." />
      <div className="grid g4">
        <Kpi label="Identified loss energy" value={kwh(totK)[0]} unit={kwh(totK)[1]} change={null} cmpLabel={`${n1((totK / P.incoming) * 100)}% of incoming`} status="warn" />
        <Kpi label="Loss cost (period)" value={rs(totR)[0]} unit={rs(totR)[1]} change={null} cmpLabel="incl. penalties" status="warn" />
        <Kpi label="Annualised loss" value={rs((totR / days) * 365)[0]} unit={rs((totR / days) * 365)[1]} change={null} cmpLabel="run-rate" status="bad" />
        <Kpi label="Estimated saving opportunity" value={rs(save)[0]} unit={rs(save)[1] + '/yr'} change={null} cmpLabel="avoidable share applied" status="good" href="#/projects" />
      </div>
      <div className="grid g2 mt">
        <Panel title="Energy loss waterfall" sub="Incoming energy minus the largest loss categories"><Waterfall data={wf} height={280} /></Panel>
        <Panel title="Loss trend (monthly, 2 years)"><Combo data={trend} series={[{ key: 'idle', name: 'Idle', stack: 'l', color: C.amber }, { key: 'shutdown', name: 'Shutdown / unscheduled', stack: 'l', color: C.red }, { key: 'change', name: 'Changeover & setup', stack: 'l', color: C.violet }, { key: 'dist', name: 'Distribution', stack: 'l', color: C.grey }]} height={280} /></Panel>
      </div>
      <Panel title="Loss register" className="mt">
        <DataTable exportName="energy-losses" cols={[
          { key: 'name', label: 'Loss category' }, { key: 'type', label: 'Basis', render: (x: any) => <Badge kind={x.type === 'Measured' ? 'good' : x.type === 'Calculated' ? 'low' : 'est'}>{x.type}</Badge> },
          { key: 'kwh', label: 'Energy loss kWh', num: true, bar: true }, { key: 'cost', label: 'Cost ₹', num: true }, { key: 'monthly', label: 'Monthly ₹', num: true }, { key: 'annual', label: 'Annualised ₹', num: true },
          { key: 'avoid', label: 'Avoidable %', num: true }, { key: 'saving', label: 'Saving opp. ₹/yr', num: true }, { key: 'action', label: 'Recommended corrective action' },
        ]} rows={loss} />
      </Panel>
    </div>
  );
}

// ---------------- alerts ----------------
export function Alerts() {
  const { alerts, updateAlert, persona, r, cfg, setCfg } = useView();
  const [view, setView] = useState<'active' | 'history' | 'rules'>('active');
  const [sel, setSel] = useState<Alert | null>(null);
  const [sev, setSev] = useState('ALL');
  const [type, setType] = useState('ALL');
  const active = alerts.filter((a) => a.status !== 'Resolved');
  const hist = alerts.filter((a) => a.d >= r.i0 && a.d <= r.i1);
  const list = (view === 'active' ? active : hist).filter((a) => (sev === 'ALL' || a.severity === sev) && (type === 'ALL' || a.type === type));
  const types = Array.from(new Set(alerts.map((a) => a.type)));
  const cnt = (s: string) => active.filter((a) => a.severity === s).length;
  const byType = types.map((t) => ({ name: t, value: hist.filter((a) => a.type === t).length })).sort((a, b) => b.value - a.value);
  const cur = sel ? alerts.find((a) => a.id === sel.id)! : null;
  const [comment, setComment] = useState('');
  return (
    <div>
      <PageHeader title="Energy Alerts & Events" sub="Configurable alert rules · acknowledge, assign, escalate, resolve with root cause and corrective action" />
      <div className="grid g6">
        {['Critical', 'High', 'Medium', 'Low', 'Informational'].map((s) => <Kpi key={s} label={`${s} – active`} value={String(cnt(s))} change={null} cmpLabel="open alerts" status={s === 'Critical' ? (cnt(s) ? 'bad' : 'good') : s === 'High' ? 'warn' : 'info'} />)}
        <Kpi label="Alerts in period" value={String(hist.length)} change={null} cmpLabel="history for date range" status="info" />
      </div>
      <Tabs tabs={[{ key: 'active', label: `Active alerts (${active.length})` }, { key: 'history', label: `Alert history (${hist.length})` }, { key: 'rules', label: 'Alert rules' }]} value={view} onChange={setView} />
      {view !== 'rules' ? (
        <div className="grid g3">
          <Panel className="span2" title={view === 'active' ? 'Active alerts' : 'Alert history'} actions={<>
            <select value={sev} onChange={(e) => setSev(e.target.value)}><option value="ALL">All severities</option>{['Critical', 'High', 'Medium', 'Low', 'Informational'].map((s) => <option key={s}>{s}</option>)}</select>
            <select value={type} onChange={(e) => setType(e.target.value)}><option value="ALL">All types</option>{types.map((t) => <option key={t}>{t}</option>)}</select></>}>
            <DataTable exportName="alerts" pageSize={14} onRow={(a: any) => setSel(a)} cols={[
              { key: 'time', label: 'Time' }, { key: 'severity', label: 'Severity', render: (a: any) => <SevBadge s={a.severity} /> }, { key: 'type', label: 'Type' }, { key: 'asset', label: 'Asset' }, { key: 'message', label: 'Message' },
              { key: 'status', label: 'Status', render: (a: any) => <Badge kind={a.status === 'Resolved' ? 'good' : a.status === 'Active' ? 'high' : a.status === 'Escalated' ? 'crit' : 'low'}>{a.status}</Badge> }, { key: 'assignee', label: 'Assignee' },
            ]} rows={list} />
          </Panel>
          <Panel title="Alerts by type" sub="Selected date range"><HBar data={byType} unit="alerts" labelWidth={170} /></Panel>
        </div>
      ) : (
        <Panel title="Alert rules" sub="Thresholds are configurable; changes regenerate alerts from the dataset">
          <table className="tbl"><thead><tr><th>Rule</th><th>Condition</th><th>Severity</th><th>Threshold</th></tr></thead><tbody>
            <tr><td>Low power factor</td><td>Daily PF below threshold − 0.01</td><td><SevBadge s="High" /></td><td><input type="number" step="0.01" value={cfg.tariff.pfThreshold} onChange={(e) => setCfg({ ...cfg, tariff: { ...cfg.tariff, pfThreshold: +e.target.value } })} style={{ width: 90 }} disabled={!persona?.canEdit} /></td></tr>
            <tr><td>Abnormal power demand</td><td>Daily max kVA &gt; contract demand</td><td><SevBadge s="Critical" /></td><td><input type="number" value={cfg.targets.contractDemandKva} onChange={(e) => setCfg({ ...cfg, targets: { ...cfg.targets, contractDemandKva: +e.target.value } })} style={{ width: 90 }} disabled={!persona?.canEdit} /> kVA</td></tr>
            <tr><td>Energy target exceeded</td><td>Monthly kWh &gt; budget</td><td><SevBadge s="Medium" /></td><td><input type="number" value={cfg.targets.plantMonthlyKwh} onChange={(e) => setCfg({ ...cfg, targets: { ...cfg.targets, plantMonthlyKwh: +e.target.value } })} style={{ width: 110 }} disabled={!persona?.canEdit} /> kWh</td></tr>
            <tr><td>Excessive energy intensity</td><td>Weekly line SEC &gt; target × 1.12</td><td><SevBadge s="Medium" /></td><td>target − {cfg.targets.lineSecPct}% of baseline</td></tr>
            <tr><td>High transformer loading</td><td>Daily peak kVA &gt; 90% of rating</td><td><SevBadge s="High" /></td><td>90%</td></tr>
            <tr><td>Idle energy consumption</td><td>Weekly idle + unscheduled share &gt; 16%</td><td><SevBadge s="Medium" /></td><td>16%</td></tr>
            <tr><td>Utility efficiency deterioration</td><td>Compressor SPC &gt; baseline × 1.10</td><td><SevBadge s="High" /></td><td>130 Wh/Nm³</td></tr>
            <tr><td>Energy balance mismatch</td><td>Unaccounted energy &gt; 3.4%</td><td><SevBadge s="Medium" /></td><td>3.4%</td></tr>
            <tr><td>Meter communication failure / data missing / device offline</td><td>Completeness &lt; 98% or no data &gt; 15 min</td><td><SevBadge s="High" /></td><td>98% · 15 min</td></tr>
            <tr><td>High kW / high current</td><td>Above rated or typical band</td><td><SevBadge s="Low" /></td><td>Per asset</td></tr>
          </tbody></table>
          {!persona?.canEdit && <div className="note mt">Your persona ({persona?.title}) can view rules but not change thresholds.</div>}
        </Panel>
      )}
      {cur && (
        <Modal title={`${cur.id} · ${cur.type}`} onClose={() => setSel(null)}>
          <div className="row" style={{ marginBottom: 8 }}><SevBadge s={cur.severity} /><Badge kind="info">{cur.status}</Badge><span className="muted">{cur.time}</span></div>
          <div className="ins-m" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div><span>Asset</span>{cur.asset}</div><div><span>Department</span>{cur.department}</div><div><span>Value / threshold</span>{cur.value} / {cur.threshold}</div>
          </div>
          <p>{cur.message}</p>
          <div className="row">
            <button className="btn small" onClick={() => updateAlert(cur.id, { status: 'Acknowledged' })}>✓ Acknowledge</button>
            <select value={cur.assignee ?? ''} onChange={(e) => updateAlert(cur.id, { status: 'Assigned', assignee: e.target.value })}><option value="">Assign to…</option>{PEOPLE.map((p) => <option key={p}>{p}</option>)}</select>
            <button className="btn small" onClick={() => updateAlert(cur.id, { status: 'Escalated', assignee: 'Plant Head' })}>⇪ Escalate to Plant Head</button>
          </div>
          <div className="form-g mt">
            <label>Root cause<textarea rows={2} defaultValue={cur.rootCause} onBlur={(e) => updateAlert(cur.id, { rootCause: e.target.value })} /></label>
            <label>Corrective action<textarea rows={2} defaultValue={cur.action} onBlur={(e) => updateAlert(cur.id, { action: e.target.value })} /></label>
          </div>
          <div className="mt"><b>Comments</b>{cur.comments.map((c, i) => <div key={i} className="muted" style={{ fontSize: 12 }}>{c.at} · {c.by}: {c.text}</div>)}</div>
          <div className="row mt"><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" style={{ flex: 1 }} /><button className="btn small" onClick={() => { if (comment) { updateAlert(cur.id, { comments: [...cur.comments, { by: persona?.name ?? 'User', text: comment, at: new Date().toLocaleString() }] }); setComment(''); } }}>Add</button></div>
          <div className="row mt" style={{ justifyContent: 'flex-end' }}><button className="btn primary" onClick={() => { updateAlert(cur.id, { status: 'Resolved' }); setSel(null); }}>Resolve</button></div>
        </Modal>
      )}
    </div>
  );
}
export { baselineRange, buckets, costPeriod, co2Period, BUILDINGS, BLD, UTIL_TOTAL, NONPROD_FRAC, PALETTE, n2 };
