// Energy Meter Master + simulated meter registers + reading reconciliation.
import { BUILDINGS, LINES, UTILITIES, TRANSFORMERS, DGS } from './assets';
import { BLD, DAYS, DATES, DG_UNIT, EXPORT, HUB2_METER_OFFLINE, INCOMING, LINE, machineDay, SOLAR_INV, SOLAR_KWH, TR_KWH, UTIL, UTIL_KWH, PROD_KWH, UTIL_TOTAL } from './sim';
import { hash01 } from './rng';

export type MeterType = 'Three Phase Electrical' | 'Single Phase Electrical' | 'Thermal / Steam / Fuel' | 'Water' | 'Compressed Air' | 'Chilled Water / Cooling';
export type DQ = 'Good' | 'Intermittent' | 'Offline' | 'Stale' | 'Reset detected' | 'Duplicate readings';

export interface Meter {
  id: string;
  name: string;
  type: MeterType;
  level: 'Grid' | 'Generation' | 'Transformer' | 'Main Panel' | 'Department' | 'Utility / Line' | 'Machine' | 'Process';
  make: string;
  model: string;
  serial: string;
  protocol: string;
  address: string;
  parent: string | null;
  department: string;
  location: string;
  asset: string;
  unit: string;
  frequency: string;
  dq: DQ;
  lastComm: string;
  calibration: string;
  /** daily consumption source */
  daily: (d: number) => number;
}

const MAKES: [string, string, string][] = [
  ['Schneider Electric', 'PowerLogic PM5560', 'Modbus TCP'],
  ['Secure Meters', 'Elite 446', 'Modbus RTU'],
  ['Siemens', 'SENTRON PAC3200', 'Modbus TCP'],
  ['L&T', 'WL4405', 'Modbus RTU'],
  ['ABB', 'M4M 30', 'Modbus TCP'],
];
let seq = 0;
const meters: Meter[] = [];
const now = '2026-11-02 07:40';
function add(m: Omit<Meter, 'make' | 'model' | 'serial' | 'protocol' | 'address' | 'frequency' | 'dq' | 'lastComm' | 'calibration'> & Partial<Meter>) {
  seq++;
  const mk = MAKES[seq % MAKES.length];
  const ip = mk[2] === 'Modbus TCP' ? `10.20.${Math.floor(seq / 50) + 1}.${(seq % 200) + 20}` : `COM${(seq % 4) + 1} / ID ${(seq % 240) + 1}`;
  const cal = new Date(Date.UTC(2025, (seq * 5) % 12, ((seq * 7) % 27) + 1)).toISOString().slice(0, 10);
  meters.push({
    make: mk[0], model: mk[1], serial: `SN${(240000 + seq * 137).toString()}`, protocol: mk[2], address: ip, frequency: m.level === 'Machine' ? '1 min' : m.level === 'Grid' ? '1 s' : '1 min',
    dq: 'Good', lastComm: now, calibration: cal, ...m,
  } as Meter);
}

