// Asset master for the simulated plant: FMCG Manufacturing Plant – Maharashtra.
// Everything here is illustrative sample configuration, not data from a real site.

export type Category = 'Beverage' | 'Cookies & Biscuits' | 'Soap & Personal Care' | 'Spices & Powders' | 'Household Products';

export interface MachineDef {
  id: string;
  name: string;
  ratedKw: number;
  /** share of line running energy */
  wRun: number;
  /** share of line non-running energy (idle / standby) */
  wIdle: number;
  active: boolean;
}

export interface SkuDef { code: string; name: string; secMul: number; rateMul: number }

export interface LineDef {
  id: string; // L01
  idx: number;
  name: string;
  short: string;
  category: Category;
  unit: string; // display unit of production
  secUnit: string; // e.g. kWh/1,000 bottles
  /** units per running hour */
  cap: number;
  /** kWh per unit at nominal running */
  sec: number;
  /** tonne-equivalent per unit, used to normalise mixed products */
  teq: number;
  /** standby fraction of running kW when not scheduled */
  standby: number;
  transformer: string;
  panel: string;
  skus: SkuDef[];
  machines: MachineDef[];
}

const mk = (lid: string, list: [string, number, number?][]): MachineDef[] => {
  const totalRun = list.reduce((s, m) => s + m[1], 0);
  return list.map(([name, kw, idleW], i) => ({
    id: `${lid}-M${String(i + 1).padStart(2, '0')}`,
    name,
    ratedKw: kw,
    wRun: kw / totalRun,
    wIdle: idleW ?? kw / totalRun,
    active: true,
  }));
};

function normIdle(ms: MachineDef[]) {
  const s = ms.reduce((a, m) => a + m.wIdle, 0);
  ms.forEach((m) => (m.wIdle = m.wIdle / s));
  return ms;
}

