import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { CompareMode, Config, DEFAULT_CONFIG, Granularity, Range, compareRange, autoGran } from './data/engine';
import { DAYS } from './data/sim';
import { Alert, DEFAULT_PROJECTS, Project, generateAlerts } from './data/insights';
import { LINES, UTILITIES } from './data/assets';

export interface Persona {
  key: string;
  title: string;
  name: string;
  desc: string;
  landing: string;
  canEdit: boolean;
  canAdmin: boolean;
  focus: string[];
  /** Route keys this persona can open, or 'all'. */
  pages: string[] | 'all';
  /** Department the persona is locked to (top bar filter), if any. */
  dept?: string;
  /** Alert departments shown to this persona. Omit for all alerts. */
  alertDepts?: string[];
}
export const PERSONAS: Persona[] = [
  { key: 'plant-head', title: 'Plant Head', name: 'Rajesh Kulkarni', desc: 'Full access to every dashboard, module and setting in the plant', landing: '#/exec', canEdit: true, canAdmin: true, focus: ['Executive KPIs', 'All modules', 'Approvals'], pages: 'all' },
  { key: 'energy-manager', title: 'Energy Manager', name: 'Priya Deshmukh', desc: 'Monitor, analyse and act on every meter, line and utility', landing: '#/plant', canEdit: true, canAdmin: false, focus: ['Energy balance', 'Analytics', 'Targets & baselines'],
    pages: ['exec', 'plant', 'tree', 'departments', 'production', 'intel', 'benchmark', 'utilities', 'electrical', 'buildings', 'hubs', 'intelligence', 'alerts', 'cost', 'carbon', 'targets', 'projects', 'reports', 'meters', 'assets', 'quality', 'integration'] },
  { key: 'utility-manager', title: 'Utility Manager', name: 'Sandeep Patil', desc: 'Compressed air, chillers, boilers, HVAC and water efficiency', landing: '#/utilities', canEdit: false, canAdmin: false, focus: ['kWh/Nm³', 'kW/TR', 'Steam cost'],
    pages: ['utilities', 'alerts'], dept: 'UTL', alertDepts: ['Utilities'] },
  { key: 'production-manager', title: 'Production Manager', name: 'Anita Joshi', desc: 'Line SEC, idle energy and energy per SKU / shift', landing: '#/production', canEdit: false, canAdmin: false, focus: ['Line dashboards', 'Energy vs production', 'Shifts'],
    pages: ['production', 'intel', 'benchmark', 'intelligence', 'alerts'], dept: 'PRD', alertDepts: ['Production'] },
  { key: 'maintenance', title: 'Maintenance Lead', name: 'Vikram Pawar', desc: 'Alerts, abnormal consumption and asset health', landing: '#/alerts', canEdit: false, canAdmin: false, focus: ['Active alerts', 'Machine drill-down', 'Meters'],
    pages: ['alerts', 'production', 'utilities', 'electrical', 'meters', 'assets', 'quality'] },
  { key: 'sustainability', title: 'Sustainability Head', name: 'Meera Iyer', desc: 'Scope 1 & 2 emissions, renewables and reduction targets', landing: '#/carbon', canEdit: true, canAdmin: false, focus: ['tCO₂e', 'Renewable %', 'Carbon targets'],
    pages: ['carbon', 'targets', 'projects', 'reports'] },
  { key: 'cfo', title: 'CFO', name: 'Arvind Mehta', desc: 'Energy cost, tariffs, budget vs actual and project ROI', landing: '#/cost', canEdit: true, canAdmin: false, focus: ['Cost per unit', 'Budget', 'Payback'],
    pages: ['cost', 'targets', 'projects', 'reports'] },
  { key: 'admin', title: 'System Administrator', name: 'IT – OT Admin', desc: 'Users, roles, meters, integrations and configuration', landing: '#/admin', canEdit: true, canAdmin: true, focus: ['Users & roles', 'Meter master', 'Integrations'],
    pages: ['admin', 'meters', 'assets', 'quality', 'integration'] },
];

/** Maps a route's first segment to the page key used for access checks. */
const PAGE_OF: Record<string, string> = { line: 'production', machine: 'production', analytics: 'intelligence', insights: 'intelligence', losses: 'intelligence' };
export function pageKey(route: string): string {
  const k = route.replace(/^#\//, '').split('/')[0] || 'exec';
  return PAGE_OF[k] ?? k;
}
export function canSee(p: Persona | null, route: string): boolean {
  if (!p) return false;
  return p.pages === 'all' || p.pages.includes(pageKey(route));
}

export interface Filters {
  range: Range;
  compare: CompareMode;
  gran: Granularity | 'auto';
  dept: string;
  shift: number | null;
  category: string;
  sku: string;
}

export interface InsightState { status: 'Open' | 'Acknowledged' | 'Assigned' | 'Resolved'; assignee?: string; note?: string }

interface Store {
  persona: Persona | null;
  setPersona: (p: Persona | null) => void;
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  cmp: Range | null;
  gran: Granularity;
  cfg: Config;
  setCfg: (c: Config) => void;
  insightState: Record<string, InsightState>;
  setInsightState: (id: string, s: InsightState) => void;
  alerts: Alert[];
  updateAlert: (id: string, patch: Partial<Alert>) => void;
  projects: Project[];
  setProjects: (p: Project[]) => void;
  assetVersion: number;
  toggleAsset: (id: string, active: boolean) => void;
  refreshedAt: Date;
  refresh: () => void;
  resetDemo: () => void;
}

const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);

