import { go } from '../store';
import { useMemo, useState } from 'react';
import { BUILDINGS, LINES, UTILITIES, TRANSFORMERS, DGS, SOLAR, PLANT } from '../data/assets';
import { pct, safeDiv, sum } from '../data/engine';
import { CONS, DATES, DAYS, EXPORT, GRID, INCOMING, LOSSPCT, SOLAR_KWH, DG_KWH, PROD_KWH, UTIL_TOTAL, BLD, BLD_TOTAL, HUB2_METER_OFFLINE } from '../data/sim';
import { completeness, ELECTRIC_METERS, meterById, METERS, reconcile, registerRows, periodConsumptionRows } from '../data/meters';
import { C, kwh, kwhS, n0, n1, n2 } from '../format';
import { Badge, Combo, DataTable, Kpi, PageHeader, Panel, Tabs, Donut } from '../components/ui';
import { bucketSeries, useView } from './common';
import { PERSONAS, canSee, useStore } from '../store';
import { NAV } from '../components/Shell';

const dqKind = (q: string) => (q === 'Good' ? 'good' : q === 'Offline' ? 'crit' : q === 'Stale' || q === 'Intermittent' ? 'med' : 'high');

// ---------------- meters ----------------
export function Meters({ id }: { id?: string }) {
  const { r } = useView();
  const [type, setType] = useState('ALL');
  const [lvl, setLvl] = useState('ALL');
  const m = id ? meterById(id) : undefined;
  const rows = METERS.filter((x) => (type === 'ALL' || x.type === type) && (lvl === 'ALL' || x.level === lvl)).map((x) => ({ ...x, period: (() => { let s = 0; for (let d = r.i0; d <= r.i1; d++) s += x.daily(d); return s; })(), comp: (() => { let s = 0; for (let d = r.i0; d <= r.i1; d++) s += completeness(x, d); return s / (r.i1 - r.i0 + 1); })() }));
  const types = Array.from(new Set(METERS.map((x) => x.type)));
  const levels = Array.from(new Set(METERS.map((x) => x.level)));
  if (m) {
    const regs = registerRows(m, Math.max(r.i0, r.i1 - 44), r.i1);
    const kids = METERS.filter((x) => x.parent === m.id);
    const trend = bucketSeries(r, 'day', { v: m.daily, c: (d) => completeness(m, d) }, { v: 'sum', c: 'avg' });
    return (
      <div>
        <PageHeader title={`${m.id} · ${m.name}`} sub={`${m.type} · ${m.level} · ${m.make} ${m.model}`} crumbs={[{ label: 'Configuration' }, { label: 'Energy Meters', href: '#/meters' }, { label: m.id }]} />
        <div className="grid g3">
          <Panel title="Meter master record">
            <table className="tbl"><tbody>
              {([['Meter ID', m.id], ['Meter name', m.name], ['Meter type', m.type], ['Meter make', m.make], ['Meter model', m.model], ['Serial number', m.serial], ['Communication protocol', m.protocol], ['IP / Modbus address', m.address], ['Parent meter', m.parent ?? '— (root)'], ['Child meters', kids.map((k) => k.id).join(', ') || '—'], ['Department', m.department], ['Location', m.location], ['Connected asset', m.asset], ['Measurement unit', m.unit], ['Collection frequency', m.frequency], ['Data quality status', m.dq], ['Last communication', m.lastComm], ['Calibration date', m.calibration]] as [string, string][]).map(([k, v]) => <tr key={k}><td className="muted">{k}</td><td>{k === 'Data quality status' ? <Badge kind={dqKind(v)}>{v}</Badge> : k === 'Parent meter' && m.parent ? <a href={`#/meters/${m.parent}`}>{v}</a> : v}</td></tr>)}
            </tbody></table>
          </Panel>
          <Panel title="Daily consumption & data completeness" className="span2">
            <Combo data={trend} series={[{ key: 'v', name: `${m.unit}/day`, color: C.blue }, { key: 'c', name: 'Completeness %', type: 'line', color: C.amber, axis: 'right' }]} height={260} />
            {m.type.includes('Electrical') && <div className="note mt">Parameters available (three-phase): V R/Y/B, V RY/YB/BR, I R/Y/B, kW, kVAR, kVA, PF, Hz, kWh, kVARh, MD, demand interval (15 min), import / export kWh. Values shown here are simulated.</div>}
          </Panel>
        </div>
        <Panel title="Register readings → period consumption" sub="Consumption is always the difference between cumulative readings. Missing data, resets, rollovers and negative steps are detected and flagged." className="mt">
          <DataTable exportName={`${m.id}-register`} cols={[{ key: 'date', label: 'Date (00:00 reading)' }, { key: 'reading', label: `Register ${m.unit}`, num: true, render: (x: any) => (x.reading == null ? <Badge kind="grey">missing</Badge> : n1(x.reading)) }, { key: 'consumption', label: `Δ ${m.unit}`, num: true, render: (x: any) => n1(x.consumption) }, { key: 'status', label: 'Status', render: (x: any) => <Badge kind={x.status === 'OK' ? 'good' : x.status === 'Estimated' || x.status === 'Missing' ? 'est' : 'high'}>{x.status}</Badge> }, { key: 'method', label: 'Calculation' }]} rows={regs.reverse()} pageSize={15} />
        </Panel>
      </div>
    );
  }
  const dqCount = (q: string) => METERS.filter((x) => x.dq === q).length;
  return (
    <div>
      <PageHeader title="Energy Meter Management" sub={`${METERS.length} meters · ${ELECTRIC_METERS.length} electrical · hierarchy Grid → Transformer → Main panel → Department → Line/Utility → Machine`} />
      <div className="grid g6">
        <Kpi label="Total meters" value={String(METERS.length)} change={null} cmpLabel={`${ELECTRIC_METERS.length} electrical`} status="info" />
        <Kpi label="Communicating (good)" value={String(dqCount('Good'))} change={null} cmpLabel={`${n1((dqCount('Good') / METERS.length) * 100)}%`} status="good" />
        <Kpi label="Offline" value={String(dqCount('Offline'))} change={null} cmpLabel="no data" status={dqCount('Offline') ? 'bad' : 'good'} />
        <Kpi label="Intermittent / stale" value={String(dqCount('Intermittent') + dqCount('Stale'))} change={null} cmpLabel="partial data" status="warn" />
        <Kpi label="Reset / duplicate" value={String(dqCount('Reset detected') + dqCount('Duplicate readings'))} change={null} cmpLabel="handled in calculation" status="warn" />
        <Kpi label="Process meters" value={String(METERS.length - ELECTRIC_METERS.length)} change={null} cmpLabel="air, steam, gas, water, BTU, fuel" status="info" />
      </div>
      <Panel title="Meter master" className="mt" actions={<><select value={type} onChange={(e) => setType(e.target.value)}><option value="ALL">All types</option>{types.map((t) => <option key={t}>{t}</option>)}</select><select value={lvl} onChange={(e) => setLvl(e.target.value)}><option value="ALL">All levels</option>{levels.map((t) => <option key={t}>{t}</option>)}</select></>}>
        <DataTable exportName="meter-master" pageSize={20} onRow={(x: any) => go(`#/meters/${x.id}`)} cols={[
          { key: 'id', label: 'Meter ID' }, { key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }, { key: 'level', label: 'Level' }, { key: 'parent', label: 'Parent' }, { key: 'department', label: 'Department' },
          { key: 'make', label: 'Make' }, { key: 'model', label: 'Model' }, { key: 'protocol', label: 'Protocol' }, { key: 'address', label: 'Address' }, { key: 'frequency', label: 'Freq.' }, { key: 'unit', label: 'Unit' },
          { key: 'period', label: 'Period total', num: true }, { key: 'comp', label: 'Completeness %', num: true, render: (x: any) => n1(x.comp) }, { key: 'dq', label: 'Data quality', render: (x: any) => <Badge kind={dqKind(x.dq)}>{x.dq}</Badge> }, { key: 'lastComm', label: 'Last comm.' }, { key: 'calibration', label: 'Calibrated' },
        ]} rows={rows} />
      </Panel>
    </div>
  );
}