export const LINES: LineDef[] = [
  {
    id: 'L01', idx: 0, name: 'Line 01 – Carbonated Beverage Bottling', short: 'L01 CSD Bottling', category: 'Beverage',
    unit: '1,000 bottles', secUnit: 'kWh/1,000 bottles', cap: 36, sec: 6.0, teq: 0.55, standby: 0.06, transformer: 'TR-01', panel: 'PNL-PRD-BEV',
    skus: [
      { code: 'CSD-COLA-300', name: 'Cola 300 ml glass', secMul: 1.0, rateMul: 1.0 },
      { code: 'CSD-ORNG-300', name: 'Orange 300 ml glass', secMul: 1.03, rateMul: 0.97 },
      { code: 'CSD-LIME-250', name: 'Lime soda 250 ml', secMul: 0.95, rateMul: 1.06 },
    ],
    machines: mk('L01', [['Bottle unscrambler', 11], ['Bottle rinser', 15], ['Bottle washer', 75, 0.25], ['Filling machine', 45], ['Crowner / capper', 7.5], ['Labeling machine', 11], ['Date coder', 2.2], ['Inspection system', 4], ['Shrink wrapping machine', 55, 0.2], ['Case packer', 15], ['Palletizer', 18.5], ['Conveyor system', 30]]),
  },
  {
    id: 'L02', idx: 1, name: 'Line 02 – Juice Manufacturing & Packaging', short: 'L02 Juice', category: 'Beverage',
    unit: 'kL', secUnit: 'kWh/kL', cap: 12, sec: 22, teq: 1.05, standby: 0.07, transformer: 'TR-01', panel: 'PNL-PRD-BEV',
    skus: [
      { code: 'JCE-MNG-1L', name: 'Mango nectar 1 L', secMul: 1.04, rateMul: 0.95 },
      { code: 'JCE-MIX-200', name: 'Mixed fruit 200 ml', secMul: 1.0, rateMul: 1.0 },
      { code: 'JCE-GUA-1L', name: 'Guava 1 L', secMul: 1.02, rateMul: 0.98 },
    ],
    machines: mk('L02', [['Raw material preparation', 22], ['Fruit pulper / extractor', 37], ['Juice blending tanks', 15], ['Mixing system', 22], ['Pasteurizer', 90, 0.3], ['Homogenizer', 55], ['Filling machine', 30], ['Capper', 5.5], ['Labeling machine', 7.5], ['Packaging machine', 22], ['Conveyor system', 18.5]]),
  },
  {
    id: 'L03', idx: 2, name: 'Line 03 – PET Beverage Bottling', short: 'L03 PET Bottling', category: 'Beverage',
    unit: '1,000 bottles', secUnit: 'kWh/1,000 bottles', cap: 24, sec: 9.0, teq: 0.6, standby: 0.08, transformer: 'TR-01', panel: 'PNL-PRD-BEV',
    skus: [
      { code: 'PET-COLA-600', name: 'Cola 600 ml PET', secMul: 1.0, rateMul: 1.0 },
      { code: 'PET-WTR-1L', name: 'Packaged water 1 L', secMul: 0.92, rateMul: 1.04 },
      { code: 'PET-COLA-2L', name: 'Cola 2 L PET', secMul: 1.12, rateMul: 0.82 },
    ],
    machines: mk('L03', [['PET bottle blowing machine', 120, 0.35], ['Air compressor interface (blowing)', 18.5], ['Bottle conveying system', 22], ['Filling machine', 37], ['Capping machine', 7.5], ['Labeling machine', 11], ['Inspection machine', 4], ['Case packer', 15], ['Palletizer', 18.5]]),
  },
  {
    id: 'L04', idx: 3, name: 'Line 04 – Cookies Manufacturing', short: 'L04 Cookies', category: 'Cookies & Biscuits',
    unit: 'tonne', secUnit: 'kWh/tonne', cap: 2.2, sec: 150, teq: 1, standby: 0.16, transformer: 'TR-01', panel: 'PNL-PRD-BAK',
    skus: [
      { code: 'CK-CHOC-75', name: 'Choco chip cookie 75 g', secMul: 1.05, rateMul: 0.96 },
      { code: 'CK-BUTR-100', name: 'Butter cookie 100 g', secMul: 1.0, rateMul: 1.0 },
      { code: 'CK-OAT-150', name: 'Oat cookie 150 g', secMul: 0.97, rateMul: 1.03 },
    ],
    machines: mk('L04', [['Ingredient dosing', 7.5], ['Flour sifter', 5.5], ['Dough mixer', 55], ['Dough feeder', 7.5], ['Sheeter', 15], ['Rotary cutter / depositor', 11], ['Tunnel oven', 180, 0.45], ['Cooling conveyor', 15], ['Inspection conveyor', 4], ['Flow wrapping machine', 18.5], ['Carton packing machine', 11]]),
  },
  {
    id: 'L05', idx: 4, name: 'Line 05 – Biscuit Manufacturing', short: 'L05 Biscuits', category: 'Cookies & Biscuits',
    unit: 'tonne', secUnit: 'kWh/tonne', cap: 2.8, sec: 120, teq: 1, standby: 0.07, transformer: 'TR-01', panel: 'PNL-PRD-BAK',
    skus: [
      { code: 'BS-GLU-60', name: 'Glucose biscuit 60 g', secMul: 0.96, rateMul: 1.04 },
      { code: 'BS-CRM-120', name: 'Cream sandwich 120 g', secMul: 1.08, rateMul: 0.92 },
      { code: 'BS-MRI-200', name: 'Marie biscuit 200 g', secMul: 1.0, rateMul: 1.0 },
    ],
    machines: mk('L05', [['Flour handling system', 18.5], ['Ingredient mixing system', 15], ['Dough mixer', 55], ['Dough forming machine', 22], ['Rotary cutter', 11], ['Baking oven', 200, 0.4], ['Cooling conveyor', 15], ['Cream sandwiching machine', 22], ['Packaging machine', 18.5], ['Case packing machine', 11]]),
  },
  {
    id: 'L06', idx: 5, name: 'Line 06 – Cookie Packaging', short: 'L06 Cookie Pack', category: 'Cookies & Biscuits',
    unit: '1,000 packs', secUnit: 'kWh/1,000 packs', cap: 18, sec: 3.2, teq: 0.1, standby: 0.06, transformer: 'TR-01', panel: 'PNL-PRD-BAK',
    skus: [
      { code: 'CKP-75', name: 'Cookie pack 75 g', secMul: 1.0, rateMul: 1.0 },
      { code: 'CKP-FAM-300', name: 'Family pack 300 g', secMul: 1.15, rateMul: 0.8 },
    ],
    machines: mk('L06', [['Product feeding system', 5.5], ['Multihead weigher', 4], ['Horizontal flow wrapper', 15], ['Carton erector', 5.5], ['Case packer', 11], ['Conveyor system', 11], ['Palletizer', 15]]),
  },
  {
    id: 'L07', idx: 6, name: 'Line 07 – Soap Manufacturing', short: 'L07 Soap', category: 'Soap & Personal Care',
    unit: 'tonne', secUnit: 'kWh/tonne', cap: 1.6, sec: 105, teq: 1, standby: 0.14, transformer: 'TR-02', panel: 'PNL-PRD-PC',
    skus: [
      { code: 'SP-NEEM-75', name: 'Neem soap 75 g', secMul: 1.0, rateMul: 1.0 },
      { code: 'SP-SNDL-125', name: 'Sandal soap 125 g', secMul: 1.06, rateMul: 0.95 },
      { code: 'SP-LMN-100', name: 'Lemon soap 100 g', secMul: 0.98, rateMul: 1.02 },
    ],
    machines: mk('L07', [['Soap mixer', 30], ['Soap amalgamator', 22], ['Refining mill', 55], ['Plodder', 75, 0.35], ['Soap cutter', 5.5], ['Soap stamping machine', 11], ['Soap wrapping machine', 7.5], ['Carton packing machine', 5.5], ['Conveyor system', 7.5]]),
  },
  {
    id: 'L08', idx: 7, name: 'Line 08 – Liquid Soap / Shampoo', short: 'L08 Shampoo', category: 'Soap & Personal Care',
    unit: 'kL', secUnit: 'kWh/kL', cap: 5, sec: 40, teq: 1.02, standby: 0.06, transformer: 'TR-02', panel: 'PNL-PRD-PC',
    skus: [
      { code: 'SH-HRB-180', name: 'Herbal shampoo 180 ml', secMul: 1.0, rateMul: 1.0 },
      { code: 'LS-HND-250', name: 'Handwash 250 ml', secMul: 0.94, rateMul: 1.05 },
      { code: 'SH-AD-650', name: 'Anti-dandruff 650 ml', secMul: 1.07, rateMul: 0.93 },
    ],
    machines: mk('L08', [['Mixing vessels', 30], ['Agitators', 22], ['Process pumps', 18.5], ['Homogenizer', 37], ['Transfer pumps', 11], ['Filling machine', 15], ['Capping machine', 5.5], ['Labeling machine', 5.5], ['Shrink wrapping machine', 30], ['Carton packing machine', 5.5]]),
  },
  {
    id: 'L09', idx: 8, name: 'Line 09 – Soap Packaging', short: 'L09 Soap Pack', category: 'Soap & Personal Care',
    unit: '1,000 packs', secUnit: 'kWh/1,000 packs', cap: 30, sec: 1.5, teq: 0.1, standby: 0.06, transformer: 'TR-02', panel: 'PNL-PRD-PC',
    skus: [
      { code: 'SPP-4PK', name: 'Soap 4-pack', secMul: 1.1, rateMul: 0.85 },
      { code: 'SPP-SGL', name: 'Single wrapped bar', secMul: 1.0, rateMul: 1.0 },
    ],
    machines: mk('L09', [['Soap feeding system', 5.5], ['Wrapping machine', 11], ['Carton packing machine', 5.5], ['Case packer', 7.5], ['Conveyor', 7.5], ['Palletizer', 11]]),
  },
  {
    id: 'L10', idx: 9, name: 'Line 10 – Spice Processing', short: 'L10 Spice Proc', category: 'Spices & Powders',
    unit: 'tonne', secUnit: 'kWh/tonne', cap: 1.8, sec: 110, teq: 1, standby: 0.07, transformer: 'TR-02', panel: 'PNL-PRD-SPC',
    skus: [
      { code: 'SPC-CHL', name: 'Chilli powder', secMul: 1.08, rateMul: 0.94 },
      { code: 'SPC-TUR', name: 'Turmeric powder', secMul: 1.0, rateMul: 1.0 },
      { code: 'SPC-COR', name: 'Coriander powder', secMul: 0.93, rateMul: 1.05 },
    ],
    machines: mk('L10', [['Raw spice cleaning machine', 11], ['Destoner', 7.5], ['Grinder / pulverizer', 110, 0.3], ['Roaster', 45], ['Cooling system', 15], ['Sifter', 7.5], ['Blending machine', 22], ['Dust extraction system', 30, 0.25], ['Powder transfer system', 11]]),
  },
  {
    id: 'L11', idx: 10, name: 'Line 11 – Spice Packaging', short: 'L11 Spice Pack', category: 'Spices & Powders',
    unit: '1,000 packs', secUnit: 'kWh/1,000 packs', cap: 25, sec: 2.2, teq: 0.1, standby: 0.06, transformer: 'TR-02', panel: 'PNL-PRD-SPC',
    skus: [
      { code: 'SPP-100', name: 'Spice pouch 100 g', secMul: 1.0, rateMul: 1.0 },
      { code: 'SPP-500', name: 'Spice pouch 500 g', secMul: 1.12, rateMul: 0.78 },
    ],
    machines: mk('L11', [['Powder feeding system', 5.5], ['Auger filling machine', 7.5], ['Pouch packing machine', 11], ['Weighing system', 2.2], ['Sealing machine', 7.5], ['Metal detector', 1.5], ['Carton packing machine', 5.5], ['Conveyor system', 7.5]]),
  },
  {
    id: 'L12', idx: 11, name: 'Line 12 – Masala Blending & Packaging', short: 'L12 Masala', category: 'Spices & Powders',
    unit: 'tonne', secUnit: 'kWh/tonne', cap: 1.2, sec: 85, teq: 1, standby: 0.07, transformer: 'TR-02', panel: 'PNL-PRD-SPC',
    skus: [
      { code: 'MSL-GRM', name: 'Garam masala', secMul: 1.04, rateMul: 0.97 },
      { code: 'MSL-CHN', name: 'Chana masala', secMul: 1.0, rateMul: 1.0 },
      { code: 'MSL-PAV', name: 'Pav bhaji masala', secMul: 0.98, rateMul: 1.01 },
    ],
    machines: mk('L12', [['Ingredient dosing', 5.5], ['Blending machine', 22], ['Ribbon blender', 30], ['Powder transfer system', 11], ['Dust extraction', 22, 0.25], ['Auger filler', 7.5], ['Packaging machine', 11], ['Case packer', 7.5]]),
  },
  {
    id: 'L13', idx: 12, name: 'Line 13 – Detergent Powder Manufacturing', short: 'L13 Det Powder', category: 'Household Products',
    unit: 'tonne', secUnit: 'kWh/tonne', cap: 4, sec: 45, teq: 1, standby: 0.15, transformer: 'TR-02', panel: 'PNL-PRD-HH',
    skus: [
      { code: 'DP-1KG', name: 'Detergent powder 1 kg', secMul: 1.0, rateMul: 1.0 },
      { code: 'DP-500', name: 'Detergent powder 500 g', secMul: 1.03, rateMul: 0.96 },
      { code: 'DP-5KG', name: 'Detergent powder 5 kg', secMul: 0.95, rateMul: 1.05 },
    ],
    machines: mk('L13', [['Powder mixing system', 45], ['Pulverizer', 75, 0.3], ['Ribbon blender', 37], ['Powder conveying', 18.5], ['Sifter', 7.5], ['Filling machine', 11], ['Bagging machine', 11], ['Sealing machine', 5.5], ['Carton packing system', 7.5]]),
  },
  {
    id: 'L14', idx: 13, name: 'Line 14 – Liquid Detergent Manufacturing', short: 'L14 Liq Detergent', category: 'Household Products',
    unit: 'kL', secUnit: 'kWh/kL', cap: 6, sec: 18, teq: 1.05, standby: 0.06, transformer: 'TR-02', panel: 'PNL-PRD-HH',
    skus: [
      { code: 'LD-1L', name: 'Liquid detergent 1 L', secMul: 1.0, rateMul: 1.0 },
      { code: 'LD-DSH-500', name: 'Dishwash liquid 500 ml', secMul: 0.96, rateMul: 1.03 },
    ],
    machines: mk('L14', [['Mixing tank', 22], ['Agitators', 18.5], ['Process pumps', 15], ['Homogenizer', 30], ['Transfer pumps', 7.5], ['Filling machine', 11], ['Capping machine', 4], ['Labeling machine', 4], ['Packaging machine', 11]]),
  },
  {
    id: 'L15', idx: 14, name: 'Line 15 – Multi-Product FMCG Packaging', short: 'L15 Multi Pack', category: 'Household Products',
    unit: '1,000 packs', secUnit: 'kWh/1,000 packs', cap: 20, sec: 2.8, teq: 0.12, standby: 0.06, transformer: 'TR-02', panel: 'PNL-PRD-HH',
    skus: [
      { code: 'MP-POUCH', name: 'Refill pouch', secMul: 0.95, rateMul: 1.05 },
      { code: 'MP-BTL', name: 'Bottle pack', secMul: 1.08, rateMul: 0.92 },
      { code: 'MP-COMBO', name: 'Combo carton', secMul: 1.04, rateMul: 0.96 },
    ],
    machines: mk('L15', [['Product feeding system', 5.5], ['Weighing system', 2.2], ['Filling machine', 11], ['Pouch packing machine', 11], ['Bottle packing machine', 11], ['Carton packing machine', 7.5], ['Labeling system', 4], ['Inspection system', 3], ['Conveyor', 11], ['Palletizer', 15]]),
  },
];
LINES.forEach((l) => normIdle(l.machines));