function load<T>(k: string, def: T): T {
  try {
    const v = localStorage.getItem('ems.' + k);
    return v ? (JSON.parse(v) as T) : def;
  } catch {
    return def;
  }
}
function save(k: string, v: unknown) {
  try {
    localStorage.setItem('ems.' + k, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [personaKey, setPersonaKey] = useState<string | null>(() => load('persona', null));
  const persona = PERSONAS.find((p) => p.key === personaKey) ?? null;
  const [filters, setF] = useState<Filters>(() => ({ range: { i0: DAYS - 30, i1: DAYS - 1 }, compare: 'prev', gran: 'auto', dept: PERSONAS.find((p) => p.key === load<string | null>('persona', null))?.dept ?? 'ALL', shift: null, category: 'ALL', sku: 'ALL' }));
  const [cfg, setCfgS] = useState<Config>(() => {
    const c = load<Config>('cfg', DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG, ...c, tariff: { ...DEFAULT_CONFIG.tariff, ...c.tariff }, ef: { ...DEFAULT_CONFIG.ef, ...c.ef }, targets: { ...DEFAULT_CONFIG.targets, ...c.targets }, baseline: { ...DEFAULT_CONFIG.baseline, ...c.baseline } };
  });
  const [insightState, setIS] = useState<Record<string, InsightState>>(() => load('insights', {}));
  const [alertPatch, setAlertPatch] = useState<Record<string, Partial<Alert>>>(() => load('alerts', {}));
  const [projects, setProjectsS] = useState<Project[]>(() => load('projects', DEFAULT_PROJECTS));
  const [assetOff, setAssetOff] = useState<Record<string, boolean>>(() => load('assetsOff', {}));
  const [refreshedAt, setRefreshed] = useState(new Date());

  // apply machine composition configuration
  const assetVersion = useMemo(() => {
    LINES.forEach((L) => L.machines.forEach((m) => (m.active = !assetOff[m.id])));
    UTILITIES.forEach((u) => u.assets.forEach((a) => (a.active = !assetOff[a.id])));
    return Object.keys(assetOff).length + Math.random();
  }, [assetOff]);

  const allAlerts = useMemo(() => generateAlerts(cfg), [cfg.tariff.pfThreshold, cfg.targets.contractDemandKva, cfg.targets.plantMonthlyKwh, cfg.targets.lineSecPct]);
  const baseAlerts = useMemo(() => (persona?.alertDepts ? allAlerts.filter((a) => persona.alertDepts!.includes(a.department)) : allAlerts), [allAlerts, persona?.key]);
  const alerts = useMemo(() => baseAlerts.map((a) => (alertPatch[a.id] ? { ...a, ...alertPatch[a.id] } : a)), [baseAlerts, alertPatch]);

  useEffect(() => save('persona', personaKey), [personaKey]);
  useEffect(() => save('cfg', cfg), [cfg]);
  useEffect(() => save('insights', insightState), [insightState]);
  useEffect(() => save('alerts', alertPatch), [alertPatch]);
  useEffect(() => save('projects', projects), [projects]);
  useEffect(() => save('assetsOff', assetOff), [assetOff]);

  const cmp = useMemo(() => compareRange(filters.range, filters.compare), [filters.range, filters.compare]);
  const gran = filters.gran === 'auto' ? autoGran(filters.range) : filters.gran;

  const value: Store = {
    persona,
    setPersona: (p) => {
      setPersonaKey(p?.key ?? null);
      setF((o) => ({ ...o, dept: p?.dept ?? 'ALL' }));
      if (p) go(p.landing);
    },
    filters,
    setFilters: (f) => setF((o) => ({ ...o, ...f, ...(persona?.dept ? { dept: persona.dept } : {}) })),
    cmp,
    gran,
    cfg,
    setCfg: setCfgS,
    insightState,
    setInsightState: (id, s) => setIS((o) => ({ ...o, [id]: s })),
    alerts,
    updateAlert: (id, patch) => setAlertPatch((o) => ({ ...o, [id]: { ...o[id], ...patch } })),
    projects,
    setProjects: setProjectsS,
    assetVersion,
    toggleAsset: (id, active) => setAssetOff((o) => { const n = { ...o }; if (active) delete n[id]; else n[id] = true; return n; }),
    refreshedAt,
    refresh: () => setRefreshed(new Date()),
    resetDemo: () => {
      setCfgS(DEFAULT_CONFIG); setIS({}); setAlertPatch({}); setProjectsS(DEFAULT_PROJECTS); setAssetOff({});
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// In-memory router that mirrors to location.hash when the host allows it.
// Works inside sandboxed frames where hash navigation may be blocked.
let current = (() => { try { return window.location.hash.startsWith('#/') ? window.location.hash : '#/exec'; } catch { return '#/exec'; } })();
const listeners = new Set<(h: string) => void>();
export function go(h: string) {
  if (!h.startsWith('#/')) return;
  current = h;
  listeners.forEach((l) => l(h));
  try { if (window.location.hash !== h) history.replaceState(null, '', h); } catch { /* sandboxed */ }
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement)?.closest?.('a[href^="#/"]') as HTMLAnchorElement | null;
    if (a) { e.preventDefault(); go(a.getAttribute('href')!); }
  }, true);
  window.addEventListener('hashchange', () => { try { if (window.location.hash.startsWith('#/') && window.location.hash !== current) go(window.location.hash); } catch { /* ignore */ } });
}
export function useRoute() {
  const [hash, setHash] = useState(current);
  useEffect(() => { listeners.add(setHash); return () => { listeners.delete(setHash); }; }, []);
  return hash.replace(/^#\//, '').split('/');
}