// ---------------- asset master ----------------
export function AssetMaster() {
  const { persona, toggleAsset, assetVersion } = useStore();
  const [tab, setTab] = useState<'lines' | 'util' | 'bld' | 'elec' | 'model'>('lines');
  const [line, setLine] = useState('L01');
  const L = LINES.find((x) => x.id === line)!;
  const can = !!persona?.canEdit;
  void assetVersion;
  const total = LINES.reduce((s, l) => s + l.machines.length, 0) + UTILITIES.reduce((s, u) => s + u.assets.length, 0);
  return (
    <div>
      <PageHeader title="Asset Master" sub={`${PLANT.org} → ${PLANT.name} · ${total} machines / equipment assets · composition configurable by the plant administrator`} />
      <Tabs tabs={[{ key: 'lines', label: 'Production lines & machines' }, { key: 'util', label: 'Utilities' }, { key: 'bld', label: 'Buildings & hubs' }, { key: 'elec', label: 'Electrical assets' }, { key: 'model', label: 'Data model' }]} value={tab} onChange={setTab} />
      {tab === 'lines' && (
        <div className="grid g3">
          <Panel title="Production lines">
            <DataTable onRow={(x: any) => setLine(x.id)} cols={[{ key: 'id', label: 'ID' }, { key: 'short', label: 'Line', render: (x: any) => <b style={{ color: x.id === line ? C.cyan : undefined }}>{x.short}</b> }, { key: 'category', label: 'Category' }, { key: 'n', label: 'Machines', num: true }]} rows={LINES.map((x) => ({ ...x, n: x.machines.filter((m) => m.active).length }))} />
          </Panel>
          <Panel title={`${L.name} – machine composition`} className="span2" sub={can ? 'Untick a machine that does not exist on this line. Line energy (line meter) is unchanged; machine allocation updates.' : 'View only for your persona'}>
            <DataTable cols={[
              { key: 'active', label: 'Installed', render: (m: any) => <input type="checkbox" checked={m.active} disabled={!can} onChange={(e) => toggleAsset(m.id, e.target.checked)} /> },
              { key: 'id', label: 'Asset ID' }, { key: 'name', label: 'Machine' }, { key: 'ratedKw', label: 'Rated kW', num: true }, { key: 'meter', label: 'Meter', render: (m: any) => (m.ratedKw >= 15 ? <a href={`#/meters/EM-${m.id}`}>EM-{m.id}</a> : <span className="muted">allocated</span>) },
              { key: 'wRun', label: 'Running share %', num: true, render: (m: any) => n1(m.wRun * 100) }, { key: 'area', label: 'Area', render: () => L.category + ' hall' }, { key: 'open', label: '', render: (m: any) => <a href={`#/machine/${m.id}`}>dashboard →</a> },
            ]} rows={L.machines.map((m) => ({ ...m }))} exportName={`${L.id}-machines`} />
            <div className="muted mt" style={{ fontSize: 11.5 }}>SKUs: {L.skus.map((s) => `${s.code} (${s.name})`).join(' · ')} · Unit: {L.unit} · t-eq factor {L.teq} · SEC unit {L.secUnit}</div>
          </Panel>
        </div>
      )}
      {tab === 'util' && (
        <div className="grid g2">
          {UTILITIES.map((u) => (
            <Panel key={u.key} title={u.name} sub={`${u.assets.length} assets · ${u.panel} · output ${u.outputUnit}`}>
              <DataTable cols={[{ key: 'active', label: 'Installed', render: (a: any) => <input type="checkbox" checked={a.active} disabled={!can} onChange={(e) => toggleAsset(a.id, e.target.checked)} /> }, { key: 'id', label: 'ID' }, { key: 'name', label: 'Asset' }, { key: 'ratedKw', label: 'Rated kW', num: true }]} rows={u.assets.map((a) => ({ ...a }))} />
            </Panel>
          ))}
        </div>
      )}
      {tab === 'bld' && (
        <div className="grid g3">
          {BUILDINGS.map((b) => (
            <Panel key={b.id} title={b.name} sub={`${b.kind} · ${n0(b.areaM2)} m² · ${b.panel}`}>
              <DataTable cols={[{ key: 'name', label: 'Asset' }, { key: 'group', label: 'Group' }, { key: 'share', label: 'Share %', num: true, render: (a: any) => n0(a.share * 100) }]} rows={b.assets} />
            </Panel>
          ))}
        </div>
      )}
      {tab === 'elec' && (
        <div className="grid g2">
          <Panel title="Incoming & transformers"><DataTable cols={[{ key: 'id', label: 'ID' }, { key: 'name', label: 'Asset' }, { key: 'rating', label: 'Rating' }, { key: 'feeds', label: 'Feeds' }]} rows={[{ id: 'GRID-01', name: PLANT.gridFeeder, rating: `${PLANT.contractDemandKva} kVA contract`, feeds: 'Main incomer → PCC' }, ...TRANSFORMERS.map((t) => ({ id: t.id, name: t.name, rating: `${t.ratedKva} kVA, ${t.primaryKv} kV / ${t.secondaryV} V`, feeds: t.feeds }))]} /></Panel>
          <Panel title="Generation"><DataTable cols={[{ key: 'id', label: 'ID' }, { key: 'name', label: 'Asset' }, { key: 'rating', label: 'Rating' }]} rows={[...DGS.map((g) => ({ id: g.id, name: g.name, rating: `${g.ratedKva} kVA diesel` })), { id: 'SOLAR', name: 'Rooftop solar plant', rating: `${SOLAR.capacityKwp} kWp` }, ...SOLAR.inverters.map((v) => ({ id: v.id, name: 'Solar inverter', rating: `${v.kw} kW` }))]} /></Panel>
          <Panel title="Distribution panels" className="span2"><DataTable cols={[{ key: 'id', label: 'Panel meter' }, { key: 'name', label: 'Panel' }, { key: 'parent', label: 'Fed from' }, { key: 'department', label: 'Department' }]} rows={METERS.filter((m) => m.level === 'Department' || m.level === 'Main Panel')} /></Panel>
        </div>
      )}
      {tab === 'model' && <DataModel />}
    </div>
  );
}