export const CATEGORIES: Category[] = ['Beverage', 'Cookies & Biscuits', 'Soap & Personal Care', 'Spices & Powders', 'Household Products'];

// ---------------- Utilities ----------------
export type UtilityKey = 'AIR' | 'CHL' | 'CT' | 'BLR' | 'HVAC' | 'WTP' | 'ETP' | 'OTH';

export interface UtilityAssetDef {
  id: string;
  name: string;
  ratedKw: number;
  /** share of system electricity */
  share: number;
  /** relative efficiency multiplier (1 = nominal; >1 = worse) */
  eff: number;
  active: boolean;
}

export interface UtilitySystemDef {
  key: UtilityKey;
  name: string;
  outputName: string;
  outputUnit: string;
  secUnit: string;
  transformer: string;
  panel: string;
  assets: UtilityAssetDef[];
}

const ua = (prefix: string, list: [string, number, number?][]): UtilityAssetDef[] => {
  const tot = list.reduce((s, a) => s + a[1], 0);
  return list.map(([name, kw, eff], i) => ({ id: `${prefix}-${String(i + 1).padStart(2, '0')}`, name, ratedKw: kw, share: kw / tot, eff: eff ?? 1, active: true }));
};

export const UTILITIES: UtilitySystemDef[] = [
  {
    key: 'AIR', name: 'Compressed Air', outputName: 'Air generated', outputUnit: 'Nm³', secUnit: 'kWh/Nm³', transformer: 'TR-03', panel: 'PNL-UTL-AIR',
    assets: ua('AIR', [['Screw air compressor 01', 160], ['Screw air compressor 02', 160], ['Screw air compressor 03 (VFD)', 132], ['High-pressure compressor (PET)', 90], ['Air dryer', 15], ['Air receiver', 0.5], ['Air distribution header', 0.5], ['Compressor cooling system', 11]]),
  },
  {
    key: 'CHL', name: 'Chiller / Refrigeration', outputName: 'Cooling delivered', outputUnit: 'TR-h', secUnit: 'kW/TR', transformer: 'TR-03', panel: 'PNL-UTL-CHL',
    assets: ua('CHL', [['Chiller 01', 245], ['Chiller 02', 245, 1.2], ['Chiller 03', 245, 1.0], ['Process refrigeration system', 80], ['Refrigeration compressor', 55], ['Condenser', 15], ['Evaporator', 7.5], ['Refrigerant pumps', 11], ['Chilled / cooling water pumps', 75]]),
  },
  {
    key: 'CT', name: 'Cooling Tower', outputName: 'Heat rejected', outputUnit: 'TR-h', secUnit: 'kWh/TR-h', transformer: 'TR-03', panel: 'PNL-UTL-CHL',
    assets: ua('CT', [['Cooling Tower 01 fan', 30], ['Cooling Tower 02 fan', 30], ['Cooling Tower 03 fan', 30], ['Cooling water pump 01', 45], ['Cooling water pump 02', 45], ['Cooling water pump 03', 45]]),
  },
  {
    key: 'BLR', name: 'Boiler / Steam', outputName: 'Steam generated', outputUnit: 'tonne', secUnit: 'kWh/t steam', transformer: 'TR-03', panel: 'PNL-UTL-BLR',
    assets: ua('BLR', [['Boiler 01 (6 TPH) – FD fan & burner', 45], ['Boiler 02 (4 TPH) – FD fan & burner', 30], ['Boiler feed water pump', 22], ['Fuel supply system', 7.5], ['Steam header', 0.5], ['Condensate recovery system', 7.5], ['Steam distribution system', 1]]),
  },
  {
    key: 'HVAC', name: 'HVAC', outputName: 'Conditioned area-hours', outputUnit: 'm²·h', secUnit: 'kWh/m²', transformer: 'TR-04', panel: 'PNL-UTL-HVAC',
    assets: ua('HVAC', [['HVAC AHU 01', 37], ['HVAC AHU 02', 37], ['HVAC AHU 03', 30], ['HVAC AHU 04', 30], ['HVAC AHU 05', 22], ['Fresh air system', 15], ['Exhaust fans', 18.5], ['Ventilation fans', 22], ['Office air-conditioning', 45], ['Production area HVAC', 90]]),
  },
  {
    key: 'WTP', name: 'Water Treatment', outputName: 'Water treated', outputUnit: 'm³', secUnit: 'kWh/m³', transformer: 'TR-03', panel: 'PNL-UTL-WTR',
    assets: ua('WTP', [['Raw water pumps', 30], ['Water treatment plant', 15], ['RO system', 45], ['DM plant', 11], ['Softener', 5.5], ['Process water pumps', 22], ['Potable water pumps', 7.5], ['Water storage tanks (level ctrl)', 1]]),
  },
  {
    key: 'ETP', name: 'Effluent Treatment / STP', outputName: 'Effluent treated', outputUnit: 'm³', secUnit: 'kWh/m³', transformer: 'TR-03', panel: 'PNL-UTL-WTR',
    assets: ua('ETP', [['ETP process', 15], ['STP process', 7.5], ['Aeration blower', 55], ['Effluent pumps', 15], ['Sludge pumps', 7.5], ['Agitators', 11], ['Filter press', 7.5], ['Treated water pumps', 7.5]]),
  },
  {
    key: 'OTH', name: 'Other Utilities', outputName: 'Operating hours', outputUnit: 'h', secUnit: 'kWh/h', transformer: 'TR-04', panel: 'PNL-UTL-OTH',
    assets: ua('OTH', [['Dust extraction systems', 45], ['Industrial blowers', 30], ['Material handling systems', 22], ['Utility pumps', 18.5], ['Fire water pumps (standby)', 2], ['Lighting systems', 40], ['Nitrogen generation system', 18.5], ['Vacuum systems', 15], ['Refrigerated air dryers', 11], ['Battery charging stations', 22], ['Electric forklifts', 1]]),
  },
];