// Grid & generation
add({ id: 'EM-GRID-01', name: 'Utility grid incomer 22 kV', type: 'Three Phase Electrical', level: 'Grid', parent: null, department: 'Electrical', location: 'HT yard', asset: 'Grid Feeder 01', unit: 'kWh', daily: (d) => INCOMING[d] - SOLAR_KWH[d] - DG_UNIT.reduce((s, a) => s + a[d], 0) + EXPORT[d], make: 'Schneider Electric', model: 'ION9000', protocol: 'Modbus TCP / IEC 61850' });
add({ id: 'EM-MAIN-01', name: 'Main incomer (grid + solar + DG)', type: 'Three Phase Electrical', level: 'Grid', parent: null, department: 'Electrical', location: 'HT room', asset: 'Main incomer', unit: 'kWh', daily: (d) => INCOMING[d] });
add({ id: 'EM-SOL-GEN', name: 'Solar generation meter', type: 'Three Phase Electrical', level: 'Generation', parent: null, department: 'Electrical', location: 'Roof / solar LT panel', asset: 'Solar plant 1.2 MWp', unit: 'kWh', daily: (d) => SOLAR_KWH[d] });
add({ id: 'EM-SOL-EXP', name: 'Solar export meter', type: 'Three Phase Electrical', level: 'Generation', parent: null, department: 'Electrical', location: 'HT yard', asset: 'Export', unit: 'kWh', daily: (d) => EXPORT[d] });
SOLAR_INV.forEach((a, i) => add({ id: `EM-INV-0${i + 1}`, name: `Solar inverter 0${i + 1}`, type: 'Three Phase Electrical', level: 'Generation', parent: 'EM-SOL-GEN', department: 'Electrical', location: 'Solar inverter room', asset: `Inverter 0${i + 1}`, unit: 'kWh', daily: (d) => a[d] }));
DGS.forEach((g, i) => add({ id: `EM-${g.id}`, name: `${g.name} generation meter`, type: 'Three Phase Electrical', level: 'Generation', parent: null, department: 'Electrical', location: 'DG house', asset: g.name, unit: 'kWh', daily: (d) => DG_UNIT[i][d] }));
TRANSFORMERS.forEach((t) => add({ id: `EM-${t.id}`, name: `${t.id} LV side`, type: 'Three Phase Electrical', level: 'Transformer', parent: 'EM-MAIN-01', department: 'Electrical', location: 'Transformer yard', asset: t.name, unit: 'kWh', daily: (d) => TR_KWH[t.id][d] }));

// Department / panel meters
const panels: Record<string, { name: string; tr: string; dept: string; series: (d: number) => number }> = {};
LINES.forEach((L, l) => {
  panels[L.panel] = panels[L.panel] || { name: '', tr: L.transformer, dept: 'Production', series: () => 0 };
});
const panelName: Record<string, string> = {
  'PNL-PRD-BEV': 'Beverage production panel', 'PNL-PRD-BAK': 'Bakery production panel', 'PNL-PRD-PC': 'Personal care production panel', 'PNL-PRD-SPC': 'Spices production panel', 'PNL-PRD-HH': 'Household production panel',
  'PNL-UTL-AIR': 'Compressor house MCC', 'PNL-UTL-CHL': 'Chiller plant MCC', 'PNL-UTL-BLR': 'Boiler house MCC', 'PNL-UTL-HVAC': 'HVAC MCC', 'PNL-UTL-WTR': 'Water & ETP MCC', 'PNL-UTL-OTH': 'Utility misc. panel',
  'PNL-BLD-ADM': 'Admin building panel', 'PNL-BLD-WH': 'Warehouse panel', 'PNL-HUB-01': 'Hub 01 main panel', 'PNL-HUB-02': 'Hub 02 main panel', 'PNL-HUB-03': 'Hub 03 main panel',
};
const panelMeterId = (p: string) => `EM-${p.replace('PNL-', 'P-')}`;
const panelSeries: Record<string, ((d: number) => number)[]> = {};
const panelTr: Record<string, string> = {};
const panelDept: Record<string, string> = {};
LINES.forEach((L, l) => { (panelSeries[L.panel] ||= []).push((d) => LINE[l].kwh[d]); panelTr[L.panel] = L.transformer; panelDept[L.panel] = 'Production'; });
UTILITIES.forEach((u) => { (panelSeries[u.panel] ||= []).push((d) => UTIL_KWH[u.key][d]); panelTr[u.panel] = u.transformer; panelDept[u.panel] = 'Utilities'; });
BUILDINGS.forEach((b) => { (panelSeries[b.panel] ||= []).push((d) => BLD[b.id].kwh[d]); panelTr[b.panel] = b.transformer; panelDept[b.panel] = b.kind === 'Admin' ? 'Administration' : b.name; });
// main LT panels
TRANSFORMERS.forEach((t) => add({ id: `EM-LT-${t.id.slice(3)}`, name: `Main LT panel ${t.id.slice(3)} incomer`, type: 'Three Phase Electrical', level: 'Main Panel', parent: `EM-${t.id}`, department: 'Electrical', location: 'LT room', asset: `Main LT Panel ${t.id.slice(3)}`, unit: 'kWh', daily: (d) => TR_KWH[t.id][d] * 0.994 }));
Object.keys(panelSeries).forEach((p) => {
  const fs = panelSeries[p];
  add({ id: panelMeterId(p), name: panelName[p] || p, type: 'Three Phase Electrical', level: 'Department', parent: `EM-LT-${panelTr[p].slice(3)}`, department: panelDept[p], location: p, asset: p, unit: 'kWh', daily: (d) => fs.reduce((s, f) => s + f(d), 0) });
});
// line meters
LINES.forEach((L, l) => add({ id: `EM-${L.id}`, name: `${L.short} line incomer`, type: 'Three Phase Electrical', level: 'Utility / Line', parent: panelMeterId(L.panel), department: 'Production', location: L.name, asset: L.name, unit: 'kWh', daily: (d) => LINE[l].kwh[d] }));
// machine meters (major machines >= 15 kW)
LINES.forEach((L, l) => L.machines.forEach((M, m) => {
  if (M.ratedKw < 15) return;
  add({ id: `EM-${M.id}`, name: `${L.id} ${M.name}`, type: 'Three Phase Electrical', level: 'Machine', parent: `EM-${L.id}`, department: 'Production', location: L.name, asset: M.name, unit: 'kWh', daily: (d) => machineDay(l, m, d).kwh });
}));
// utility asset meters
UTILITIES.forEach((u) => u.assets.forEach((a, i) => {
  if (a.ratedKw < 11) return;
  add({ id: `EM-${a.id}`, name: a.name, type: 'Three Phase Electrical', level: 'Utility / Line', parent: panelMeterId(u.panel), department: 'Utilities', location: u.name, asset: a.name, unit: 'kWh', daily: (d) => UTIL[u.key].kwh[i][d] });
}));
// building sub-meters (single phase examples)
['Server room UPS', 'Pantry', 'Elevator 01'].forEach((n, i) => add({ id: `EM-ADM-SP${i + 1}`, name: `Admin – ${n}`, type: 'Single Phase Electrical', level: 'Machine', parent: panelMeterId('PNL-BLD-ADM'), department: 'Administration', location: 'Admin building', asset: n, unit: 'kWh', daily: (d) => BLD.ADM.kwh[d] * [0.14, 0.04, 0.02][i] }));

