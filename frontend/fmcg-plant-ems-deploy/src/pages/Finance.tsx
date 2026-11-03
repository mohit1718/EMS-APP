import { useMemo, useState } from 'react';
import { BUILDINGS, LINES, UTILITIES } from '../data/assets';
import { baselineRange, buckets, co2Period, costPeriod, DEFAULT_CONFIG, DEPARTMENTS, deptKwh, expectedPlantKwh, lineBaselineSec, lineMetrics, lineTargetSec, pct, plantRegression, Range, safeDiv, sum, utilSec, utilSecBaseline } from '../data/engine';
import { Project } from '../data/insights';
import { BLD, CONS, DATES, DAYS, DG_FUEL, GRID, INCOMING, LINE, PROD_TEQ, SOLAR_KWH, UTIL, UTIL_KWH, EXPORT, PEAK_KVA, PF } from '../data/sim';
import { METERS } from '../data/meters';
import { C, downloadCsv, kwh, kwhS, n0, n1, n2, PALETTE, pctS, rs, rsS } from '../format';
import { Badge, Combo, DataTable, Donut, HBar, Kpi, Modal, PageHeader, Panel, Tabs } from '../components/ui';
import { bucketSeries, useView } from './common';
import { budgetFor } from './Executive';

// ---------------- cost ----------------
export function Cost() {
  const { r, cmp, cfg, setCfg, P, Pc, persona, cmpLabel } = useView();
  const c = P.cost;
  const monthly = useMemo(() => buckets({ i0: 0, i1: DAYS - 1 }, 'month').map((b) => { const x = costPeriod({ i0: b.i0, i1: b.i1 }, cfg); return { label: b.label, energy: x.energy / 1e5, demand: x.demand / 1e5, duty: (x.duty + x.other) / 1e5, pf: x.pf / 1e5, dg: x.dg / 1e5, solar: x.solar / 1e5, fuel: x.fuel / 1e5, perKwh: x.perKwh }; }), [cfg]);
  const rate = c.perKwh;
  const lineCost = LINES.map((L) => { const m = lineMetrics(L.idx, r); return { name: L.short, kwh: m.kwh, cost: m.kwh * rate, unit: L.unit, perUnit: safeDiv(m.kwh * rate, m.good), perBatch: safeDiv(m.kwh * rate, m.batches), perTonne: safeDiv(m.kwh * rate, m.good * L.teq) }; });
  const deptCost = DEPARTMENTS.map((d) => ({ name: d.name, kwh: deptKwh(d.id, r), cost: deptKwh(d.id, r) * rate }));
  const utilCost = UTILITIES.map((u) => ({ name: u.name, kwh: sum(UTIL_KWH[u.key], r.i0, r.i1), cost: sum(UTIL_KWH[u.key], r.i0, r.i1) * rate + (u.key === 'BLR' ? c.fuel : 0) }));
  const t = cfg.tariff;
  const edit = persona?.canEdit;
  const setT = (k: keyof typeof t, v: number) => setCfg({ ...cfg, tariff: { ...t, [k]: v } });
  const bottles = [0, 2].map((l) => { const m = lineMetrics(l, r); return { name: LINES[l].short, v: safeDiv(m.kwh * rate, m.good) }; });
  const annual = (c.total / P.days) * 365;
  return (
    <div>
      <PageHeader title="Energy Cost Management" sub={`Configurable tariff engine (ToD, demand, duty, PF, DG, solar, fuel) · ${cmpLabel}`} />
      <div className="grid g6">
        <Kpi label="Total energy cost" value={rs(c.total)[0]} unit={rs(c.total)[1]} change={pct(c.total, Pc?.cost.total)} cmpLabel={cmpLabel} />
        <Kpi label="Electricity cost" value={rs(c.electricity)[0]} unit={rs(c.electricity)[1]} change={pct(c.electricity, Pc?.cost.electricity)} cmpLabel={cmpLabel} />
        <Kpi label="Blended cost per kWh" value={'₹' + n2(c.perKwh)} unit="/kWh" change={pct(c.perKwh, Pc?.cost.perKwh)} cmpLabel={cmpLabel} />
        <Kpi label="Cost per t-eq produced" value={'₹' + n0(c.total / P.teq)} unit="/t-eq" change={Pc ? pct(c.total / P.teq, Pc.cost.total / Pc.teq) : null} cmpLabel={cmpLabel} />
        <Kpi label="Demand charges" value={rs(c.demand)[0]} unit={rs(c.demand)[1]} change={pct(c.demand, Pc?.cost.demand)} cmpLabel={`MD ${n0(c.mdKva)} kVA`} />
        <Kpi label="PF penalty" value={rs(c.pf)[0]} unit={rs(c.pf)[1]} change={null} cmpLabel={c.pf > 0 ? 'monthly PF below threshold' : 'no penalty'} status={c.pf > 0 ? 'bad' : 'good'} />
        <Kpi label="DG generation cost" value={rs(c.dg)[0]} unit={rs(c.dg)[1]} change={pct(c.dg, Pc?.cost.dg)} cmpLabel={cmpLabel} />
        <Kpi label="Solar energy cost" value={rs(c.solar)[0]} unit={rs(c.solar)[1]} change={null} cmpLabel={`₹${t.solarRate}/kWh PPA`} status="good" />
        <Kpi label="Boiler fuel cost" value={rs(c.fuel)[0]} unit={rs(c.fuel)[1]} change={pct(c.fuel, Pc?.cost.fuel)} cmpLabel={cmpLabel} />
        <Kpi label="Electricity duty + other" value={rs(c.duty + c.other)[0]} unit={rs(c.duty + c.other)[1]} change={null} cmpLabel={`${t.duty}% duty`} status="info" />
        <Kpi label="Annualised energy cost" value={rs(annual)[0]} unit={rs(annual)[1]} change={null} cmpLabel={`budget ${rsS(cfg.targets.annualBudgetRs)}`} status={annual > cfg.targets.annualBudgetRs ? 'bad' : 'good'} />
        <Kpi label="Cost per 1,000 bottles" value={'₹' + n0(bottles[0].v)} unit="L01" change={null} cmpLabel={`L03 PET ₹${n0(bottles[1].v)}`} status="info" />
      </div>
      <div className="grid g3 mt">
        <Panel title="Monthly cost trend (2 years)" sub="₹ lakh by component" className="span2">
          <Combo data={monthly} series={[{ key: 'energy', name: 'Energy (ToD)', stack: 'c', color: C.blue }, { key: 'demand', name: 'Demand', stack: 'c', color: C.violet }, { key: 'duty', name: 'Duty & other', stack: 'c', color: C.grey }, { key: 'pf', name: 'PF penalty', stack: 'c', color: C.red }, { key: 'dg', name: 'DG', stack: 'c', color: '#94a3b8' }, { key: 'solar', name: 'Solar', stack: 'c', color: C.amber }, { key: 'fuel', name: 'Boiler fuel', stack: 'c', color: C.teal }, { key: 'perKwh', name: '₹/kWh', type: 'line', color: C.cyan, axis: 'right' }]} height={280} digits={2} />
        </Panel>
        <Panel title="Cost breakdown (period)"><Donut height={150} unit="₹" data={[{ name: 'Energy (ToD)', value: c.energy, color: C.blue }, { name: 'Demand', value: c.demand, color: C.violet }, { name: 'Duty & other', value: c.duty + c.other, color: C.grey }, { name: 'PF penalty', value: c.pf, color: C.red }, { name: 'DG', value: c.dg, color: '#94a3b8' }, { name: 'Solar', value: c.solar, color: C.amber }, { name: 'Boiler fuel', value: c.fuel, color: C.teal }]} />
          <div className="mt"><b style={{ fontSize: 12 }}>Grid energy by ToD zone</b><HBar data={Object.entries(c.tod).map(([k, v]) => ({ name: k, value: v }))} unit="kWh" labelWidth={110} height={110} /></div>
        </Panel>
      </div>
      <div className="grid g3 mt">
        <Panel title="Department energy cost"><DataTable cols={[{ key: 'name', label: 'Department' }, { key: 'kwh', label: 'kWh', num: true }, { key: 'cost', label: 'Cost ₹', num: true, bar: true }]} rows={deptCost} exportName="dept-cost" /></Panel>
        <Panel title="Utility energy cost" sub="Boiler includes fuel"><DataTable cols={[{ key: 'name', label: 'Utility' }, { key: 'kwh', label: 'kWh', num: true }, { key: 'cost', label: 'Cost ₹', num: true, bar: true }]} rows={utilCost} exportName="utility-cost" /></Panel>
        <Panel title="Tariff configuration" sub={edit ? 'Editable – recalculates everything' : 'View only for your persona'}>
          <table className="tbl"><tbody>
            {t.zones.map((z, i) => <tr key={i}><td>{z.name} ({String(z.from).padStart(2, '0')}–{String(z.to).padStart(2, '0')})</td><td className="num"><input type="number" step="0.05" value={z.rate} disabled={!edit} style={{ width: 80 }} onChange={(e) => { const zones = t.zones.map((x, k) => (k === i ? { ...x, rate: +e.target.value } : x)); setCfg({ ...cfg, tariff: { ...t, zones } }); }} /> ₹/kWh</td></tr>)}
            {([['demandCharge', 'Demand charge', '₹/kVA/month'], ['duty', 'Electricity duty', '%'], ['otherPerKwh', 'Other charges (FAC etc.)', '₹/kWh'], ['pfThreshold', 'PF threshold', ''], ['pfPenaltyPct', 'PF penalty per 0.01', '% of energy'], ['dieselPrice', 'Diesel price', '₹/L'], ['dgOm', 'DG O&M', '₹/kWh'], ['solarRate', 'Solar PPA', '₹/kWh'], ['gasPrice', 'Natural gas', '₹/SCM']] as [keyof typeof t, string, string][]).map(([k, l, u]) => (
              <tr key={k}><td>{l}</td><td className="num"><input type="number" step="0.01" value={t[k] as number} disabled={!edit} style={{ width: 80 }} onChange={(e) => setT(k, +e.target.value)} /> {u}</td></tr>
            ))}
          </tbody></table>
          {edit && <button className="btn small mt" onClick={() => setCfg({ ...cfg, tariff: DEFAULT_CONFIG.tariff })}>Reset to default tariff</button>}
        </Panel>
      </div>
      <Panel title="Line energy cost & cost per unit production" className="mt">
        <DataTable exportName="line-cost" cols={[{ key: 'name', label: 'Line' }, { key: 'kwh', label: 'kWh', num: true }, { key: 'cost', label: 'Cost ₹', num: true, bar: true }, { key: 'perUnit', label: 'Cost per unit', num: true, render: (x: any) => `₹${n2(x.perUnit)} / ${x.unit}` }, { key: 'perTonne', label: '₹ per tonne-eq', num: true, render: (x: any) => n0(x.perTonne) }, { key: 'perBatch', label: '₹ per batch', num: true }]} rows={lineCost} />
      </Panel>
    </div>
  );
}