function DataModel() {
  const ents: [string, string, string][] = [
    ['Organization', 'id, name', '1 → n Plant'], ['Plant', 'id, name, location, contract_demand', '1 → n Department, Transformer, Meter'], ['Department', 'id, plant_id, name, kind', '1 → n Area, Line, Utility, Building'], ['Area', 'id, department_id, name', '1 → n Line / Machine'],
    ['Production Line', 'id, area_id, category, unit, sec_unit, teq_factor', '1 → n Machine, SKU, Production Record'], ['Machine', 'id, line_id, name, rated_kw, active', '1 → 0..1 Meter; 1 → n Machine State'], ['Utility', 'id, department_id, key, output_unit', '1 → n Utility Asset'],
    ['Building / Warehouse / Distribution Hub', 'id, kind, area_m2, activity_metric', '1 → n Asset, Meter'], ['Electrical Asset / Transformer / Panel', 'id, type, rating, parent_id', 'tree (self-reference)'], ['Energy Meter', 'id, type, level, parent_meter_id, asset_id, protocol, address, frequency', 'self-reference parent/child; 1 → n Meter Reading'],
    ['Meter Reading (time-series)', 'meter_id, ts, register_value, quality_flag', 'hypertable, 1-min default, partitioned by day'], ['Production Record (time-series)', 'line_id, sku, batch, order, ts_start, ts_end, qty_good, qty_reject, shift', 'joins to Energy Consumption by line + interval'],
    ['Machine State (time-series)', 'machine_id, state, ts_start, ts_end', 'time-aligned with readings'], ['Energy Consumption (derived)', 'meter_id, interval, kwh (Δ register), method_flag', 'continuous aggregates: hour/day/week/month/quarter/year'],
    ['Energy Target', 'scope_type, scope_id, metric, value, period', 'n → 1 asset'], ['Baseline', 'scope, from, to, model (historical / regression), coefficients', ''], ['Energy Insight', 'id, rule, metric, actual, reference, deviation, severity, status, assignee', 'n → 1 asset'],
    ['Energy Alert', 'id, rule, asset_id, ts, severity, status, root_cause, action, comments', 'n → 1 asset'], ['Energy Improvement Project', 'id, asset_id, baseline_kwh, target_kwh, capex, status, mv_status', 'n → 1 asset'], ['Tariff', 'zones, demand_charge, duty, pf_rules, fuel_prices, valid_from', ''],
    ['Emission Factor', 'source, factor, unit, valid_from', ''], ['User / Role', 'user_id, role_id, permissions', 'RBAC'], ['Report', 'id, template, schedule, recipients', ''],
  ];
  return (
    <Panel title="Data model & architecture" sub="Relational master data + time-series storage for readings and production">
      <DataTable cols={[{ key: 'e', label: 'Entity' }, { key: 'f', label: 'Key fields' }, { key: 'r', label: 'Relationships' }]} rows={ents.map(([e, f, r]) => ({ e, f, r }))} />
      <div className="note mt">Reference architecture: React/TypeScript front end → REST API (ingestion + application services) → PostgreSQL for master data/configuration + TimescaleDB (or equivalent) hypertables for 1-second to 15-minute readings with continuous aggregates. Edge gateways collect Modbus RTU/TCP, OPC UA and MQTT. This demo runs the calculation engine in the browser on a simulated dataset.</div>
    </Panel>
  );
}