// process meters (non-electrical)
const pm = (id: string, name: string, type: MeterType, unit: string, dept: string, loc: string, f: (d: number) => number, parent: string | null = null) =>
  add({ id, name, type, level: 'Process', parent, department: dept, location: loc, asset: name, unit, daily: f, make: 'Endress+Hauser', model: type === 'Water' ? 'Promag W 400' : type === 'Compressed Air' ? 't-mass F 300' : type === 'Chilled Water / Cooling' ? 'Flowtemp BTU' : 'Prowirl F 200', protocol: 'Modbus RTU' });
[0, 1, 2, 3].forEach((c) => pm(`FM-AIR-0${c + 1}`, `${UTILITIES[0].assets[c].name} air flow`, 'Compressed Air', 'Nm³', 'Utilities', 'Compressor house', (d) => UTIL.AIR.out[c][d]));
pm('FM-AIR-HDR', 'Air distribution header flow', 'Compressed Air', 'Nm³', 'Utilities', 'Compressor house', (d) => UTIL.AIR.sysOut[d]);
[0, 1, 2].forEach((c) => pm(`BTU-CHL-0${c + 1}`, `Chiller 0${c + 1} BTU meter`, 'Chilled Water / Cooling', 'TR-h', 'Utilities', 'Chiller plant', (d) => UTIL.CHL.out[c][d]));
[0, 1].forEach((c) => pm(`SF-BLR-0${c + 1}`, `Boiler 0${c + 1} steam flow`, 'Thermal / Steam / Fuel', 't', 'Utilities', 'Boiler house', (d) => UTIL.BLR.out[c][d]));
[0, 1].forEach((c) => pm(`GF-BLR-0${c + 1}`, `Boiler 0${c + 1} natural gas`, 'Thermal / Steam / Fuel', 'SCM', 'Utilities', 'Boiler house', (d) => UTIL.BLR.extra[c ? 'fuel2' : 'fuel1'][d]));
pm('SF-HDR', 'Main steam header flow', 'Thermal / Steam / Fuel', 't', 'Utilities', 'Boiler house', (d) => UTIL.BLR.sysOut[d] * 0.965);
DGS.forEach((g, i) => pm(`FF-${g.id}`, `${g.name} diesel flow`, 'Thermal / Steam / Fuel', 'L', 'Electrical', 'DG house', (d) => DG_UNIT[i][d] / 3.35));
pm('WM-RAW', 'Raw water inlet', 'Water', 'm³', 'Utilities', 'WTP', (d) => UTIL.WTP.sysOut[d] * 1.08);
pm('WM-TRT', 'Treated water outlet', 'Water', 'm³', 'Utilities', 'WTP', (d) => UTIL.WTP.sysOut[d]);
pm('WM-RO-F', 'RO feed', 'Water', 'm³', 'Utilities', 'WTP', (d) => UTIL.WTP.extra.roFeed[d]);
pm('WM-RO-P', 'RO permeate', 'Water', 'm³', 'Utilities', 'WTP', (d) => UTIL.WTP.extra.roPerm[d]);
pm('WM-ETP-IN', 'ETP inlet', 'Water', 'm³', 'Utilities', 'ETP', (d) => UTIL.ETP.sysOut[d]);
pm('WM-ETP-OUT', 'ETP treated outlet', 'Water', 'm³', 'Utilities', 'ETP', (d) => UTIL.ETP.sysOut[d] * 0.93);

