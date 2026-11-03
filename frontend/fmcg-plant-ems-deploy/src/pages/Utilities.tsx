import { go } from '../store';
import { useMemo } from 'react';
import { UTILITIES, UtilityKey, PLANT } from '../data/assets';
import { baselineRange, pct, Range, safeDiv, sum, utilSec, utilSecBaseline } from '../data/engine';
import { DATES, NONPROD_FRAC, TEMP, UTIL, UTIL_KWH, UTIL_TOTAL, CONS, PROD_TEQ } from '../data/sim';
import { C, kwh, kwhS, n0, n1, n2, PALETTE, pctS, rs, rsS } from '../format';
import { Combo, DataTable, Donut, HBar, Kpi, PageHeader, Panel, Scatter2 } from '../components/ui';
import { bucketSeries, spark, useView } from './common';

function sysKpi(key: UtilityKey, r: Range) {
  const U = UTIL[key];
  const k = sum(UTIL_KWH[key], r.i0, r.i1);
  const out = sum(U.sysOut, r.i0, r.i1);
  const days = r.i1 - r.i0 + 1;
  const rated = UTILITIES.find((u) => u.key === key)!.assets.reduce((s, a) => s + a.ratedKw, 0);
  let runH = 0; U.runH.forEach((a) => (runH += sum(a, r.i0, r.i1) / U.runH.length));
  const np = U.nonProdKwh.reduce((s, a) => s + sum(a, r.i0, r.i1), 0);
  return { k, out, sec: safeDiv(k, out), runH, loadFactor: safeDiv(k / (days * 24), rated) * 100, avail: 99.2 - (key === 'CHL' ? 0.6 : 0), np };
}