// ---------------- carbon ----------------
export function Carbon() {
  const { r, cmp, cfg, setCfg, P, Pc, persona, cmpLabel } = useView();
  const co = P.co2;
  const ef = cfg.ef.grid / 1000; // t/kWh
  const monthly = useMemo(() => buckets({ i0: 0, i1: DAYS - 1 }, 'month').map((b) => { const x = co2Period(b, cfg); return { label: b.label, grid: x.grid, dg: x.dg, gas: x.gas, avoided: -x.avoided, int: (x.total / sum(PROD_TEQ, b.i0, b.i1)) * 1000 }; }), [cfg]);
  const blendedEf = (co.grid + co.dg) / (P.incoming - P.exported);
  const lines = LINES.map((L) => { const m = lineMetrics(L.idx, r); return { name: L.short, t: m.kwh * blendedEf, unit: L.unit, perUnit: safeDiv(m.kwh * blendedEf * 1000, m.good) }; });
  const depts = DEPARTMENTS.map((d) => ({ name: d.name, value: deptKwh(d.id, r) * blendedEf + (d.id === 'UTL' ? co.gas : 0) }));
  const utils = UTILITIES.map((u) => ({ name: u.name, value: sum(UTIL_KWH[u.key], r.i0, r.i1) * blendedEf + (u.key === 'BLR' ? co.gas : 0) }));
  const blds = BUILDINGS.map((b) => ({ name: b.name, value: sum(BLD[b.id].kwh, r.i0, r.i1) * blendedEf }));
  const yoyR = r.i0 - 364 >= 0 ? { i0: r.i0 - 364, i1: r.i1 - 364 } : null;
  const yoy = yoyR ? co2Period(yoyR, cfg) : null;
  const red = yoy ? -pct(co.total, yoy.total)! : null;
  const edit = persona?.canEdit;
  const bottlesCo2 = safeDiv(lineMetrics(0, r).kwh * blendedEf * 1000, lineMetrics(0, r).good);
  return (
    <div>
      <PageHeader title="Carbon & Sustainability" sub={`Scope 1 (DG diesel, boiler gas) + Scope 2 (grid electricity) · configurable emission factors · ${cmpLabel}`} />
      <div className="grid g6">
        <Kpi label="Total emissions" value={n0(co.total)} unit="tCO₂e" change={pct(co.total, Pc?.co2.total)} cmpLabel={cmpLabel} />
        <Kpi label="Scope 2 (grid)" value={n0(co.scope2)} unit="tCO₂e" change={pct(co.scope2, Pc?.co2.scope2)} cmpLabel={cmpLabel} />
        <Kpi label="Scope 1 (DG + boiler)" value={n0(co.scope1)} unit="tCO₂e" change={pct(co.scope1, Pc?.co2.scope1)} cmpLabel={cmpLabel} />
        <Kpi label="CO₂e per tonne-eq" value={n1((co.total / P.teq) * 1000)} unit="kg/t-eq" change={Pc ? pct(co.total / P.teq, Pc.co2.total / Pc.teq) : null} cmpLabel={cmpLabel} />
        <Kpi label="CO₂e per 1,000 bottles" value={n1(bottlesCo2)} unit="kg (L01)" change={null} cmpLabel="electricity share" status="info" />
        <Kpi label="Renewable energy" value={n1(P.renewablePct)} unit="%" change={pct(P.renewablePct, Pc?.renewablePct)} lowerIsBetter={false} cmpLabel={`${n0(co.avoided)} t avoided`} />
        <Kpi label="Grid electricity" value={kwh(P.grid)[0]} unit={kwh(P.grid)[1]} change={pct(P.grid, Pc?.grid)} cmpLabel={cmpLabel} />
        <Kpi label="DG fuel" value={n0(P.dgFuel)} unit="L" change={pct(P.dgFuel, Pc?.dgFuel)} cmpLabel={cmpLabel} />
        <Kpi label="Boiler gas" value={n0(P.fuelScm)} unit="SCM" change={pct(P.fuelScm, Pc?.fuelScm)} cmpLabel={cmpLabel} />
        <Kpi label="Solar generation" value={kwh(P.solar)[0]} unit={kwh(P.solar)[1]} change={pct(P.solar, Pc?.solar)} lowerIsBetter={false} cmpLabel={cmpLabel} />
        <Kpi label="Reduction vs last year" value={pctS(red)} change={red == null ? null : -red} cmpLabel={`target −${cfg.targets.carbonReductionPct}%`} status={red == null ? 'na' : red >= cfg.targets.carbonReductionPct ? 'good' : 'warn'} />
        <Kpi label="Annualised emissions" value={n0((co.total / P.days) * 365)} unit="tCO₂e/yr" change={null} cmpLabel="run-rate" status="info" />
      </div>
      <div className="grid g3 mt">
        <Panel title="Monthly emissions (2 years)" sub="tCO₂e; solar shown as avoided (negative)" className="span2"><Combo data={monthly} series={[{ key: 'grid', name: 'Grid', stack: 'e', color: C.blue }, { key: 'dg', name: 'DG diesel', stack: 'e', color: C.grey }, { key: 'gas', name: 'Boiler gas', stack: 'e', color: C.teal }, { key: 'avoided', name: 'Avoided by solar', color: C.amber }, { key: 'int', name: 'kg/t-eq', type: 'line', color: C.green, axis: 'right' }]} height={280} /></Panel>
        <Panel title="Emission factors" sub={edit ? 'Editable' : 'View only'}>
          <table className="tbl"><tbody>
            <tr><td>Grid electricity</td><td className="num"><input type="number" step="0.001" value={cfg.ef.grid} disabled={!edit} style={{ width: 90 }} onChange={(e) => setCfg({ ...cfg, ef: { ...cfg.ef, grid: +e.target.value } })} /> tCO₂/MWh</td></tr>
            <tr><td>Diesel (DG)</td><td className="num"><input type="number" step="0.01" value={cfg.ef.diesel} disabled={!edit} style={{ width: 90 }} onChange={(e) => setCfg({ ...cfg, ef: { ...cfg.ef, diesel: +e.target.value } })} /> kgCO₂/L</td></tr>
            <tr><td>Natural gas (boiler)</td><td className="num"><input type="number" step="0.01" value={cfg.ef.gas} disabled={!edit} style={{ width: 90 }} onChange={(e) => setCfg({ ...cfg, ef: { ...cfg.ef, gas: +e.target.value } })} /> kgCO₂/SCM</td></tr>
            <tr><td>Solar</td><td className="num"><input type="number" step="0.001" value={cfg.ef.solar} disabled={!edit} style={{ width: 90 }} onChange={(e) => setCfg({ ...cfg, ef: { ...cfg.ef, solar: +e.target.value } })} /> tCO₂/MWh</td></tr>
          </tbody></table>
          <div className="note mt">Defaults are illustrative (grid factor in the range published for the Indian grid). Replace with your reporting-year factors.</div>
        </Panel>
      </div>
      <div className="grid g3 mt">
        <Panel title="Emissions by department"><HBar data={depts} unit="tCO₂e" digits={1} labelWidth={150} /></Panel>
        <Panel title="Emissions by utility"><HBar data={utils} unit="tCO₂e" digits={1} labelWidth={150} /></Panel>
        <Panel title="Emissions by building / hub"><HBar data={blds} unit="tCO₂e" digits={1} labelWidth={170} /></Panel>
      </div>
      <div className="grid g2 mt">
        <Panel title="Emissions by line"><DataTable exportName="line-emissions" cols={[{ key: 'name', label: 'Line' }, { key: 't', label: 'tCO₂e', num: true, bar: true, render: (x: any) => n1(x.t) }, { key: 'perUnit', label: 'kgCO₂e per unit', num: true, render: (x: any) => `${n2(x.perUnit)} / ${x.unit}` }]} rows={lines} /></Panel>
        <Panel title="Carbon reduction opportunities" sub="From the improvement project tracker"><CarbonOps /></Panel>
      </div>
    </div>
  );
}
function CarbonOps() {
  const { projects } = useView();
  const rows = projects.filter((p) => p.co2 > 0).map((p) => ({ name: p.name, status: p.status, co2: p.co2, savings: p.savingsRs }));
  return <DataTable cols={[{ key: 'name', label: 'Project' }, { key: 'status', label: 'Status' }, { key: 'co2', label: 'tCO₂e/yr', num: true, bar: true, render: (x: any) => n0(x.co2) }, { key: 'savings', label: '₹/yr', num: true }]} rows={rows} initialSort={{ key: 'co2', dir: -1 }} />;
}