// ---------------- Buildings & logistics ----------------
export interface BuildingDef {
  id: string;
  name: string;
  kind: 'Admin' | 'Warehouse' | 'Hub';
  areaM2: number;
  activityName: string;
  activityUnit: string;
  baseKwh: number;
  baseActivity: number;
  /** efficiency multiplier (>1 = more energy per activity) */
  eff: number;
  assets: { name: string; share: number; group: 'HVAC' | 'Lighting' | 'Process' | 'IT & Office' | 'Other' }[];
  transformer: string;
  panel: string;
}

const hubAssets: BuildingDef['assets'] = [
  { name: 'Warehouse lighting', share: 0.2, group: 'Lighting' },
  { name: 'Conveyors', share: 0.12, group: 'Process' },
  { name: 'Sorting systems', share: 0.1, group: 'Process' },
  { name: 'Dock equipment', share: 0.06, group: 'Process' },
  { name: 'Forklifts', share: 0.02, group: 'Process' },
  { name: 'Battery charging', share: 0.12, group: 'Other' },
  { name: 'HVAC', share: 0.18, group: 'HVAC' },
  { name: 'Cold storage', share: 0.2, group: 'HVAC' },
];

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'ADM', name: 'Administration Building', kind: 'Admin', areaM2: 4500, activityName: 'Employees present', activityUnit: 'employee', baseKwh: 2100, baseActivity: 220, eff: 1, transformer: 'TR-04', panel: 'PNL-BLD-ADM',
    assets: [
      { name: 'HVAC systems', share: 0.46, group: 'HVAC' }, { name: 'Lighting', share: 0.16, group: 'Lighting' }, { name: 'Elevators', share: 0.04, group: 'Other' },
      { name: 'Server room', share: 0.14, group: 'IT & Office' }, { name: 'IT infrastructure', share: 0.07, group: 'IT & Office' }, { name: 'Office equipment', share: 0.06, group: 'IT & Office' },
      { name: 'Pantry', share: 0.04, group: 'Other' }, { name: 'Water pumps', share: 0.03, group: 'Other' },
    ],
  },
  {
    id: 'WH', name: 'Central Warehouse', kind: 'Warehouse', areaM2: 22000, activityName: 'Pallets handled', activityUnit: 'pallet', baseKwh: 2600, baseActivity: 950, eff: 1, transformer: 'TR-04', panel: 'PNL-BLD-WH',
    assets: [
      { name: 'Lighting', share: 0.24, group: 'Lighting' }, { name: 'Conveyors', share: 0.1, group: 'Process' }, { name: 'Material handling equipment', share: 0.08, group: 'Process' },
      { name: 'Electric forklifts', share: 0.02, group: 'Process' }, { name: 'Battery chargers', share: 0.14, group: 'Other' }, { name: 'HVAC', share: 0.16, group: 'HVAC' },
      { name: 'Cold storage', share: 0.2, group: 'HVAC' }, { name: 'Dock equipment', share: 0.06, group: 'Process' },
    ],
  },
  { id: 'HUB1', name: 'Distribution Hub 01 – Pune', kind: 'Hub', areaM2: 9000, activityName: 'Pallets handled', activityUnit: 'pallet', baseKwh: 1050, baseActivity: 420, eff: 1, assets: hubAssets, transformer: 'TR-04', panel: 'PNL-HUB-01' },
  { id: 'HUB2', name: 'Distribution Hub 02 – Nashik', kind: 'Hub', areaM2: 8000, activityName: 'Pallets handled', activityUnit: 'pallet', baseKwh: 900, baseActivity: 360, eff: 1.03, assets: hubAssets, transformer: 'TR-04', panel: 'PNL-HUB-02' },
  { id: 'HUB3', name: 'Distribution Hub 03 – Aurangabad', kind: 'Hub', areaM2: 7500, activityName: 'Pallets handled', activityUnit: 'pallet', baseKwh: 760, baseActivity: 300, eff: 1.16, assets: hubAssets, transformer: 'TR-04', panel: 'PNL-HUB-03' },
];