export function UtilitiesOverview() {
  const { r, cmp, cfg, P, gran, cmpLabel } = useView();
  const rows = UTILITIES.map((u, i) => {
    const a = sysKpi(u.key, r), c = cmp ? sysKpi(u.key, cmp) : null;
    const base = utilSecBaseline(u.key, cfg);
    return { key: u.key, name: u.name, kwh: a.k, ch: pct(a.k, c?.k), out: a.out, outUnit: u.outputUnit, sec: a.sec, secUnit: u.secUnit, base, vsB: pct(a.sec, base), vsT: pct(a.sec, base * (1 - cfg.targets.utilSecPct / 100)), cost: a.k * P.cost.perKwh, lf: a.loadFactor, np: a.np, color: PALETTE[i] };
  });
  const tot = rows.reduce((s, x) => s + x.kwh, 0);
  const totC = cmp ? sum(UTIL_TOTAL, cmp.i0, cmp.i1) : null;
  const trend = useMemo(() => bucketSeries(r, gran, Object.fromEntries(UTILITIES.map((u) => [u.key, (d: number) => UTIL_KWH[u.key][d]]))), [r, gran]);
  const npTot = rows.reduce((s, x) => s + x.np, 0);
  return (
    <div>
      <PageHeader title="Utilities Energy Management" sub={`8 utility systems · ${cmpLabel}`} />
      <div className="grid g5">
        <Kpi label="Utility energy consumption" value={kwh(tot)[0]} unit={kwh(tot)[1]} change={pct(tot, totC)} cmpLabel={cmpLabel} spark={spark(r, (d) => UTIL_TOTAL[d])} />
        <Kpi label="Utility energy cost" value={rs(tot * P.cost.perKwh)[0]} unit={rs(tot * P.cost.perKwh)[1]} change={pct(tot, totC)} cmpLabel={cmpLabel} />
        <Kpi label="Share of plant energy" value={n1((tot / P.cons) * 100)} unit="%" change={null} cmpLabel="of accounted kWh" status="info" />
        <Kpi label="Utility kWh per t-eq produced" value={n1(safeDiv(tot, sum(PROD_TEQ, r.i0, r.i1)))} unit="kWh/t-eq" change={cmp ? pct(safeDiv(tot, sum(PROD_TEQ, r.i0, r.i1)), safeDiv(totC!, sum(PROD_TEQ, cmp.i0, cmp.i1))) : null} cmpLabel={cmpLabel} />
        <Kpi label="Utility energy outside production" value={kwh(npTot)[0]} unit={kwh(npTot)[1]} change={null} cmpLabel={`${n1((npTot / tot) * 100)}% (estimated allocation)`} status="warn" />
      </div>
      <div className="grid g3 mt">
        <Panel title="Utility energy trend by system" className="span2"><Combo data={trend} series={UTILITIES.map((u, i) => ({ key: u.key, name: u.name, stack: 'u', color: PALETTE[i] }))} height={260} /></Panel>
        <Panel title="Utility energy split"><Donut height={160} data={rows.map((x) => ({ name: x.name, value: x.kwh, color: x.color }))} /></Panel>
      </div>
      <Panel title="Utility systems" sub="Output, efficiency, specific energy vs baseline and target. Click a row to open the system dashboard." className="mt">
        <DataTable exportName="utilities" onRow={(x: any) => go(`#/utilities/${x.key}`)} cols={[
          { key: 'name', label: 'System' }, { key: 'kwh', label: 'kWh', num: true, bar: true }, { key: 'ch', label: cmpLabel, num: true, render: (x: any) => <span className={(x.ch ?? 0) > 0 ? 'up-bad' : 'up-good'}>{pctS(x.ch)}</span> },
          { key: 'out', label: 'Output', num: true, render: (x: any) => `${n0(x.out)} ${x.outUnit}` }, { key: 'sec', label: 'Specific energy', num: true, render: (x: any) => `${x.key === 'AIR' ? n0(x.sec * 1000) + ' Wh/Nm³' : x.key === 'HVAC' ? n2(x.sec * 1000) + ' Wh/m²·h' : n2(x.sec) + ' ' + x.secUnit}` },
          { key: 'vsB', label: 'vs baseline', num: true, render: (x: any) => <span className={(x.vsB ?? 0) > 2 ? 'up-bad' : 'up-good'}>{pctS(x.vsB)}</span> }, { key: 'vsT', label: 'vs target', num: true, render: (x: any) => <span className={(x.vsT ?? 0) > 0 ? 'up-bad' : 'up-good'}>{pctS(x.vsT)}</span> },
          { key: 'lf', label: 'Load factor %', num: true, render: (x: any) => n1(x.lf) }, { key: 'cost', label: 'Cost ₹', num: true }, { key: 'np', label: 'Non-prod. kWh (est.)', num: true },
        ]} rows={rows} />
      </Panel>
      <div className="grid g4 mt">
        {UTILITIES.map((u, i) => (
          <a key={u.key} href={`#/utilities/${u.key}`} className="kpi click" style={{ color: 'var(--text)', textDecoration: 'none' }}>
            <div className="kpi-l"><span>{u.name}</span><span>{u.assets.length} assets</span></div>
            <div className="kpi-v">{kwh(rows[i].kwh)[0]}<small>{kwh(rows[i].kwh)[1]}</small></div>
            <div className="kpi-c"><span className={(rows[i].vsB ?? 0) > 2 ? 'up-bad' : 'up-good'}>{pctS(rows[i].vsB)} vs baseline</span><span>open →</span></div>
          </a>
        ))}
      </div>
    </div>
  );
}