// ---------------- targets & baselines ----------------
export function Targets() {
  const { r, cfg, setCfg, P, persona } = useView();
  const edit = persona?.canEdit;
  const reg = useMemo(() => plantRegression(cfg), [cfg]);
  const exp = expectedPlantKwh(r, cfg);
  const b = baselineRange(cfg);
  const monthly = useMemo(() => buckets({ i0: 0, i1: DAYS - 1 }, 'month').map((bk) => { const e = expectedPlantKwh(bk, cfg); const a = sum(CONS, bk.i0, bk.i1); return { label: bk.label, actual: a / 1000, expected: e / 1000, budget: budgetFor(bk, cfg) / 1000, saving: (e - a) / 1000 }; }), [cfg]);
  let cus = 0;
  const cusum = monthly.map((m) => ({ label: m.label, cusum: (cus += m.saving) }));
  const lines = LINES.map((L) => { const m = lineMetrics(L.idx, r); const base = lineBaselineSec(L.idx, cfg), tgt = lineTargetSec(L.idx, cfg); return { id: L.id, name: L.short, unit: L.secUnit, base, tgt, sec: m.sec, enpi: m.sec / base, ach: (tgt / m.sec) * 100, override: cfg.targets.lineSec[L.id] }; });
  const utils = UTILITIES.map((u) => { const s = utilSec(u.key, r), bs = utilSecBaseline(u.key, cfg); return { name: u.name, unit: u.secUnit, base: bs, tgt: bs * (1 - cfg.targets.utilSecPct / 100), sec: s, enpi: s / bs, scale: u.key === 'AIR' || u.key === 'HVAC' ? 1000 : 1 }; });
  const setTg = (k: keyof typeof cfg.targets, v: number) => setCfg({ ...cfg, targets: { ...cfg.targets, [k]: v } });
  return (
    <div>
      <PageHeader title="Energy Targets & Baselines" sub="Historical, production-normalised and regression baselines · Energy Performance Index (EnPI) · target achievement" />
      <div className="grid g6">
        <Kpi label="Plant EnPI" value={n2(P.cons / exp)} change={pct(P.cons, exp)} cmpLabel="actual / expected" />
        <Kpi label="Expected (baseline) energy" value={kwh(exp)[0]} unit={kwh(exp)[1]} change={null} cmpLabel="for actual production" status="info" />
        <Kpi label="Savings vs baseline" value={kwh(exp - P.cons)[0]} unit={kwh(exp - P.cons)[1]} change={null} cmpLabel={rsS((exp - P.cons) * P.cost.perKwh)} status={exp > P.cons ? 'good' : 'bad'} />
        <Kpi label="Budget achievement" value={n1((budgetFor(r, cfg) / P.cons) * 100)} unit="%" change={null} cmpLabel="budget / actual" status={budgetFor(r, cfg) >= P.cons ? 'good' : 'warn'} />
        <Kpi label="Lines meeting SEC target" value={`${lines.filter((l) => l.sec <= l.tgt).length} / ${lines.length}`} change={null} cmpLabel="selected period" status="info" />
        <Kpi label="Baseline model fit" value={`R² ${n2(reg.r2)}`} change={null} cmpLabel={`kWh = ${n0(reg.a)} + ${n1(reg.b)} × t-eq`} status={reg.r2 > 0.75 ? 'good' : 'warn'} />
      </div>
      <div className="grid g2 mt">
        <Panel title="Actual vs production-normalised baseline vs budget" sub="Monthly MWh"><Combo data={monthly} series={[{ key: 'actual', name: 'Actual', color: C.blue }, { key: 'expected', name: 'Baseline expected', type: 'line', color: C.amber, dashed: true }, { key: 'budget', name: 'Budget', type: 'line', color: C.green, dashed: true }]} height={260} digits={0} /></Panel>
        <Panel title="CUSUM of savings vs baseline" sub="Cumulative (expected − actual), MWh. Upward = saving"><Combo data={cusum} series={[{ key: 'cusum', name: 'CUSUM MWh', type: 'area', color: C.cyan }]} height={260} digits={0} /></Panel>
      </div>
      <div className="grid g3 mt">
        <Panel title="Baseline & plant targets" sub={edit ? 'Editable' : 'View only for your persona'}>
          <div className="form-g">
            <label>Baseline from<input type="date" value={cfg.baseline.from} min={DATES[0]} max={DATES[DAYS - 1]} disabled={!edit} onChange={(e) => setCfg({ ...cfg, baseline: { ...cfg.baseline, from: e.target.value } })} /></label>
            <label>Baseline to<input type="date" value={cfg.baseline.to} min={DATES[0]} max={DATES[DAYS - 1]} disabled={!edit} onChange={(e) => setCfg({ ...cfg, baseline: { ...cfg.baseline, to: e.target.value } })} /></label>
            <label>Line SEC target (% below baseline)<input type="number" value={cfg.targets.lineSecPct} disabled={!edit} onChange={(e) => setTg('lineSecPct', +e.target.value)} /></label>
            <label>Utility SEC target (% below baseline)<input type="number" value={cfg.targets.utilSecPct} disabled={!edit} onChange={(e) => setTg('utilSecPct', +e.target.value)} /></label>
            <label>Monthly energy budget (kWh)<input type="number" value={cfg.targets.plantMonthlyKwh} disabled={!edit} onChange={(e) => setTg('plantMonthlyKwh', +e.target.value)} /></label>
            <label>Annual energy budget (₹)<input type="number" value={cfg.targets.annualBudgetRs} disabled={!edit} onChange={(e) => setTg('annualBudgetRs', +e.target.value)} /></label>
            <label>Carbon reduction target (% YoY)<input type="number" value={cfg.targets.carbonReductionPct} disabled={!edit} onChange={(e) => setTg('carbonReductionPct', +e.target.value)} /></label>
            <label>Energy savings target (₹/yr)<input type="number" value={cfg.targets.savingsTargetRs} disabled={!edit} onChange={(e) => setTg('savingsTargetRs', +e.target.value)} /></label>
            <label>Contract demand (kVA)<input type="number" value={cfg.targets.contractDemandKva} disabled={!edit} onChange={(e) => setTg('contractDemandKva', +e.target.value)} /></label>
            <label>Max non-production energy share (%)<input type="number" value={cfg.targets.idleShareMax} disabled={!edit} onChange={(e) => setTg('idleShareMax', +e.target.value)} /></label>
          </div>
          <div className="muted mt" style={{ fontSize: 11 }}>Baseline window: {b.i1 - b.i0 + 1} days. Target types supported: fixed kWh (budget), kWh per production unit (line SEC), kWh per tonne, kWh per operating hour, kWh per batch and production-normalised baseline.</div>
        </Panel>
        <Panel title="Line energy-intensity targets" className="span2" sub="Override a line's target SEC directly; blank = baseline × (1 − %)">
          <DataTable cols={[
            { key: 'name', label: 'Line' }, { key: 'unit', label: 'Unit' }, { key: 'base', label: 'Baseline SEC', num: true, render: (x: any) => n2(x.base) },
            { key: 'tgt', label: 'Target SEC', num: true, render: (x: any) => <input type="number" step="0.01" defaultValue={x.override ?? ''} placeholder={n2(x.tgt)} disabled={!edit} style={{ width: 90 }} onBlur={(e) => { const v = e.target.value; const ls = { ...cfg.targets.lineSec }; if (v) ls[x.id] = +v; else delete ls[x.id]; setCfg({ ...cfg, targets: { ...cfg.targets, lineSec: ls } }); }} /> },
            { key: 'sec', label: 'Actual SEC', num: true, render: (x: any) => n2(x.sec) }, { key: 'enpi', label: 'EnPI', num: true, render: (x: any) => <span className={x.enpi > 1 ? 'up-bad' : 'up-good'}>{n2(x.enpi)}</span> }, { key: 'ach', label: 'Achievement %', num: true, render: (x: any) => n0(x.ach) },
          ]} rows={lines} />
        </Panel>
      </div>
      <Panel title="Utility targets" className="mt"><DataTable cols={[{ key: 'name', label: 'Utility' }, { key: 'unit', label: 'Unit' }, { key: 'base', label: 'Baseline', num: true, render: (x: any) => n2(x.base * x.scale) }, { key: 'tgt', label: 'Target', num: true, render: (x: any) => n2(x.tgt * x.scale) }, { key: 'sec', label: 'Actual', num: true, render: (x: any) => n2(x.sec * x.scale) }, { key: 'enpi', label: 'EnPI', num: true, render: (x: any) => <span className={x.enpi > 1 ? 'up-bad' : 'up-good'}>{n2(x.enpi)}</span> }]} rows={utils} /></Panel>
    </div>
  );
}