// data-quality scenarios
const setDq = (id: string, dq: DQ, lastComm?: string) => {
  const m = meters.find((x) => x.id === id);
  if (m) { m.dq = dq; if (lastComm) m.lastComm = lastComm; }
};
setDq('EM-P-HUB-02', 'Offline', '2026-10-28 23:59');
setDq('EM-L12', 'Intermittent', '2026-11-02 07:31');
setDq('EM-L07-M04', 'Reset detected');
setDq('EM-CHL-02', 'Stale', '2026-11-02 04:12');
setDq('WM-RO-P', 'Duplicate readings');
setDq('EM-HVAC-09', 'Intermittent', '2026-11-02 07:20');

export const METERS = meters;
export const meterById = (id: string) => meters.find((m) => m.id === id);
export const ELECTRIC_METERS = meters.filter((m) => m.type === 'Three Phase Electrical' || m.type === 'Single Phase Electrical');

/** Data completeness (0-100) per meter-day */
export function completeness(m: Meter, d: number) {
  if (m.id === 'EM-P-HUB-02' && HUB2_METER_OFFLINE.has(d)) return 0;
  if (m.id === 'EM-L12' && d > DAYS - 31) return 85 + 13 * hash01(d, 12);
  if (m.dq === 'Intermittent' && d > DAYS - 15) return 90 + 9 * hash01(d, m.id.length);
  if (m.id === 'EM-CHL-02' && d === DAYS - 1) return 72;
  return hash01(d, m.id.charCodeAt(4), m.id.length) < 0.01 ? 93 + 6 * hash01(d) : 99.6 + 0.4 * hash01(d, 3);
}

// ---------------- cumulative register simulation ----------------
export interface RegisterRow { date: string; reading: number | null; status: 'OK' | 'Missing' | 'Reset' | 'Rollover' | 'Negative' | 'Estimated'; consumption: number | null; method: string }

/** Simulates the cumulative kWh register a meter would report at 00:00 each day,
 *  then derives period consumption by differences (never by summing registers). */
