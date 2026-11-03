import { useMemo, useState } from 'react';
import { BUILDINGS, DGS, SOLAR, TRANSFORMERS } from '../data/assets';
import { buckets, pct, safeDiv, sum, max } from '../data/engine';
import { BLD, DATES, DG_FUEL, DG_HOURS, DG_KWH, DG_UNIT, EXPORT, GRID, HUB2_METER_OFFLINE, INCOMING, INVERTER2_OUTAGE, KVARH, PEAK_KVA, PEAK_KW, PF, plantHourly, SOLAR_INV, SOLAR_KWH, solarShape, TEMP, TR_KWH, TR_PEAK_KVA, DOW } from '../data/sim';
import { reconcile } from '../data/meters';
import { hash01 } from '../data/rng';
import { C, kwh, kwhS, n0, n1, n2, PALETTE, pctS, rs, rsS } from '../format';
import { Badge, Combo, DataTable, Donut, HBar, Kpi, PageHeader, Panel, Scatter2, Tabs } from '../components/ui';
import { bucketSeries, spark, useView } from './common';

export function Electrical() {
  const { r, cmp, cfg, P, Pc, gran, cmpLabel } = useView();
  const [tab, setTab] = useState<'in' | 'tr' | 'dist' | 'dg' | 'sol'>('in');
  const d = r.i1;
  const h = plantHourly(d);
  const kwNow = h[10];
  const pfNow = PF[d] - 0.004;
  const kvaNow = kwNow / pfNow;
  const kvarNow = Math.sqrt(kvaNow ** 2 - kwNow ** 2);
  const vLL = [22.08, 21.96, 22.03].map((v, i) => v + 0.1 * (hash01(d, i) - 0.5));
  const iPh = [0, 1, 2].map((i) => ((kvaNow * 1000) / (Math.sqrt(3) * 22000)) * (1 + 0.02 * (hash01(d, i, 4) - 0.5)));
  const monthly = useMemo(() => buckets({ i0: Math.max(0, r.i1 - 729), i1: r.i1 }, 'month').map((b) => ({ label: b.label, kva: max(PEAK_KVA, b.i0, b.i1), kw: max(PEAK_KW, b.i0, b.i1), pf: sum(INCOMING, b.i0, b.i1) / Math.sqrt(sum(INCOMING, b.i0, b.i1) ** 2 + sum(KVARH, b.i0, b.i1) ** 2) })), [r]);
  const daily = useMemo(() => bucketSeries(r, gran, { imp: (x) => GRID[x], exp: (x) => EXPORT[x], kvarh: (x) => KVARH[x], pf: (x) => PF[x] }, { imp: 'sum', exp: 'sum', kvarh: 'sum', pf: 'avg' }), [r, gran]);
  const trRows = TRANSFORMERS.map((t) => {
    const e = sum(TR_KWH[t.id], r.i0, r.i1);
    const pk = max(TR_PEAK_KVA[t.id], r.i0, r.i1);
    const cur = (TR_KWH[t.id][d] / 24) * 1.08 / PF[d];
    let over = 0; for (let x = r.i0; x <= r.i1; x++) if (TR_PEAK_KVA[t.id][x] / t.ratedKva > 0.9) over++;
    const lp = cur / t.ratedKva;
    const kW = cur * PF[d];
    return { id: t.id, name: t.name, feeds: t.feeds, rated: t.ratedKva, cur, lp: lp * 100, pk, pkp: (pk / t.ratedKva) * 100, v: t.secondaryV + 3 * (hash01(t.ratedKva, d) - 0.5), i: (cur * 1000) / (Math.sqrt(3) * t.secondaryV), kw: kW, kvar: Math.sqrt(cur ** 2 - kW ** 2), pf: PF[d] + 0.005 * (hash01(t.ratedKva) - 0.5), e, temp: 42 + 38 * lp ** 2 + (TEMP[d] - 25) * 0.6, over, share: 0 };
  });
  const trTot = trRows.reduce((s, x) => s + x.e, 0);
  trRows.forEach((x) => (x.share = (x.e / trTot) * 100));
  const trProfile = useMemo(() => bucketSeries(r, gran, Object.fromEntries(TRANSFORMERS.map((t) => [t.id, (x: number) => (TR_PEAK_KVA[t.id][x] / t.ratedKva) * 100])), 'max'), [r, gran]);
  const rec = useMemo(() => reconcile(r.i0, r.i1), [r]);
  const dgRuns = useMemo(() => { const o: any[] = []; for (let x = r.i0; x <= r.i1; x++) if (DG_KWH[x] > 0) o.push({ date: DATES[x], hours: DG_HOURS[x], kwh: DG_KWH[x], fuel: DG_FUEL[x], kwhl: DG_KWH[x] / DG_FUEL[x], load: (DG_KWH[x] / DG_HOURS[x] / (DGS.reduce((s, g) => s + g.ratedKva, 0) * 0.8)) * 100, cost: DG_FUEL[x] * cfg.tariff.dieselPrice + DG_KWH[x] * cfg.tariff.dgOm }); return o.reverse(); }, [r, cfg]);
  const dgK = sum(DG_KWH, r.i0, r.i1), dgF = sum(DG_FUEL, r.i0, r.i1), dgH = sum(DG_HOURS, r.i0, r.i1);
  const solarTrend = useMemo(() => bucketSeries(r, gran, { i1: (x) => SOLAR_INV[0][x], i2: (x) => SOLAR_INV[1][x], i3: (x) => SOLAR_INV[2][x], exp: (x) => EXPORT[x] }), [r, gran]);
  const solarHour = solarShape.map((v, hh) => ({ label: `${String(hh).padStart(2, '0')}:00`, solar: (SOLAR_KWH[d] / 24) * v, load: h[hh] }));
  const solar = sum(SOLAR_KWH, r.i0, r.i1), exp = sum(EXPORT, r.i0, r.i1);
  let outageDays = 0; for (let x = r.i0; x <= r.i1; x++) if (INVERTER2_OUTAGE.has(x)) outageDays++;
  const avail = 100 - (outageDays / ((r.i1 - r.i0 + 1) * 3)) * 100;
  return (
    <div>
      <PageHeader title="Electrical Infrastructure" sub={`22 kV grid incomer · 4 transformers · 3 DG sets · ${SOLAR.capacityKwp} kWp solar · ${cmpLabel}`} />
      <Tabs tabs={[{ key: 'in', label: 'Incoming power' }, { key: 'tr', label: 'Transformers' }, { key: 'dist', label: 'Distribution & panels' }, { key: 'dg', label: 'Diesel generators' }, { key: 'sol', label: 'Solar' }]} value={tab} onChange={setTab} />
      {tab === 'in' && (
        <>
          <div className="grid g6">
            <Kpi label="Grid voltage (L-L avg)" value={n2(vLL.reduce((a, b) => a + b) / 3)} unit="kV" change={null} cmpLabel={`R-Y ${n2(vLL[0])} · Y-B ${n2(vLL[1])} · B-R ${n2(vLL[2])}`} status="good" tag={<Badge kind="sim">SIM</Badge>} />
            <Kpi label="Phase voltage (avg)" value={n2(vLL.reduce((a, b) => a + b) / 3 / Math.sqrt(3))} unit="kV" change={null} cmpLabel="phase-neutral" status="info" />
            <Kpi label="Phase current" value={n0(iPh[0])} unit="A" change={null} cmpLabel={`R ${n0(iPh[0])} · Y ${n0(iPh[1])} · B ${n0(iPh[2])}`} status="info" />
            <Kpi label="Active power" value={n0(kwNow)} unit="kW" change={null} cmpLabel={`${DATES[d]} 10:00`} status="info" />
            <Kpi label="Reactive power" value={n0(kvarNow)} unit="kVAR" change={null} cmpLabel="instantaneous" status="info" />
            <Kpi label="Apparent power" value={n0(kvaNow)} unit="kVA" change={null} cmpLabel="instantaneous" status="info" />
            <Kpi label="Power factor (period)" value={n2(P.pf)} change={pct(P.pf, Pc?.pf)} lowerIsBetter={false} cmpLabel={cmpLabel} status={P.pf < cfg.tariff.pfThreshold ? 'bad' : 'good'} spark={spark(r, (x) => PF[x])} />
            <Kpi label="Frequency" value={n2(49.98 + 0.06 * (hash01(d) - 0.5))} unit="Hz" change={null} cmpLabel="instantaneous" status="good" />
            <Kpi label="Grid import energy" value={kwh(P.grid)[0]} unit={kwh(P.grid)[1]} change={pct(P.grid, Pc?.grid)} cmpLabel={cmpLabel} />
            <Kpi label="Export energy" value={kwh(P.exported)[0]} unit={kwh(P.exported)[1]} change={null} cmpLabel="solar surplus" status="info" />
            <Kpi label="Maximum demand" value={n0(P.peakKva)} unit="kVA" change={pct(P.peakKva, Pc?.peakKva)} cmpLabel={`contract ${cfg.targets.contractDemandKva}`} status={P.peakKva > cfg.targets.contractDemandKva ? 'bad' : 'good'} />
            <Kpi label="Maximum demand (kW)" value={n0(P.peakKw)} unit="kW" change={pct(P.peakKw, Pc?.peakKw)} cmpLabel={cmpLabel} />
          </div>
          <div className="grid g2 mt">
            <Panel title="Import / export and reactive energy"><Combo data={daily} series={[{ key: 'imp', name: 'Import kWh', color: C.blue }, { key: 'exp', name: 'Export kWh', color: C.amber }, { key: 'kvarh', name: 'kVARh', type: 'line', color: C.violet }]} height={240} /></Panel>
            <Panel title="Power factor trend" sub={`Threshold ${cfg.tariff.pfThreshold}`}><Combo data={daily} series={[{ key: 'pf', name: 'PF', type: 'line', color: C.cyan }]} refLines={[{ y: cfg.tariff.pfThreshold, label: 'PF threshold', color: C.red }]} height={240} digits={2} /></Panel>
          </div>
          <Panel title="Monthly maximum demand vs contract demand" className="mt"><Combo data={monthly} series={[{ key: 'kva', name: 'MD kVA', color: C.violet }, { key: 'kw', name: 'MD kW', type: 'line', color: C.cyan }]} refLines={[{ y: cfg.targets.contractDemandKva, label: 'Contract demand', color: C.red }]} height={240} /></Panel>
          <div className="note mt">Power quality (simulated): voltage THD 1.8–2.6%, current THD 6–9% on TR-03 (VFD loads), voltage unbalance &lt; 0.6%.</div>
        </>
      )}
      {tab === 'tr' && (
        <>
          <div className="grid g4">
            {trRows.map((t) => (
              <Panel key={t.id} title={t.id} sub={t.name.split('– ')[1] + ` · ${t.rated} kVA`}>
                <div className="kpi-v" style={{ color: t.pkp > 90 ? C.red : t.pkp > 80 ? C.amber : C.green }}>{n0(t.pkp)}<small>% peak loading</small></div>
                <div className="row between muted" style={{ fontSize: 12 }}><span>Now {n0(t.lp)}%</span><span>Temp {n0(t.temp)} °C</span><span>{t.over} days &gt; 90%</span></div>
                <div style={{ height: 6, background: '#132a52', borderRadius: 3, marginTop: 6 }}><div style={{ width: `${Math.min(100, t.pkp)}%`, height: '100%', background: t.pkp > 90 ? C.red : t.pkp > 80 ? C.amber : C.cyan, borderRadius: 3 }} /></div>
              </Panel>
            ))}
          </div>
          <Panel title="Transformer dashboard" className="mt" sub={`Instantaneous values on ${DATES[d]} (simulated); energy and peaks for the period`}>
            <DataTable exportName="transformers" cols={[
              { key: 'id', label: 'Transformer' }, { key: 'feeds', label: 'Feeds' }, { key: 'rated', label: 'Rated kVA', num: true }, { key: 'cur', label: 'Current load kVA', num: true }, { key: 'lp', label: 'Load %', num: true, render: (x: any) => n1(x.lp) },
              { key: 'v', label: 'Secondary V', num: true }, { key: 'i', label: 'Current A', num: true }, { key: 'kw', label: 'kW', num: true }, { key: 'kvar', label: 'kVAR', num: true }, { key: 'pf', label: 'PF', num: true, render: (x: any) => n2(x.pf) },
              { key: 'e', label: 'Energy kWh', num: true, bar: true }, { key: 'pk', label: 'Peak kVA', num: true }, { key: 'temp', label: 'Oil temp °C', num: true }, { key: 'over', label: 'Overload days', num: true },
            ]} rows={trRows} />
          </Panel>
          <div className="grid g3 mt">
            <Panel title="Transformer peak loading profile" sub="Max daily loading % per bucket" className="span2"><Combo data={trProfile} series={TRANSFORMERS.map((t, i) => ({ key: t.id, name: t.id, type: 'line' as const, color: PALETTE[i] }))} refLines={[{ y: 90, label: '90% limit', color: C.red }]} height={250} /></Panel>
            <Panel title="Transformer load balance" sub="Energy share"><Donut height={150} data={trRows.map((t, i) => ({ name: t.id, value: t.e, color: PALETTE[i] }))} /><div className="note mt">TR-03 (utilities) runs much hotter than TR-01 and TR-02. Moving the chiller plant MCC to TR-01 would balance loading.</div></Panel>
          </div>
        </>
      )}
      {tab === 'dist' && (
        <>
          <div className="note">Distribution tree: Grid → Main incomer → Transformer → Main LT panel → Department / MCC panel → Line / utility panel → Machine. Open <a href="#/tree">Energy Hierarchy</a> and choose “Electrical distribution” for the full expandable tree.</div>
          <Panel title="Meter-to-meter energy balance" sub="Parent meter vs Σ child meters for the period" className="mt">
            <DataTable exportName="meter-balance" cols={[
              { key: 'parent', label: 'Parent meter' }, { key: 'parentName', label: 'Name' }, { key: 'level', label: 'Level' }, { key: 'children', label: 'Children', num: true }, { key: 'parentKwh', label: 'Parent kWh', num: true, bar: true }, { key: 'childKwh', label: 'Σ children kWh', num: true },
              { key: 'diffPct', label: 'Difference %', num: true, render: (x: any) => <span className={Math.abs(x.diffPct) > 3 && x.level !== 'Utility / Line' ? 'up-bad' : ''}>{n2(x.diffPct)}</span> }, { key: 'note', label: 'Assessment' },
            ]} rows={rec} />
          </Panel>
          <div className="grid g2 mt">
            <Panel title="Panel loading" sub="Average and estimated peak kW per department panel">
              <HBar data={rec.filter((x) => x.level === 'Department' || x.level === 'Main Panel').map((x) => ({ name: x.parentName, value: x.parentKwh / ((r.i1 - r.i0 + 1) * 24) }))} unit="avg kW" labelWidth={200} />
            </Panel>
            <Panel title="Distribution losses" sub="Transformer + cable + unmetered, % of incoming">
              <Combo data={bucketSeries(r, gran, { inc: (x) => INCOMING[x], tr: (x) => TRANSFORMERS.reduce((s, t) => s + TR_KWH[t.id][x], 0) }).map((x: any) => ({ ...x, loss: ((x.inc - x.tr) / x.inc) * 100 }))} series={[{ key: 'loss', name: 'Incomer → transformer LV loss %', type: 'line', color: C.red }]} height={240} digits={2} />
            </Panel>
          </div>
        </>
      )}
      {tab === 'dg' && (
        <>
          <div className="grid g6">
            <Kpi label="DG running status" value={DG_KWH[d] > 0 ? 'Running' : 'Standby'} change={null} cmpLabel={`as of ${DATES[d]}`} status={DG_KWH[d] > 0 ? 'warn' : 'good'} />
            <Kpi label="DG generation" value={kwh(dgK)[0]} unit={kwh(dgK)[1]} change={pct(dgK, Pc?.dg)} cmpLabel={cmpLabel} />
            <Kpi label="Fuel consumption" value={n0(dgF)} unit="L diesel" change={pct(dgF, Pc?.dgFuel)} cmpLabel={cmpLabel} />
            <Kpi label="Running hours" value={n1(dgH)} unit="h" change={null} cmpLabel={`${dgRuns.length} grid-outage events`} status="info" />
            <Kpi label="kWh per litre" value={n2(safeDiv(dgK, dgF))} unit="kWh/L" change={null} cmpLabel="design 3.5" status={safeDiv(dgK, dgF) < 3.3 && dgF > 0 ? 'warn' : 'good'} />
            <Kpi label="DG generation cost" value={rs(P.cost.dg)[0]} unit={rs(P.cost.dg)[1]} change={null} cmpLabel={`₹${n1(safeDiv(P.cost.dg, dgK))}/kWh vs grid ₹${n1(P.cost.perKwh)}`} status="warn" />
          </div>
          <div className="grid g3 mt">
            {DGS.map((g, i) => { const e = sum(DG_UNIT[i], r.i0, r.i1); return <Panel key={g.id} title={g.name} sub={`${g.ratedKva} kVA`}><div className="row between"><div><div className="muted">Generation</div><b>{kwhS(e)}</b></div><div><div className="muted">Fuel</div><b>{n0(e / 3.35)} L</b></div><div><div className="muted">Avg load</div><b>{dgH ? n0((e / dgH / (g.ratedKva * 0.8)) * 100) : 0}%</b></div><div><div className="muted">Efficiency</div><b>{dgH ? n0((3.35 * 3.6 / 38.6) * 100 * 1.0) : 0}%</b></div></div></Panel>; })}
          </div>
          <Panel title="DG run log" className="mt"><DataTable exportName="dg-runs" cols={[{ key: 'date', label: 'Date' }, { key: 'hours', label: 'Hours', num: true, render: (x: any) => n1(x.hours) }, { key: 'kwh', label: 'kWh', num: true, bar: true }, { key: 'fuel', label: 'Fuel L', num: true }, { key: 'kwhl', label: 'kWh/L', num: true, render: (x: any) => n2(x.kwhl) }, { key: 'load', label: 'Load %', num: true, render: (x: any) => n0(x.load) }, { key: 'cost', label: 'Cost ₹', num: true }]} rows={dgRuns} pageSize={10} /></Panel>
        </>
      )}
      {tab === 'sol' && (
        <>
          <div className="grid g6">
            <Kpi label="Solar generation" value={kwh(solar)[0]} unit={kwh(solar)[1]} change={pct(solar, Pc?.solar)} lowerIsBetter={false} cmpLabel={cmpLabel} spark={spark(r, (x) => SOLAR_KWH[x])} />
            <Kpi label="Solar now (10:00)" value={n0((SOLAR_KWH[d] / 24) * solarShape[10])} unit="kW AC" change={null} cmpLabel={`DC ≈ ${n0((SOLAR_KWH[d] / 24) * solarShape[10] * 1.03)} kW`} status="info" tag={<Badge kind="sim">SIM</Badge>} />
            <Kpi label="Specific yield" value={n2(solar / SOLAR.capacityKwp / (r.i1 - r.i0 + 1))} unit="kWh/kWp/day" change={null} cmpLabel="performance" status="info" />
            <Kpi label="Plant availability" value={n1(avail)} unit="%" change={null} cmpLabel={outageDays ? `${outageDays} inverter-days lost` : 'no outages'} status={avail < 99 ? 'warn' : 'good'} />
            <Kpi label="Self-consumption" value={n1(((solar - exp) / Math.max(1, solar)) * 100)} unit="%" change={null} cmpLabel={`export ${kwhS(exp)}`} status="good" />
            <Kpi label="Renewable contribution" value={n1(P.renewablePct)} unit="%" change={pct(P.renewablePct, Pc?.renewablePct)} lowerIsBetter={false} cmpLabel={cmpLabel} />
          </div>
          <div className="grid g2 mt">
            <Panel title="Solar generation by inverter"><Combo data={solarTrend} series={[{ key: 'i1', name: 'Inverter 01', stack: 's', color: C.amber }, { key: 'i2', name: 'Inverter 02', stack: 's', color: '#fbbf24' }, { key: 'i3', name: 'Inverter 03', stack: 's', color: '#fde68a' }, { key: 'exp', name: 'Grid export', type: 'line', color: C.green }]} height={240} /></Panel>
            <Panel title={`Solar vs plant load on ${DATES[d]}`}><Combo data={solarHour} series={[{ key: 'load', name: 'Plant load kW', type: 'area', color: C.blue }, { key: 'solar', name: 'Solar kW', type: 'area', color: C.amber }]} height={240} /></Panel>
          </div>
          <Panel title="Inverters" className="mt"><DataTable cols={[{ key: 'id', label: 'Inverter' }, { key: 'kw', label: 'Rated kW', num: true }, { key: 'e', label: 'Period kWh', num: true, bar: true }, { key: 'status', label: 'Status', render: (x: any) => <Badge kind={x.status === 'Online' ? 'good' : 'high'}>{x.status}</Badge> }]} rows={SOLAR.inverters.map((v, i) => ({ id: v.id, kw: v.kw, e: sum(SOLAR_INV[i], r.i0, r.i1), status: INVERTER2_OUTAGE.has(d) && i === 1 ? 'Fault' : 'Online' }))} /></Panel>
        </>
      )}
    </div>
  );
}