export function UtilityDashboard({ k }: { k: UtilityKey }) {
  const { r, cmp, cfg, P, gran, cmpLabel } = useView();
  const u = UTILITIES.find((x) => x.key === k) ?? UTILITIES[0];
  const U = UTIL[u.key];
  const a = sysKpi(u.key, r), c = cmp ? sysKpi(u.key, cmp) : null;
  const base = utilSecBaseline(u.key, cfg);
  const tgt = base * (1 - cfg.targets.utilSecPct / 100);
  const b = baselineRange(cfg);
  const assets = u.assets.map((as, i) => {
    const kk = sum(U.kwh[i], r.i0, r.i1), out = sum(U.out[i], r.i0, r.i1);
    const bk = sum(U.kwh[i], b.i0, b.i1), bo = sum(U.out[i], b.i0, b.i1);
    return { id: as.id, name: as.name, rated: as.ratedKw, kwh: kk, out, sec: safeDiv(kk, out), base: safeDiv(bk, bo), runH: sum(U.runH[i], r.i0, r.i1), loadH: sum(U.loadH[i], r.i0, r.i1), unload: sum(U.unloadKwh[i], r.i0, r.i1), np: sum(U.nonProdKwh[i], r.i0, r.i1), ch: cmp ? pct(kk, sum(U.kwh[i], cmp.i0, cmp.i1)) : null };
  });
  const trend = useMemo(() => bucketSeries(r, gran, { kwh: (d) => UTIL_KWH[u.key][d], out: (d) => U.sysOut[d] }).map((x: any) => ({ ...x, sec: safeDiv(x.kwh, x.out) * (u.key === 'AIR' ? 1000 : u.key === 'HVAC' ? 1000 : 1), base: base * (u.key === 'AIR' || u.key === 'HVAC' ? 1000 : 1), tgt: tgt * (u.key === 'AIR' || u.key === 'HVAC' ? 1000 : 1) })), [r, gran, u.key, base]);
  const secScale = u.key === 'AIR' || u.key === 'HVAC' ? 1000 : 1;
  const secUnitShown = u.key === 'AIR' ? 'Wh/Nm³' : u.key === 'HVAC' ? 'Wh/m²·h' : u.secUnit;
  const avg = (arr: Float32Array) => sum(arr, r.i0, r.i1) / (r.i1 - r.i0 + 1);
  const specific: JSX.Element[] = [];
  let extraChart: JSX.Element | null = null;
  if (u.key === 'AIR') {
    const gen = sum(U.sysOut, r.i0, r.i1), dem = sum(U.extra.demand, r.i0, r.i1);
    const loadH = assets.slice(0, 3).reduce((s, x) => s + x.loadH, 0), runH = assets.slice(0, 3).reduce((s, x) => s + x.runH, 0);
    specific.push(
      <Kpi key="1" label="Air generation" value={n0(gen / 1000)} unit="k Nm³" change={c ? pct(gen, sum(U.sysOut, cmp!.i0, cmp!.i1)) : null} cmpLabel={cmpLabel} />,
      <Kpi key="2" label="Air demand (process)" value={n0(dem / 1000)} unit="k Nm³" change={null} cmpLabel="generation − estimated leakage" status="info" tag={<span className="badge b-est">EST</span>} />,
      <Kpi key="3" label="kWh/Nm³" value={n0(a.sec * 1000)} unit="Wh/Nm³" change={pct(a.sec, c?.sec)} cmpLabel={cmpLabel} />,
      <Kpi key="4" label="Header pressure" value={n2(avg(U.extra.pressure))} unit="bar(g)" change={null} cmpLabel="average" status="info" />,
      <Kpi key="5" label="Load hours (C01–C03)" value={n0(loadH)} unit="h" change={null} cmpLabel={`of ${n0(runH)} running h`} status="info" />,
      <Kpi key="6" label="Unloading hours" value={n0(runH - loadH)} unit="h" change={null} cmpLabel={`${kwhS(assets.slice(0, 3).reduce((s, x) => s + x.unload, 0))} unload energy`} status="warn" />,
      <Kpi key="7" label="Leakage estimate" value={n1(avg(U.extra.leakPct))} unit="% of generation" change={null} cmpLabel="from non-production baseload" status="warn" tag={<span className="badge b-est">EST</span>} />,
      <Kpi key="8" label="Compressor efficiency (C02 vs C01)" value={pctS(pct(assets[1].sec, assets[0].sec))} change={pct(assets[1].sec, assets[0].sec)} cmpLabel="specific power gap" />,
    );
    extraChart = <Panel title="Air generation vs demand"><Combo data={bucketSeries(r, gran, { gen: (d) => U.sysOut[d], dem: (d) => U.extra.demand[d] })} series={[{ key: 'gen', name: 'Generated Nm³', color: C.blue }, { key: 'dem', name: 'Process demand Nm³ (est.)', type: 'line', color: C.green }]} height={220} /></Panel>;
  } else if (u.key === 'CHL') {
    const trh = sum(U.sysOut, r.i0, r.i1);
    const chk = assets.slice(0, 3).reduce((s, x) => s + x.kwh, 0);
    const kwtr = chk / trh;
    specific.push(
      <Kpi key="1" label="Cooling output" value={n0(trh)} unit="TR-h" change={c ? pct(trh, sum(U.sysOut, cmp!.i0, cmp!.i1)) : null} lowerIsBetter={false} cmpLabel={cmpLabel} />,
      <Kpi key="2" label="Average cooling load" value={n0(avg(U.extra.tr))} unit="TR" change={null} cmpLabel="period avg" status="info" />,
      <Kpi key="3" label="Chiller kW/TR" value={n2(kwtr)} unit="kW/TR" change={null} cmpLabel="compressors only" status={kwtr > 0.75 ? 'warn' : 'good'} />,
      <Kpi key="4" label="COP" value={n2(3.517 / kwtr)} change={null} cmpLabel="3.517 / (kW/TR)" status="info" />,
      <Kpi key="5" label="CHW supply / return" value={`${n1(avg(U.extra.chws))} / ${n1(avg(U.extra.chwr))}`} unit="°C" change={null} cmpLabel="average" status="info" />,
      <Kpi key="6" label="Chilled water flow" value={n0(avg(U.extra.flow))} unit="m³/h" change={null} cmpLabel="average" status="info" />,
      <Kpi key="7" label="Chiller load factor" value={n1((avg(U.extra.tr) / 1050) * 100)} unit="%" change={null} cmpLabel="of 3 × 350 TR" status="info" />,
      <Kpi key="8" label="Idle consumption (est.)" value={kwh(a.np)[0]} unit={kwh(a.np)[1]} change={null} cmpLabel="during non-production" status="warn" />,
    );
    extraChart = <Panel title="kW/TR by chiller"><Combo data={bucketSeries(r, gran, { c1: (d) => safeDiv(U.kwh[0][d], U.out[0][d]), c2: (d) => safeDiv(U.kwh[1][d], U.out[1][d]), c3: (d) => safeDiv(U.kwh[2][d], U.out[2][d]) }, 'avg')} series={[{ key: 'c1', name: 'Chiller 01', type: 'line' }, { key: 'c2', name: 'Chiller 02', type: 'line', color: C.red }, { key: 'c3', name: 'Chiller 03', type: 'line', color: C.teal }]} height={220} digits={2} /></Panel>;
  } else if (u.key === 'BLR') {
    const steam = sum(U.sysOut, r.i0, r.i1);
    const fuel = sum(U.extra.fuel1, r.i0, r.i1) + sum(U.extra.fuel2, r.i0, r.i1);
    const fc = fuel * cfg.tariff.gasPrice;
    // direct method: steam enthalpy gain (≈2.42 GJ/t with 85 °C feed water) / fuel GCV (38 MJ/SCM)
    const eff = ((steam * 2.424) / (fuel * 0.038)) * 100;
    specific.push(
      <Kpi key="1" label="Steam generation" value={n0(steam)} unit="t" change={c ? pct(steam, sum(U.sysOut, cmp!.i0, cmp!.i1)) : null} lowerIsBetter={false} cmpLabel={cmpLabel} />,
      <Kpi key="2" label="Fuel consumption" value={n0(fuel)} unit="SCM gas" change={c ? pct(fuel, sum(U.extra.fuel1, cmp!.i0, cmp!.i1) + sum(U.extra.fuel2, cmp!.i0, cmp!.i1)) : null} cmpLabel={cmpLabel} />,
      <Kpi key="3" label="Fuel per tonne steam" value={n1(fuel / steam)} unit="SCM/t" change={null} cmpLabel={`B01 ${n1(sum(U.extra.fuel1, r.i0, r.i1) / sum(U.out[0], r.i0, r.i1))} · B02 ${n1(sum(U.extra.fuel2, r.i0, r.i1) / sum(U.out[1], r.i0, r.i1))}`} status="info" />,
      <Kpi key="4" label="Boiler efficiency (est.)" value={n1(Math.min(92, eff))} unit="%" change={null} cmpLabel="from fuel-to-steam ratio" status="info" tag={<span className="badge b-est">EST</span>} />,
      <Kpi key="5" label="Steam pressure" value={n1(avg(U.extra.pressure))} unit="bar(g)" change={null} cmpLabel="header avg" status="info" />,
      <Kpi key="6" label="Energy cost per tonne steam" value={'₹' + n0((fc + a.k * P.cost.perKwh) / steam)} unit="/t" change={null} cmpLabel="fuel + electricity" status="info" />,
      <Kpi key="7" label="Electricity per tonne steam" value={n1(a.sec)} unit="kWh/t" change={pct(a.sec, c?.sec)} cmpLabel={cmpLabel} />,
      <Kpi key="8" label="Condensate recovery" value={n1(avg(U.extra.condensate))} unit="%" change={null} cmpLabel="target ≥ 65%" status={avg(U.extra.condensate) < 62 ? 'warn' : 'good'} />,
    );
    extraChart = <Panel title="Fuel per tonne steam & condensate recovery"><Combo data={bucketSeries(r, gran, { f: (d) => (U.extra.fuel1[d] + U.extra.fuel2[d]) / U.sysOut[d], cr: (d) => U.extra.condensate[d] }, 'avg')} series={[{ key: 'f', name: 'SCM/t', type: 'line', color: C.amber }, { key: 'cr', name: 'Condensate %', type: 'line', color: C.cyan, axis: 'right' }]} height={220} digits={1} /></Panel>;
  } else if (u.key === 'HVAC') {
    specific.push(
      <Kpi key="1" label="HVAC kWh/m²" value={n2(a.k / PLANT.hvacAreaM2)} unit="kWh/m²" change={pct(a.k, c?.k)} cmpLabel={cmpLabel} />,
      <Kpi key="2" label="Avg indoor temperature" value={n1(avg(U.extra.temp))} unit="°C" change={null} cmpLabel="production areas" status="info" />,
      <Kpi key="3" label="Avg relative humidity" value={n0(avg(U.extra.rh))} unit="%" change={null} cmpLabel="production areas" status="info" />,
      <Kpi key="4" label="HVAC energy per operating hour" value={n0(a.k / (a.runH || 1))} unit="kWh/h" change={null} cmpLabel="system average" status="info" />,
      <Kpi key="5" label="Avg ambient temperature" value={n1(avg(TEMP))} unit="°C" change={null} cmpLabel="weather (simulated)" status="info" />,
      <Kpi key="6" label="Energy outside production" value={kwh(a.np)[0]} unit={kwh(a.np)[1]} change={null} cmpLabel="estimated" status="warn" />,
    );
    const pts = []; for (let d = r.i0; d <= r.i1; d++) pts.push({ x: TEMP[d], y: UTIL_KWH.HVAC[d], label: DATES[d] });
    extraChart = <Panel title="HVAC energy vs ambient temperature"><Scatter2 data={pts} xName="ambient °C" yName="HVAC kWh" height={200} /></Panel>;
  } else if (u.key === 'WTP' || u.key === 'ETP') {
    const vol = sum(U.sysOut, r.i0, r.i1);
    specific.push(
      <Kpi key="1" label={u.key === 'WTP' ? 'Water produced' : 'Effluent treated'} value={n0(vol)} unit="m³" change={c ? pct(vol, sum(U.sysOut, cmp!.i0, cmp!.i1)) : null} cmpLabel={cmpLabel} />,
      <Kpi key="2" label="kWh/m³" value={n2(a.sec)} unit="kWh/m³" change={pct(a.sec, c?.sec)} cmpLabel={cmpLabel} />,
      ...(u.key === 'WTP' ? [
        <Kpi key="3" label="RO feed / permeate" value={`${n0(sum(U.extra.roFeed, r.i0, r.i1))} / ${n0(sum(U.extra.roPerm, r.i0, r.i1))}`} unit="m³" change={null} cmpLabel={`recovery ${n0((sum(U.extra.roPerm, r.i0, r.i1) / sum(U.extra.roFeed, r.i0, r.i1)) * 100)}%`} status="info" />,
        <Kpi key="4" label="kWh/m³ RO water" value={n2(assets[2].kwh / sum(U.extra.roPerm, r.i0, r.i1))} unit="kWh/m³" change={null} cmpLabel="RO system only" status="info" />,
        <Kpi key="5" label="RO reject" value={n0(sum(U.extra.roFeed, r.i0, r.i1) - sum(U.extra.roPerm, r.i0, r.i1))} unit="m³" change={null} cmpLabel="to ETP" status="info" />,
      ] : [<Kpi key="3" label="Aeration blower hours" value={n0(assets[2].runH)} unit="h" change={null} cmpLabel="period" status="info" />, <Kpi key="4" label="Treated water reuse" value={n0(vol * 0.93)} unit="m³" change={null} cmpLabel="93% recovery" status="info" />]),
      <Kpi key="6" label="Pump efficiency (est.)" value={u.key === 'WTP' ? '64' : '58'} unit="%" change={null} cmpLabel="wire-to-water" status="info" tag={<span className="badge b-est">EST</span>} />,
    );
    extraChart = <Panel title={`${u.outputName} vs energy`}><Combo data={bucketSeries(r, gran, { v: (d) => U.sysOut[d], kwh: (d) => UTIL_KWH[u.key][d] })} series={[{ key: 'kwh', name: 'kWh', color: C.blue }, { key: 'v', name: 'm³', type: 'line', color: C.cyan, axis: 'right' }]} height={220} /></Panel>;
  } else if (u.key === 'CT') {
    specific.push(
      <Kpi key="1" label="Heat rejected" value={n0(sum(U.sysOut, r.i0, r.i1))} unit="TR-h" change={null} cmpLabel="period" status="info" />,
      <Kpi key="2" label="Approach temperature" value={n1(avg(U.extra.approach))} unit="°C" change={null} cmpLabel="design 4.0 °C" status={avg(U.extra.approach) > 4.5 ? 'warn' : 'good'} />,
      <Kpi key="3" label="CW inlet temperature" value={n1(avg(U.extra.inlet))} unit="°C" change={null} cmpLabel="average" status="info" />,
      <Kpi key="4" label="Fan energy" value={kwhS(assets.slice(0, 3).reduce((s, x) => s + x.kwh, 0))} change={null} cmpLabel="3 fans" status="info" />,
      <Kpi key="5" label="Pump energy" value={kwhS(assets.slice(3).reduce((s, x) => s + x.kwh, 0))} change={null} cmpLabel="3 pumps" status="info" />,
    );
  }
  return (
    <div>
      <PageHeader title={`Utilities: ${u.name}`} sub={`${u.assets.length} assets · ${u.panel} · ${u.transformer} · ${cmpLabel}`} crumbs={[{ label: 'Plant', href: '#/plant' }, { label: 'Utilities', href: '#/utilities' }, { label: u.name }]}
        actions={<div className="row">{UTILITIES.map((x) => <a key={x.key} href={`#/utilities/${x.key}`} className={'chip' + (x.key === u.key ? ' on' : '')} style={{ textDecoration: 'none' }}>{x.name}</a>)}</div>} />
      <div className="grid g5">
        <Kpi label="Energy consumption" value={kwh(a.k)[0]} unit={kwh(a.k)[1]} change={pct(a.k, c?.k)} cmpLabel={cmpLabel} spark={spark(r, (d) => UTIL_KWH[u.key][d])} />
        <Kpi label="Energy cost" value={rs(a.k * P.cost.perKwh)[0]} unit={rs(a.k * P.cost.perKwh)[1]} change={pct(a.k, c?.k)} cmpLabel={cmpLabel} />
        <Kpi label={`Output (${u.outputUnit})`} value={n0(a.out)} unit={u.outputUnit} change={pct(a.out, c?.out)} lowerIsBetter={false} cmpLabel={cmpLabel} />
        <Kpi label="Specific energy" value={n2(a.sec * secScale)} unit={secUnitShown} change={pct(a.sec, c?.sec)} cmpLabel={cmpLabel} />
        <Kpi label="vs baseline / target" value={pctS(pct(a.sec, base))} change={pct(a.sec, base)} cmpLabel={`target ${pctS(pct(a.sec, tgt))}`} />
        <Kpi label="Operating hours (avg asset)" value={n0(a.runH)} unit="h" change={null} cmpLabel="period" status="info" />
        <Kpi label="Load factor" value={n1(a.loadFactor)} unit="%" change={c ? pct(a.loadFactor, c.loadFactor) : null} lowerIsBetter={false} cmpLabel={cmpLabel} />
        <Kpi label="Availability" value={n1(a.avail)} unit="%" change={null} cmpLabel="simulated" status="good" />
        <Kpi label="Share of utilities" value={n1((a.k / sum(UTIL_TOTAL, r.i0, r.i1)) * 100)} unit="%" change={null} cmpLabel={`${n1((a.k / sum(CONS, r.i0, r.i1)) * 100)}% of plant`} status="info" />
        <Kpi label="Non-production energy" value={kwh(a.np)[0]} unit={kwh(a.np)[1]} change={null} cmpLabel="estimated allocation" status="warn" />
      </div>
      {specific.length > 0 && <div className="grid g4 mt">{specific}</div>}
      <div className="grid g2 mt">
        <Panel title="Energy & specific energy trend"><Combo data={trend} series={[{ key: 'kwh', name: 'kWh', color: C.blue }, { key: 'sec', name: secUnitShown, type: 'line', color: C.cyan, axis: 'right' }, { key: 'base', name: 'Baseline', type: 'line', color: C.amber, dashed: true, axis: 'right' }, { key: 'tgt', name: 'Target', type: 'line', color: C.green, dashed: true, axis: 'right' }]} height={240} digits={2} /></Panel>
        {extraChart ?? <Panel title="Output vs energy"><Combo data={trend} series={[{ key: 'kwh', name: 'kWh', color: C.blue }, { key: 'out', name: u.outputUnit, type: 'line', color: C.green, axis: 'right' }]} height={240} /></Panel>}
      </div>
      <div className="grid g3 mt">
        <Panel title="Asset energy" ><HBar data={assets.filter((x) => x.kwh > 0).map((x) => ({ name: x.name, value: x.kwh })).sort((a2, b2) => b2.value - a2.value)} unit="kWh" labelWidth={190} /></Panel>
        <Panel title="Asset performance" className="span2">
          <DataTable exportName={`${u.key}-assets`} cols={[
            { key: 'name', label: 'Asset' }, { key: 'rated', label: 'Rated kW', num: true }, { key: 'kwh', label: 'kWh', num: true, bar: true }, { key: 'ch', label: cmpLabel, num: true, render: (x: any) => pctS(x.ch) },
            { key: 'out', label: `Output ${u.outputUnit}`, num: true, render: (x: any) => (x.out ? n0(x.out) : '—') }, { key: 'sec', label: secUnitShown, num: true, render: (x: any) => (x.out ? n2(x.sec * secScale) : '—') }, { key: 'base', label: 'Baseline', num: true, render: (x: any) => (x.out ? n2(x.base * secScale) : '—') },
            { key: 'runH', label: 'Run h', num: true }, ...(u.key === 'AIR' ? [{ key: 'loadH', label: 'Load h', num: true }, { key: 'unload', label: 'Unload kWh', num: true }] : []), { key: 'np', label: 'Non-prod kWh', num: true },
          ]} rows={assets} />
        </Panel>
      </div>
      <div className="note mt">Non-production and idle energy for utilities is an estimated allocation (system kWh × share of hours with no scheduled production), not a direct measurement. Average non-production share in period: {n1(sum(NONPROD_FRAC, r.i0, r.i1) / (r.i1 - r.i0 + 1) * 100)}%. {rsS(0) && ''}</div>
    </div>
  );
}