// ---------------- projects ----------------
const EMPTY: Project = { id: '', name: '', department: 'Utilities', asset: '', problem: '', solution: '', baselineKwh: 0, targetKwh: 0, savingsKwh: 0, savingsRs: 0, co2: 0, capex: 0, payback: 0, roi: 0, owner: '', status: 'Idea', date: DATES[DAYS - 1], actualKwh: 0, verification: '—' };
export function Projects() {
  const { projects, setProjects, persona, cfg, P } = useView();
  const [ed, setEd] = useState<Project | null>(null);
  const tot = projects.reduce((s, p) => s + p.savingsRs, 0), capex = projects.reduce((s, p) => s + p.capex, 0);
  const verified = projects.filter((p) => p.status === 'Verified').reduce((s, p) => s + p.actualKwh * P.cost.perKwh, 0);
  const statuses = ['Idea', 'Approved', 'In Progress', 'Implemented', 'Verified'] as const;
  const save = (p: Project) => {
    const savingsKwh = p.baselineKwh - p.targetKwh;
    const savingsRs = savingsKwh * P.cost.perKwh;
    const full = { ...p, savingsKwh, savingsRs, co2: (savingsKwh / 1000) * cfg.ef.grid, payback: savingsRs ? p.capex / savingsRs : 0, roi: p.capex ? (savingsRs / p.capex) * 100 : 0, id: p.id || `EIP-${String(projects.length + 1).padStart(3, '0')}` };
    setProjects(projects.some((x) => x.id === full.id) ? projects.map((x) => (x.id === full.id ? full : x)) : [...projects, full]);
    setEd(null);
  };
  return (
    <div>
      <PageHeader title="Energy Improvement Projects" sub="Opportunity tracker from idea to verified savings (M&V)" actions={<button className="btn primary" disabled={!persona?.canEdit} onClick={() => setEd({ ...EMPTY })}>+ New project</button>} />
      <div className="grid g5">
        <Kpi label="Projects" value={String(projects.length)} change={null} cmpLabel={`${projects.filter((p) => p.status === 'Verified' || p.status === 'Implemented').length} implemented`} status="info" />
        <Kpi label="Expected savings" value={rs(tot)[0]} unit={rs(tot)[1] + '/yr'} change={null} cmpLabel={`target ${rsS(cfg.targets.savingsTargetRs)}`} status={tot >= cfg.targets.savingsTargetRs ? 'good' : 'warn'} />
        <Kpi label="Total CAPEX" value={rs(capex)[0]} unit={rs(capex)[1]} change={null} cmpLabel={`portfolio payback ${n1(capex / tot)} yrs`} status="info" />
        <Kpi label="Expected CO₂ reduction" value={n0(projects.reduce((s, p) => s + p.co2, 0))} unit="tCO₂e/yr" change={null} cmpLabel="electricity projects" status="good" />
        <Kpi label="Verified savings to date" value={rs(verified)[0]} unit={rs(verified)[1]} change={null} cmpLabel="IPMVP verified" status="good" />
      </div>
      <div className="grid g5 mt">
        {statuses.map((s) => (
          <Panel key={s} title={s} sub={`${projects.filter((p) => p.status === s).length} projects`}>
            {projects.filter((p) => p.status === s).map((p) => <div key={p.id} className="kpi click" style={{ marginBottom: 6, padding: 8 }} onClick={() => setEd(p)}><div style={{ fontWeight: 600, fontSize: 12.5 }}>{p.name}</div><div className="muted" style={{ fontSize: 11 }}>{rsS(p.savingsRs)}/yr · payback {n1(p.payback)} y</div></div>)}
          </Panel>
        ))}
      </div>
      <Panel title="Project register" className="mt">
        <DataTable exportName="improvement-projects" onRow={(p: any) => setEd(p)} cols={[
          { key: 'id', label: 'ID' }, { key: 'name', label: 'Project' }, { key: 'department', label: 'Dept' }, { key: 'asset', label: 'Asset' }, { key: 'savingsKwh', label: 'Savings kWh/yr', num: true }, { key: 'savingsRs', label: 'Savings ₹/yr', num: true, bar: true },
          { key: 'co2', label: 'tCO₂e/yr', num: true }, { key: 'capex', label: 'CAPEX ₹', num: true }, { key: 'payback', label: 'Payback (yrs)', num: true, render: (p: any) => n1(p.payback) }, { key: 'roi', label: 'ROI %', num: true }, { key: 'owner', label: 'Owner' },
          { key: 'status', label: 'Status', render: (p: any) => <Badge kind={p.status === 'Verified' ? 'good' : p.status === 'Idea' ? 'grey' : 'low'}>{p.status}</Badge> }, { key: 'date', label: 'Impl. date' }, { key: 'actualKwh', label: 'Actual kWh', num: true }, { key: 'verification', label: 'Verification' },
        ]} rows={projects} />
      </Panel>
      {ed && (
        <Modal title={ed.id ? `Edit ${ed.id}` : 'New improvement project'} onClose={() => setEd(null)}>
          <ProjectForm p={ed} onSave={save} canEdit={!!persona?.canEdit} />
        </Modal>
      )}
    </div>
  );
}
function ProjectForm({ p, onSave, canEdit }: { p: Project; onSave: (p: Project) => void; canEdit: boolean }) {
  const [f, setF] = useState(p);
  const s = (k: keyof Project) => (e: any) => setF({ ...f, [k]: e.target.type === 'number' ? +e.target.value : e.target.value });
  return (
    <div>
      <div className="form-g">
        <label>Project name<input value={f.name} onChange={s('name')} /></label>
        <label>Department<select value={f.department} onChange={s('department')}>{['Production', 'Utilities', 'Electrical', 'Logistics', 'Administration'].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Asset<input value={f.asset} onChange={s('asset')} /></label>
        <label>Owner<input value={f.owner} onChange={s('owner')} /></label>
        <label>Energy problem<textarea rows={2} value={f.problem} onChange={s('problem')} /></label>
        <label>Proposed solution<textarea rows={2} value={f.solution} onChange={s('solution')} /></label>
        <label>Baseline energy (kWh/yr)<input type="number" value={f.baselineKwh} onChange={s('baselineKwh')} /></label>
        <label>Target energy (kWh/yr)<input type="number" value={f.targetKwh} onChange={s('targetKwh')} /></label>
        <label>CAPEX (₹)<input type="number" value={f.capex} onChange={s('capex')} /></label>
        <label>Status<select value={f.status} onChange={s('status')}>{['Idea', 'Approved', 'In Progress', 'Implemented', 'Verified'].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Implementation date<input type="date" value={f.date} onChange={s('date')} /></label>
        <label>Actual savings (kWh)<input type="number" value={f.actualKwh} onChange={s('actualKwh')} /></label>
        <label>Verification status<input value={f.verification} onChange={s('verification')} /></label>
      </div>
      <div className="note mt">Expected savings, CO₂, payback and ROI are calculated on save from baseline − target energy, the current blended ₹/kWh and the grid emission factor.</div>
      <div className="row mt" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={!canEdit || !f.name} onClick={() => onSave(f)}>Save project</button></div>
    </div>
  );
}

// ---------------- reports ----------------
export function Reports() {
  const { r, cfg, P, alerts, projects } = useView();
  const [sel, setSel] = useState('daily');
  const rate = P.cost.perKwh;
  const reports: { key: string; name: string; desc: string; rows: () => Record<string, unknown>[] }[] = [
    { key: 'daily', name: 'Daily energy report', desc: 'Plant energy, sources, peak, PF, cost and production per day', rows: () => { const o = []; for (let d = r.i0; d <= r.i1; d++) o.push({ Date: DATES[d], 'Incoming kWh': Math.round(INCOMING[d]), 'Accounted kWh': Math.round(CONS[d]), 'Grid kWh': Math.round(GRID[d]), 'Solar kWh': Math.round(SOLAR_KWH[d]), 'Export kWh': Math.round(EXPORT[d]), 'Peak kVA': Math.round(PEAK_KVA[d]), PF: PF[d].toFixed(3), 'Production t-eq': Math.round(PROD_TEQ[d]), 'kWh/t-eq': (CONS[d] / Math.max(1, PROD_TEQ[d])).toFixed(1), 'DG fuel L': Math.round(DG_FUEL[d]) }); return o; } },
    { key: 'monthly', name: 'Monthly management report', desc: 'Energy, cost, carbon, intensity and EnPI by month', rows: () => buckets(r, 'month').map((b) => { const c = costPeriod(b, cfg), co = co2Period(b, cfg), e = sum(CONS, b.i0, b.i1), x = expectedPlantKwh(b, cfg); return { Month: b.label, 'Energy kWh': Math.round(e), 'Cost ₹': Math.round(c.total), '₹/kWh': c.perKwh.toFixed(2), 'tCO2e': co.total.toFixed(1), 'kWh/t-eq': (e / sum(PROD_TEQ, b.i0, b.i1)).toFixed(1), EnPI: (e / x).toFixed(3), 'MD kVA': Math.round(c.mdKva) }; }) },
    { key: 'lines', name: 'Production line SEC report', desc: 'Energy, production, SEC vs baseline and target per line', rows: () => LINES.map((L) => { const m = lineMetrics(L.idx, r); return { Line: L.short, Category: L.category, 'Energy kWh': Math.round(m.kwh), 'Good production': Math.round(m.good), Unit: L.unit, SEC: m.sec.toFixed(2), 'Baseline SEC': lineBaselineSec(L.idx, cfg).toFixed(2), 'Target SEC': lineTargetSec(L.idx, cfg).toFixed(2), 'Idle kWh': Math.round(m.idleKwh), 'Non-production %': ((m.nonProdKwh / m.kwh) * 100).toFixed(1), 'Cost ₹': Math.round(m.kwh * rate) }; }) },
    { key: 'utilities', name: 'Utility performance report', desc: 'Utility kWh, output, specific energy vs baseline', rows: () => UTILITIES.map((u) => ({ Utility: u.name, 'Energy kWh': Math.round(sum(UTIL_KWH[u.key], r.i0, r.i1)), Output: Math.round(sum(UTIL[u.key].sysOut, r.i0, r.i1)), 'Output unit': u.outputUnit, 'Specific energy': utilSec(u.key, r).toFixed(4), Baseline: utilSecBaseline(u.key, cfg).toFixed(4), Unit: u.secUnit })) },
    { key: 'departments', name: 'Department energy & cost report', desc: 'Energy, share and cost per department', rows: () => DEPARTMENTS.map((d) => ({ Department: d.name, 'Energy kWh': Math.round(deptKwh(d.id, r)), 'Share %': ((deptKwh(d.id, r) / P.cons) * 100).toFixed(1), 'Cost ₹': Math.round(deptKwh(d.id, r) * rate) })) },
    { key: 'meters', name: 'Meter master export', desc: 'All meters with hierarchy and data quality', rows: () => METERS.map((m) => ({ 'Meter ID': m.id, Name: m.name, Type: m.type, Level: m.level, Parent: m.parent ?? '', Department: m.department, Make: m.make, Model: m.model, Protocol: m.protocol, Address: m.address, Frequency: m.frequency, 'Data quality': m.dq, 'Last comm.': m.lastComm, Calibration: m.calibration })) },
    { key: 'alerts', name: 'Alerts report', desc: 'Alerts raised in the period with status', rows: () => alerts.filter((a) => a.d >= r.i0 && a.d <= r.i1).map((a) => ({ ID: a.id, Time: a.time, Severity: a.severity, Type: a.type, Asset: a.asset, Message: a.message, Status: a.status, Assignee: a.assignee ?? '' })) },
    { key: 'projects', name: 'Improvement project report', desc: 'Savings, CAPEX, payback and status', rows: () => projects.map((p) => ({ ID: p.id, Project: p.name, Status: p.status, 'Savings kWh/yr': p.savingsKwh, 'Savings ₹/yr': Math.round(p.savingsRs), 'CAPEX ₹': p.capex, 'Payback yrs': p.payback.toFixed(1), Owner: p.owner })) },
  ];
  const rep = reports.find((x) => x.key === sel)!;
  const rows = useMemo(() => rep.rows(), [sel, r, cfg, alerts, projects]);
  const cols = rows.length ? Object.keys(rows[0]) : [];
  return (
    <div>
      <PageHeader title="Energy Reports" sub={`Generate and export reports for ${DATES[r.i0]} → ${DATES[r.i1]} (uses the global date filter)`} actions={<><button className="btn" onClick={() => downloadCsv(`${rep.key}-${DATES[r.i0]}_${DATES[r.i1]}`, rows)}>⤓ Export CSV / Excel</button><button className="btn" onClick={() => window.print()}>⎙ Print / PDF</button></>} />
      <div className="grid g4">
        {reports.map((x) => (
          <div key={x.key} className={'kpi click'} style={{ borderColor: sel === x.key ? 'var(--cyan)' : undefined }} onClick={() => setSel(x.key)}>
            <div style={{ fontWeight: 600 }}>{x.name}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>{x.desc}</div>
          </div>
        ))}
      </div>
      <Panel title={rep.name} sub={`${rows.length} rows · simulated data`} className="mt">
        <DataTable cols={cols.map((c) => ({ key: c, label: c, num: typeof rows[0][c] === 'number' }))} rows={rows as any} pageSize={20} />
      </Panel>
    </div>
  );
}
export type { Range };