// ---------------- Electrical ----------------
export const TRANSFORMERS = [
  { id: 'TR-01', name: 'Transformer 01 – Beverage & Bakery', ratedKva: 2500, primaryKv: 22, secondaryV: 433, feeds: 'Lines 01–06' },
  { id: 'TR-02', name: 'Transformer 02 – Personal Care, Spices & Household', ratedKva: 2500, primaryKv: 22, secondaryV: 433, feeds: 'Lines 07–15' },
  { id: 'TR-03', name: 'Transformer 03 – Utilities', ratedKva: 2500, primaryKv: 22, secondaryV: 433, feeds: 'Air, Chillers, CT, Boiler, Water, ETP' },
  { id: 'TR-04', name: 'Transformer 04 – Buildings, HVAC & Logistics', ratedKva: 1250, primaryKv: 22, secondaryV: 433, feeds: 'HVAC, Other utilities, Admin, Warehouse, Hubs' },
];

export const DGS = [
  { id: 'DG-01', name: 'DG 01', ratedKva: 1250 },
  { id: 'DG-02', name: 'DG 02', ratedKva: 1250 },
  { id: 'DG-03', name: 'DG 03', ratedKva: 1010 },
];

export const SOLAR = { capacityKwp: 1200, inverters: [{ id: 'INV-01', kw: 400 }, { id: 'INV-02', kw: 400 }, { id: 'INV-03', kw: 400 }] };

export const PLANT = {
  org: 'Sample FMCG Enterprise Ltd.',
  name: 'FMCG Manufacturing Plant – Maharashtra',
  contractDemandKva: 5500,
  gridFeeder: '22 kV Utility Grid Incoming Feeder 01',
  hvacAreaM2: 9000,
};

export const SHIFTS = [
  { key: 'A', name: 'Shift A (06–14)' },
  { key: 'B', name: 'Shift B (14–22)' },
  { key: 'C', name: 'Shift C (22–06)' },
] as const;