// ---------------- data quality & energy balance ----------------
export function DataQuality() {
  const { r, cmp, gran, cmpLabel, P } = useView();
  const inc = sum(INCOMING, r.i0, r.i1), grid = sum(GRID, r.i0, r.i1), dg = sum(DG_KWH, r.i0, r.i1), sol = sum(SOLAR_KWH, r.i0, r.i1), exp = sum(EXPORT, r.i0, r.i1);
  const prod = sum(PROD_KWH, r.i0, r.i1), util = sum(UTIL_TOTAL, r.i0, r.i1), adm = sum(BLD.ADM.kwh, r.i0, r.i1), wh = sum(BLD.WH.kwh, r.i0, r.i1), hubs = sum(BLD.HUB1.kwh, r.i0, r.i1) + sum(BLD.HUB2.kwh, r.i0, r.i1) + sum(BLD.HUB3.kwh, r.i0, r.i1);
  const totalIn = grid + dg + sol; // grid here is import incl. export offset
  const accounted = prod + util + adm + wh + hubs;
  const diff = totalIn - accounted - exp;
  const diffPct = (diff / totalIn) * 100;
  const trend = useMemo(() => bucketSeries(r, gran, { inc: (d) => INCOMING[d], acc: (d) => CONS[d] }).map((x: any) => ({ ...x, pct: ((x.inc - x.acc) / x.inc) * 100 })), [r, gran]);
  const rec = useMemo(() => reconcile(r.i0, r.i1), [r]);
  const LV: [string, string][] = [['Grid', 'Main incomer → transformers'], ['Transformer', 'Transformers → main LT panels'], ['Main Panel', 'Main LT panels → department panels'], ['Department', 'Department panels → line / utility meters (partial)']];
  const levels = LV.map(([lv, name]) => { const rows = rec.filter((x) => x.level === lv); const p = rows.reduce((s, x) => s + x.parentKwh, 0), c = rows.reduce((s, x) => s + x.childKwh, 0); return { name, parent: p, child: c, pct: ((p - c) / p) * 100 }; });
  const dq = useMemo(() => METERS.map((m) => { let c = 0, miss = 0; for (let d = r.i0; d <= r.i1; d++) { const v = completeness(m, d); c += v; if (v === 0) miss++; } const comp = c / (r.i1 - r.i0 + 1); return { id: m.id, name: m.name, dq: m.dq, comp, miss, conf: m.dq === 'Good' ? Math.min(99.9, comp) : m.dq === 'Offline' ? 0 : comp * 0.92, last: m.lastComm }; }), [r]);
  const issues = dq.filter((x) => x.dq !== 'Good' || x.comp < 99);
  const avgComp = dq.reduce((s, x) => s + x.comp, 0) / dq.length;
  const hubEst = [...HUB2_METER_OFFLINE].filter((d) => d >= r.i0 && d <= r.i1).reduce((s, d) => s + BLD.HUB2.kwh[d], 0);
  // demo of robust diff calc
  const demo = periodConsumptionRows([{ date: 'T0', reading: 99999500 }, { date: 'T1', reading: 99999900 }, { date: 'T2', reading: 250 }, { date: 'T3', reading: null }, { date: 'T4', reading: 1050 }, { date: 'T5', reading: 1040 }, { date: 'T6', reading: 1400 }, { date: 'T7', reading: 120 }]);
  return (
    <div>
      <PageHeader title="Data Quality & Energy Balance" sub={`Meter hierarchy reconciliation engine · ${cmpLabel}`} />
      <div className="grid g6">
        <Kpi label="Total incoming energy" value={kwh(totalIn)[0]} unit={kwh(totalIn)[1]} change={null} cmpLabel="grid + DG + solar" status="info" />
        <Kpi label="Total sub-metered (accounted)" value={kwh(accounted)[0]} unit={kwh(accounted)[1]} change={null} cmpLabel="department-level meters only" status="info" />
        <Kpi label="Exported energy" value={kwh(exp)[0]} unit={kwh(exp)[1]} change={null} cmpLabel="solar export" status="info" />
        <Kpi label="Energy balance difference" value={kwh(diff)[0]} unit={kwh(diff)[1]} change={null} cmpLabel={`${n2(diffPct)}% of incoming`} status={diffPct > 3 ? 'warn' : 'good'} />
        <Kpi label="Data completeness (all meters)" value={n2(avgComp)} unit="%" change={null} cmpLabel={`${issues.length} meters with issues`} status={avgComp < 99 ? 'warn' : 'good'} />
        <Kpi label="Estimated energy in period" value={kwh(hubEst)[0]} unit={kwh(hubEst)[1]} change={null} cmpLabel="Hub 02 meter offline (EST)" status={hubEst ? 'warn' : 'good'} />
      </div>
      <div className="grid g3 mt">
        <Panel title="Energy balance calculation">
          <table className="tbl"><tbody>
            <tr><td>Grid import</td><td className="num">{kwhS(grid)}</td></tr><tr><td>+ DG generation</td><td className="num">{kwhS(dg)}</td></tr><tr><td>+ Solar generation</td><td className="num">{kwhS(sol)}</td></tr>
            <tr><td><b>= Total incoming</b></td><td className="num"><b>{kwhS(totalIn)}</b></td></tr>
            <tr><td>Production</td><td className="num">{kwhS(prod)}</td></tr><tr><td>+ Utilities</td><td className="num">{kwhS(util)}</td></tr><tr><td>+ Administration</td><td className="num">{kwhS(adm)}</td></tr><tr><td>+ Warehouse</td><td className="num">{kwhS(wh)}</td></tr><tr><td>+ Distribution hubs</td><td className="num">{kwhS(hubs)}</td></tr>
            <tr><td><b>= Total accounted</b></td><td className="num"><b>{kwhS(accounted)}</b></td></tr><tr><td>− Exported</td><td className="num">{kwhS(exp)}</td></tr>
            <tr><td><b>Balance difference</b></td><td className="num"><b style={{ color: diffPct > 3 ? C.amber : C.green }}>{kwhS(diff)} ({n2(diffPct)}%)</b></td></tr>
          </tbody></table>
          <div className="muted mt" style={{ fontSize: 11 }}>Difference = Incoming − Accounted − Exported. Only department-level meters are summed, so line and machine meters (children) are never double counted.</div>
        </Panel>
        <Panel title="Energy balance trend" sub="Unaccounted % of incoming" className="span2"><Combo data={trend} series={[{ key: 'inc', name: 'Incoming kWh', type: 'area', color: C.blue }, { key: 'acc', name: 'Accounted kWh', type: 'line', color: C.cyan }, { key: 'pct', name: 'Unaccounted %', type: 'line', color: C.red, axis: 'right' }]} height={300} digits={2} /></Panel>
      </div>
      <div className="grid g2 mt">
        <Panel title="Energy balance by distribution level"><DataTable cols={[{ key: 'name', label: 'Level' }, { key: 'parent', label: 'Parent kWh', num: true }, { key: 'child', label: 'Σ child kWh', num: true }, { key: 'pct', label: 'Loss / gap %', num: true, render: (x: any) => n2(x.pct) }]} rows={levels} /></Panel>
        <Panel title="Reconciliation engine – exceptions" sub="Missing, overlapping or inconsistent measurements">
          <DataTable cols={[{ key: 'parent', label: 'Parent' }, { key: 'parentName', label: 'Name' }, { key: 'diffPct', label: 'Gap %', num: true, render: (x: any) => n2(x.diffPct) }, { key: 'note', label: 'Assessment', render: (x: any) => <span style={{ whiteSpace: 'normal' }}>{x.note}</span> }]} rows={rec.filter((x) => x.note !== 'Within tolerance')} maxHeight={260} />
        </Panel>
      </div>
      <div className="grid g2 mt">
        <Panel title="Meter data quality" sub="Communication status, missing data, stale data, duplicates, resets, rollovers, confidence">
          <DataTable exportName="data-quality" onRow={(x: any) => go(`#/meters/${x.id}`)} cols={[{ key: 'id', label: 'Meter' }, { key: 'name', label: 'Name' }, { key: 'dq', label: 'Status', render: (x: any) => <Badge kind={dqKind(x.dq)}>{x.dq}</Badge> }, { key: 'comp', label: 'Completeness %', num: true, render: (x: any) => n2(x.comp) }, { key: 'miss', label: 'Missing days', num: true }, { key: 'conf', label: 'Confidence %', num: true, render: (x: any) => n1(x.conf) }, { key: 'last', label: 'Last comm.' }]} rows={issues} />
        </Panel>
        <Panel title="How cumulative readings are converted to consumption" sub="Worked example of the difference engine (rollover at 99,999,999)">
          <DataTable cols={[{ key: 'date', label: 'Sample' }, { key: 'reading', label: 'Register', num: true, render: (x: any) => (x.reading == null ? <Badge kind="grey">missing</Badge> : n0(x.reading)) }, { key: 'consumption', label: 'Δ kWh', num: true, render: (x: any) => n1(x.consumption) }, { key: 'status', label: 'Status', render: (x: any) => <Badge kind={x.status === 'OK' ? 'good' : 'est'}>{x.status}</Badge> }, { key: 'method', label: 'Rule applied' }]} rows={demo} />
          <div className="muted mt" style={{ fontSize: 11 }}>Cumulative registers are never summed. Rollovers are corrected, resets restart from zero, negative steps are rejected and gaps are back-filled and flagged as estimated.</div>
        </Panel>
      </div>
    </div>
  );
}