// ---------------- buildings & hubs ----------------
export function Buildings({ hubs }: { hubs?: boolean }) {
  const { r, cmp, P, gran, cmpLabel } = useView();
  const list = BUILDINGS.filter((b) => (hubs ? b.kind === 'Hub' : b.kind !== 'Hub'));
  const all = BUILDINGS.map((b) => {
    const k = sum(BLD[b.id].kwh, r.i0, r.i1), act = sum(BLD[b.id].act, r.i0, r.i1), t = sum(BLD[b.id].tonnes, r.i0, r.i1), hrs = sum(BLD[b.id].hours, r.i0, r.i1);
    const c = cmp ? sum(BLD[b.id].kwh, cmp.i0, cmp.i1) : null;
    const hv = b.assets.filter((a) => a.group === 'HVAC').reduce((s, a) => s + a.share, 0), li = b.assets.filter((a) => a.group === 'Lighting').reduce((s, a) => s + a.share, 0);
    const est = b.id === 'HUB2' && [...HUB2_METER_OFFLINE].some((x) => x >= r.i0 && x <= r.i1);
    return { b, id: b.id, name: b.name, kind: b.kind, kwh: k, ch: pct(k, c), perDay: k / (r.i1 - r.i0 + 1), perM2: k / b.areaM2, perAct: safeDiv(k, act), perT: safeDiv(k, t), perH: safeDiv(k, hrs), act, hv: hv * 100, li: li * 100, est, cost: k * P.cost.perKwh };
  });
  const rows = all.filter((x) => list.includes(x.b));
  const trend = bucketSeries(r, gran, Object.fromEntries(list.map((b) => [b.id, (x: number) => BLD[b.id].kwh[x]])));
  const perPallet = bucketSeries(r, gran, Object.fromEntries(list.filter((b) => b.kind !== 'Admin').map((b) => [b.id, (x: number) => BLD[b.id].kwh[x]])));
  const palletRatio = buckets(r, gran).map((bk) => Object.fromEntries([['label', bk.label], ...list.filter((b) => b.kind !== 'Admin').map((b) => [b.id, safeDiv(sum(BLD[b.id].kwh, bk.i0, bk.i1), sum(BLD[b.id].act, bk.i0, bk.i1))])]));
  void perPallet;
  const adm = all.find((x) => x.id === 'ADM')!;
  const tot = rows.reduce((s, x) => s + x.kwh, 0);
  return (
    <div>
      <PageHeader title={hubs ? 'Distribution Hubs' : 'Buildings & Warehouses'} sub={`${hubs ? '3 distribution hubs' : 'Administration building and central warehouse'} · individually monitored, compared and ranked · ${cmpLabel}`} />
      <div className="grid g4">
        {rows.map((x) => (
          <Kpi key={x.id} label={x.name} value={kwh(x.kwh)[0]} unit={kwh(x.kwh)[1]} change={x.ch} cmpLabel={cmpLabel} spark={spark(r, (d) => BLD[x.id].kwh[d])} tag={x.est ? <Badge kind="est">EST</Badge> : undefined} />
        ))}
        <Kpi label={hubs ? 'All hubs' : 'Buildings total'} value={kwh(tot)[0]} unit={kwh(tot)[1]} change={null} cmpLabel={`${n1((tot / P.cons) * 100)}% of plant`} status="info" />
      </div>
      {!hubs && (
        <div className="grid g6 mt">
          <Kpi label="Admin kWh/day" value={n0(adm.perDay)} change={null} cmpLabel="average" status="info" />
          <Kpi label="Admin kWh/month (30 d)" value={n0(adm.perDay * 30)} change={null} cmpLabel="run-rate" status="info" />
          <Kpi label="Admin kWh/m²" value={n2(adm.perM2)} change={null} cmpLabel={`${BUILDINGS[0].areaM2} m²`} status="info" />
          <Kpi label="Energy per employee" value={n1(adm.perAct)} unit="kWh/person-day" change={null} cmpLabel="employees present" status="info" />
          <Kpi label="HVAC energy share" value={n0(adm.hv)} unit="%" change={null} cmpLabel="admin building" status="info" />
          <Kpi label="Lighting energy share" value={n0(adm.li)} unit="%" change={null} cmpLabel="admin building" status="info" />
        </div>
      )}
      <div className="grid g2 mt">
        <Panel title="Energy trend"><Combo data={trend} series={list.map((b, i) => ({ key: b.id, name: b.name, color: PALETTE[i + (hubs ? 2 : 0)], stack: 'b' }))} height={240} /></Panel>
        <Panel title="kWh per pallet handled" sub="Logistics benchmark"><Combo data={palletRatio} series={list.filter((b) => b.kind !== 'Admin').map((b, i) => ({ key: b.id, name: b.name, type: 'line' as const, color: PALETTE[i + (hubs ? 2 : 1)] }))} height={240} digits={2} /></Panel>
      </div>
      <Panel title="Comparison & ranking" className="mt" sub="All buildings and hubs ranked on comparable KPIs">
        <DataTable exportName="buildings" initialSort={{ key: 'perAct', dir: -1 }} cols={[
          { key: 'name', label: 'Site', render: (x: any) => <>{x.name} {x.est && <Badge kind="est">EST</Badge>}</> }, { key: 'kind', label: 'Type' }, { key: 'kwh', label: 'kWh', num: true, bar: true }, { key: 'ch', label: cmpLabel, num: true, render: (x: any) => pctS(x.ch) },
          { key: 'perDay', label: 'kWh/day', num: true }, { key: 'perM2', label: 'kWh/m²', num: true, render: (x: any) => n2(x.perM2) }, { key: 'perAct', label: 'kWh/pallet (or /employee)', num: true, render: (x: any) => n2(x.perAct) }, { key: 'perT', label: 'kWh/tonne', num: true, render: (x: any) => (x.perT ? n2(x.perT) : '—') },
          { key: 'perH', label: 'kWh/op. hour', num: true }, { key: 'act', label: 'Activity', num: true }, { key: 'cost', label: 'Cost ₹', num: true },
        ]} rows={all} />
      </Panel>
      <div className="grid g3 mt">
        {list.map((b) => {
          const k = sum(BLD[b.id].kwh, r.i0, r.i1);
          return <Panel key={b.id} title={b.name} sub="Asset energy split (sub-metered / allocated)"><HBar data={b.assets.map((a) => ({ name: a.name, value: k * a.share }))} unit="kWh" labelWidth={150} /></Panel>;
        })}
      </div>
    </div>
  );
}
export { Scatter2, rsS, DOW };