export function registerRows(m: Meter, d0: number, d1: number): RegisterRow[] {
  const ROLL = 99999999;
  let reg = 1000000 + (hash01(m.id.length, m.id.charCodeAt(3)) * 4000000);
  for (let d = 0; d < d0; d++) reg += m.daily(d);
  const raw: { date: string; reading: number | null; kind: string }[] = [];
  for (let d = d0; d <= d1; d++) {
    reg += m.daily(d);
    let reading: number | null = reg;
    let kind = 'OK';
    if (m.id === 'EM-L07-M04' && DATES[d] === '2026-09-12') { reg = m.daily(d) * 0.3; reading = reg; kind = 'Reset'; }
    if (completeness(m, d) === 0) { reading = null; kind = 'Missing'; }
    if (m.id === 'EM-L12' && hash01(d, 99) < 0.08 && d > DAYS - 31) { reading = null; kind = 'Missing'; }
    if (reading != null && reading > ROLL) { reg -= ROLL; reading = reg; kind = 'Rollover'; }
    raw.push({ date: DATES[d], reading, kind });
  }
  return periodConsumptionRows(raw, ROLL);
}

/** Robust difference-based consumption: handles missing values, resets, rollovers and negative steps */
export function periodConsumptionRows(raw: { date: string; reading: number | null; kind?: string }[], rollover = 99999999): RegisterRow[] {
  const out: RegisterRow[] = [];
  let lastGood: number | null = null;
  let gap = 0;
  const recent: number[] = [];
  raw.forEach((r) => {
    if (r.reading == null) {
      gap++;
      const est = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
      out.push({ date: r.date, reading: null, status: 'Missing', consumption: est, method: est != null ? 'Estimated from 7-day average (flagged)' : 'No estimate possible' });
      return;
    }
    if (lastGood == null) {
      out.push({ date: r.date, reading: r.reading, status: 'OK', consumption: null, method: 'First reading – no previous value' });
      lastGood = r.reading;
      return;
    }
    let diff = r.reading - lastGood;
    let status: RegisterRow['status'] = 'OK';
    let method = gap ? `Δ over ${gap + 1} days, spread across gap` : 'Δ reading';
    if (diff < 0) {
      if (lastGood > rollover * 0.9) { diff = rollover - lastGood + r.reading; status = 'Rollover'; method = 'Rollover corrected: (max − prev) + current'; }
      else if (r.reading < lastGood * 0.2) { diff = r.reading; status = 'Reset'; method = 'Meter reset: consumption = reading since reset'; }
      else { diff = 0; status = 'Negative'; method = 'Negative step rejected (set to 0, flagged)'; }
    }
    if (gap) {
      // spread the delta across the missing days, replace estimates
      const per = diff / (gap + 1);
      for (let k = out.length - gap; k < out.length; k++) { out[k].consumption = per; out[k].status = 'Estimated'; out[k].method = 'Back-filled from next valid Δ (estimated)'; }
      diff = per;
    }
    out.push({ date: r.date, reading: r.reading, status, consumption: diff, method });
    recent.push(diff);
    if (recent.length > 7) recent.shift();
    lastGood = r.reading;
    gap = 0;
  });
  return out;
}

// ---------------- reconciliation ----------------
export interface RecRow { parent: string; parentName: string; level: string; parentKwh: number; childKwh: number; children: number; diffPct: number; note: string }
export function reconcile(i0: number, i1: number): RecRow[] {
  const rows: RecRow[] = [];
  const s = (m: Meter) => { let v = 0; for (let d = i0; d <= i1; d++) v += m.daily(d); return v; };
  const elec = ELECTRIC_METERS.filter((m) => m.level !== 'Generation');
  elec.forEach((p) => {
    const kids = elec.filter((c) => c.parent === p.id);
    if (!kids.length) return;
    const pk = s(p), ck = kids.reduce((a, c) => a + s(c), 0);
    const diff = ((pk - ck) / pk) * 100;
    let note = 'Within tolerance';
    const partial = p.level === 'Utility / Line' || (p.level === 'Department' && p.department !== 'Production');
    if (partial && diff > 0) note = `Partial sub-metering: child meters cover ${((ck / pk) * 100).toFixed(0)}% – remainder is unmetered small loads, not loss`;
    else if (diff < -0.5) note = 'Children exceed parent – check CT ratio / overlapping meters';
    else if (diff > 2) note = 'Gap above 2% – investigate losses / unmetered loads';
    rows.push({ parent: p.id, parentName: p.name, level: p.level, parentKwh: pk, childKwh: ck, children: kids.length, diffPct: diff, note });
  });
  return rows;
}

export { PROD_KWH, UTIL_TOTAL };