// ---------------- integration ----------------
export function Integration() {
  const conns = [
    { name: 'Modbus TCP (energy meters)', proto: 'Modbus TCP', devices: METERS.filter((m) => m.protocol.startsWith('Modbus TCP')).length, freq: '1 min (1 s for grid incomer)', status: 'Simulated' },
    { name: 'Modbus RTU via RS-485 gateways', proto: 'Modbus RTU', devices: METERS.filter((m) => m.protocol === 'Modbus RTU').length, freq: '1 min', status: 'Simulated' },
    { name: 'OPC UA – line PLCs (machine states, counts)', proto: 'OPC UA', devices: 15, freq: '5 s states / 1 min counts', status: 'Not connected – simulated' },
    { name: 'MQTT broker – IoT sensors', proto: 'MQTT', devices: 24, freq: '10 s', status: 'Not connected – simulated' },
    { name: 'MES – production orders, batches, SKUs', proto: 'REST / OData', devices: 1, freq: '15 min', status: 'Not connected – simulated' },
    { name: 'ERP – tariffs, cost centres', proto: 'REST', devices: 1, freq: 'Daily', status: 'Not connected – manual config' },
    { name: 'SCADA / BMS (HVAC, utilities)', proto: 'BACnet / OPC UA', devices: 2, freq: '1 min', status: 'Not connected – simulated' },
    { name: 'CSV / Excel upload', proto: 'File', devices: 0, freq: 'On demand', status: 'Available' },
  ];
  const freqs = ['1 second', '5 seconds', '10 seconds', '30 seconds', '1 minute', '5 minutes', '15 minutes', 'Hourly', 'Daily'];
  const api = [['POST', '/api/v1/ingest/readings', 'Batch meter readings (register values, quality flags)'], ['POST', '/api/v1/ingest/production', 'Production records (order, batch, SKU, qty)'], ['POST', '/api/v1/ingest/machine-states', 'Machine state intervals'], ['GET', '/api/v1/energy?scope=&from=&to=&interval=', 'Aggregated consumption'], ['GET', '/api/v1/kpi/sec?line=&from=&to=', 'Specific energy consumption'], ['GET', '/api/v1/insights', 'Generated insights'], ['PATCH', '/api/v1/alerts/{id}', 'Acknowledge / assign / resolve'], ['PUT', '/api/v1/config/tariff', 'Tariff configuration']];
  return (
    <div>
      <PageHeader title="Data Integration & Configuration" sub="This demo has NO live connectivity. A simulated ingestion layer generates 2 years of readings, production and machine states." />
      <div className="grid g4">
        <Kpi label="Data source mode" value="Simulated" change={null} cmpLabel="seed 20241102, deterministic" status="info" tag={<Badge kind="sim">SIM</Badge>} />
        <Kpi label="History available" value="730" unit="days" change={null} cmpLabel={`${DATES[0]} → ${DATES[DAYS - 1]}`} status="info" />
        <Kpi label="Default electrical interval" value="1" unit="min" change={null} cmpLabel="per meter override supported" status="info" />
        <Kpi label="Live connections" value="0" change={null} cmpLabel="none claimed" status="na" />
      </div>
      <Panel title="Connectors" className="mt">
        <DataTable cols={[{ key: 'name', label: 'Connector' }, { key: 'proto', label: 'Protocol' }, { key: 'devices', label: 'Devices', num: true }, { key: 'freq', label: 'Collection frequency' }, { key: 'status', label: 'Status', render: (x: any) => <Badge kind={x.status === 'Simulated' ? 'sim' : x.status === 'Available' ? 'good' : 'grey'}>{x.status}</Badge> }]} rows={conns} />
      </Panel>
      <div className="grid g3 mt">
        <Panel title="Supported acquisition frequencies"><div className="row">{freqs.map((f) => <span key={f} className={'chip' + (f === '1 minute' ? ' on' : '')}>{f}</span>)}</div><div className="muted mt" style={{ fontSize: 11.5 }}>Aggregations: real-time, hourly, daily, weekly, monthly, quarterly and annual summaries derived from register differences.</div></Panel>
        <Panel title="Data status legend">
          <div className="row" style={{ gap: 6 }}><Badge kind="good">LIVE</Badge><span className="muted">not used in this demo</span></div>
          <div className="row mt" style={{ gap: 6 }}><Badge kind="sim">SIMULATED</Badge><span className="muted">all values in this demo</span></div>
          <div className="row mt" style={{ gap: 6 }}><Badge kind="info">HISTORICAL</Badge><span className="muted">closed periods</span></div>
          <div className="row mt" style={{ gap: 6 }}><Badge kind="est">EST</Badge><span className="muted">estimated / back-filled / allocated</span></div>
          <div className="row mt" style={{ gap: 6 }}><Badge kind="grey">MISSING</Badge><span className="muted">no data, not estimated</span></div>
        </Panel>
        <Panel title="Production-energy alignment"><div className="muted" style={{ fontSize: 12.5 }}>Machine states and production counts are aligned to the same 1-minute intervals as energy readings. Each interval&apos;s kWh is tagged with the machine state (Running, Idle, Setup, Changeover, Planned Stop, Unplanned Stop, Fault, Maintenance, Cleaning, No Production), which drives the idle and non-production energy KPIs.</div></Panel>
      </div>
      <Panel title="REST API (reference design)" className="mt"><DataTable cols={[{ key: 'm', label: 'Method' }, { key: 'p', label: 'Endpoint', render: (x: any) => <span className="mono">{x.p}</span> }, { key: 'd', label: 'Purpose' }]} rows={api.map(([m, p, d]) => ({ m, p, d }))} /></Panel>
    </div>
  );
}

// ---------------- admin ----------------
export function Admin() {
  const { persona, resetDemo } = useStore();
  const perms = ['Edit targets & tariffs', 'Edit projects', 'Administer users & config'];
  const allPages = NAV.flatMap((g) => g.items);
  const matrix = PERSONAS.map((p) => ({ role: p.title, user: p.name, access: p.pages === 'all' ? 'All modules' : allPages.filter((it) => canSee(p, it.href)).map((it) => it.label).join(', '), scope: p.dept === 'UTL' ? 'Utilities' : p.dept === 'PRD' ? 'Production' : 'Whole plant', cells: [p.canEdit, p.canEdit, p.canAdmin] }));
  const audit = [['2026-11-02 07:31', 'system', 'Simulated ingestion cycle completed (1-min batch)'], ['2026-11-01 18:20', 'Priya Deshmukh', 'Updated Line 04 SEC target'], ['2026-11-01 09:05', 'Vikram Pawar', 'Acknowledged ALM – Compressor 02 efficiency'], ['2026-10-31 16:44', 'Arvind Mehta', 'Approved project EIP-003 Chiller sequencing'], ['2026-10-29 00:02', 'system', 'Meter EM-P-HUB-02 communication lost']];
  return (
    <div>
      <PageHeader title="Administration & User Management" sub="Roles, permissions and audit trail (demo)" actions={<button className="btn" onClick={() => { if (persona?.canAdmin) resetDemo(); }} disabled={!persona?.canAdmin}>Reset demo configuration</button>} />
      <Panel title="Users & roles">
        <div style={{ overflowX: 'auto' }}><table className="tbl"><thead><tr><th>Role</th><th>User</th><th>Modules</th><th>Data scope</th>{perms.map((p) => <th key={p}>{p}</th>)}</tr></thead><tbody>
          {matrix.map((m) => <tr key={m.role}><td><b>{m.role}</b></td><td>{m.user}</td><td style={{ whiteSpace: 'normal', minWidth: 260, fontSize: 12 }}>{m.access}</td><td>{m.scope}</td>{m.cells.map((c, i) => <td key={i} style={{ textAlign: 'center', color: c ? C.green : '#3a4f75' }}>{c ? '●' : '○'}</td>)}</tr>)}
        </tbody></table></div>
        <div className="muted mt" style={{ fontSize: 11.5 }}>Signed in as {persona?.name} ({persona?.title}). Production deployment: SSO via SAML / OIDC, plant- and department-scoped roles.</div>
      </Panel>
      <Panel title="Audit log (sample)" className="mt"><DataTable cols={[{ key: 't', label: 'Time' }, { key: 'u', label: 'User' }, { key: 'a', label: 'Action' }]} rows={audit.map(([t, u, a]) => ({ t, u, a }))} /></Panel>
    </div>
  );
}
void Donut; void pct; void safeDiv; void LOSSPCT; void BLD_TOTAL;
