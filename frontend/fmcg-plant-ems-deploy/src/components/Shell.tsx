import React, { useEffect, useRef, useState } from 'react';
import { DATES, DAYS, idxOf } from '../data/sim';
import { fmtDate, rangeLabel, Range } from '../data/engine';
import { CATEGORIES, LINES, PLANT } from '../data/assets';
import { useStore, canSee } from '../store';
import { Badge, SevBadge } from './ui';
import { go } from '../store';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function presets(): { label: string; r: Range }[] {
  const last = DAYS - 1;
  const ds = DATES[last];
  const y = +ds.slice(0, 4), m = +ds.slice(5, 7) - 1;
  const iOf = (yy: number, mm: number, dd: number) => idxOf(new Date(Date.UTC(yy, mm, dd)).toISOString().slice(0, 10));
  const qStart = Math.floor(m / 3) * 3;
  const lastDow = new Date(ds + 'T00:00:00Z').getUTCDay();
  const thisMon = last - ((lastDow + 6) % 7);
  const c = (i: number) => Math.max(0, Math.min(last, i));
  return [
    { label: 'Yesterday (latest day)', r: { i0: last, i1: last } },
    { label: 'Day before', r: { i0: last - 1, i1: last - 1 } },
    { label: 'This week', r: { i0: c(thisMon), i1: last } },
    { label: 'Last week', r: { i0: c(thisMon - 7), i1: c(thisMon - 1) } },
    { label: 'Last 7 days', r: { i0: last - 6, i1: last } },
    { label: 'Last 30 days', r: { i0: last - 29, i1: last } },
    { label: 'This month', r: { i0: c(iOf(y, m, 1)), i1: last } },
    { label: 'Last month', r: { i0: c(iOf(y, m - 1, 1)), i1: c(iOf(y, m, 0)) } },
    { label: 'This quarter', r: { i0: c(iOf(y, qStart, 1)), i1: last } },
    { label: 'Last quarter', r: { i0: c(iOf(y, qStart - 3, 1)), i1: c(iOf(y, qStart, 0)) } },
    { label: 'Year to date', r: { i0: c(iOf(y, 0, 1)), i1: last } },
    { label: 'FY 2026-27 to date', r: { i0: c(iOf(2026, 3, 1)), i1: last } },
    { label: 'FY 2025-26', r: { i0: c(iOf(2025, 3, 1)), i1: c(iOf(2026, 2, 31)) } },
    { label: 'Last 12 months', r: { i0: last - 364, i1: last } },
    { label: 'All data (2 years)', r: { i0: 0, i1: last } },
  ];
}

function Month({ y, m, sel, hover, onPick, onHover }: { y: number; m: number; sel: { a: number | null; b: number | null }; hover: number | null; onPick: (i: number) => void; onHover: (i: number | null) => void }) {
  const first = new Date(Date.UTC(y, m, 1));
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  const lo = sel.a != null && (sel.b ?? hover) != null ? Math.min(sel.a, (sel.b ?? hover)!) : sel.a;
  const hi = sel.a != null && (sel.b ?? hover) != null ? Math.max(sel.a, (sel.b ?? hover)!) : sel.a;
  return (
    <div className="cal">
      <div className="cal-g">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => <div key={d} className="cal-dn">{d}</div>)}
        {cells.map((d, k) => {
          if (d == null) return <div key={k} />;
          const i = idxOf(new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10));
          const dis = i < 0 || i >= DAYS;
          const edge = i === lo || i === hi;
          const inr = lo != null && hi != null && i > lo && i < hi;
          return (
            <button key={k} disabled={dis} className={'cal-d' + (edge ? ' edge' : inr ? ' in' : '')} onClick={() => onPick(i)} onMouseEnter={() => onHover(i)}>
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangePicker() {
  const { filters, setFilters } = useStore();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<{ a: number | null; b: number | null }>({ a: filters.range.i0, b: filters.range.i1 });
  const [hover, setHover] = useState<number | null>(null);
  const end = DATES[filters.range.i1];
  const [view, setView] = useState({ y: +end.slice(0, 4), m: +end.slice(5, 7) - 2 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const v1 = new Date(Date.UTC(view.y, view.m, 1)), v2 = new Date(Date.UTC(view.y, view.m + 1, 1));
  const pick = (i: number) => {
    if (sel.a == null || sel.b != null) setSel({ a: i, b: null });
    else setSel({ a: Math.min(sel.a, i), b: Math.max(sel.a, i) });
  };
  const apply = (r: Range) => { setFilters({ range: r }); setOpen(false); };
  const n = filters.range.i1 - filters.range.i0 + 1;
  const shift = (dir: number) => {
    const i0 = Math.max(0, Math.min(DAYS - n, filters.range.i0 + dir * n));
    setFilters({ range: { i0, i1: i0 + n - 1 } });
  };
  return (
    <div ref={ref} style={{ position: 'relative' }} className="tb-field tb-date">
      <label>Date range (calendar)</label>
      <div className="row" style={{ gap: 4 }}>
        <button className="btn small" onClick={() => shift(-1)} title="Previous period" disabled={filters.range.i0 === 0}>‹</button>
        <button className="dr-btn" onClick={() => { setSel({ a: filters.range.i0, b: filters.range.i1 }); setOpen(!open); }}>
          📅 <b>{rangeLabel(filters.range)}</b> <span className="muted">({n} d)</span> ▾
        </button>
        <button className="btn small" onClick={() => shift(1)} title="Next period" disabled={filters.range.i1 === DAYS - 1}>›</button>
      </div>
      {open && (
        <div className="dr-pop">
          <div className="dr-presets">
            {presets().map((p) => <button key={p.label} onClick={() => apply(p.r)}>{p.label}</button>)}
          </div>
          <div>
            <div className="cal-h">
              <button onClick={() => setView((v) => ({ y: v.y, m: v.m - 1 }))}>‹</button>
              <div className="row" style={{ gap: 6 }}>
                <select value={v1.getUTCFullYear()} onChange={(e) => setView({ y: +e.target.value, m: v1.getUTCMonth() })}>
                  {[2024, 2025, 2026].map((y) => <option key={y}>{y}</option>)}
                </select>
                <span style={{ width: 160, textAlign: 'center' }}>{MONTHS[v1.getUTCMonth()]} · {MONTHS[v2.getUTCMonth()]}</span>
              </div>
              <button onClick={() => setView((v) => ({ y: v.y, m: v.m + 1 }))}>›</button>
            </div>
            <div className="row" style={{ alignItems: 'flex-start', gap: 16 }} onMouseLeave={() => setHover(null)}>
              <div><div className="muted" style={{ textAlign: 'center', marginBottom: 4 }}>{MONTHS[v1.getUTCMonth()]} {v1.getUTCFullYear()}</div><Month y={v1.getUTCFullYear()} m={v1.getUTCMonth()} sel={sel} hover={hover} onPick={pick} onHover={setHover} /></div>
              <div><div className="muted" style={{ textAlign: 'center', marginBottom: 4 }}>{MONTHS[v2.getUTCMonth()]} {v2.getUTCFullYear()}</div><Month y={v2.getUTCFullYear()} m={v2.getUTCMonth()} sel={sel} hover={hover} onPick={pick} onHover={setHover} /></div>
            </div>
            <div className="row between" style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <span className="muted">{sel.a != null ? fmtDate(sel.a) : '—'} → {sel.b != null ? fmtDate(sel.b) : sel.a != null ? 'pick end date' : '—'} · data: {fmtDate(0)} – {fmtDate(DAYS - 1)}</span>
              <div className="row">
                <button className="btn small" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn small primary" disabled={sel.a == null} onClick={() => apply({ i0: sel.a!, i1: sel.b ?? sel.a! })}>Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function TopBar({ full, onFull }: { full: boolean; onFull: () => void }) {
  const { filters, setFilters, persona, setPersona, refresh, refreshedAt } = useStore();
  const [menu, setMenu] = useState(false);
  const skus = LINES.filter((l) => filters.category === 'ALL' || l.category === filters.category).flatMap((l) => l.skus.map((s) => ({ ...s, line: l.id })));
  return (
    <>
      <div className="sim-banner">
        <Badge kind="sim">SIMULATED DATA</Badge>
        <span>No live PLC / SCADA / meter connection. All values come from a 2-year simulated ingestion layer ({fmtDate(0)} – {fmtDate(DAYS - 1)}). Estimated values are flagged <Badge kind="est">EST</Badge>.</span>
      </div>
      <div className="topbar">
        <div className="tb-field">
          <label>Department</label>
          <select value={filters.dept} onChange={(e) => setFilters({ dept: e.target.value })} disabled={!!persona?.dept} title={persona?.dept ? 'Locked to your role' : undefined}>
            <option value="ALL">All departments</option>
            <option value="PRD">Production</option>
            <option value="UTL">Utilities</option>
            <option value="ADM">Administration</option>
            <option value="WH">Central Warehouse</option>
            <option value="HUB1">Distribution Hub 01</option>
            <option value="HUB2">Distribution Hub 02</option>
            <option value="HUB3">Distribution Hub 03</option>
          </select>
        </div>
        <div className="sep" />
        <DateRangePicker />
        <div className="tb-field">
          <label>Shift</label>
          <select value={filters.shift ?? ''} onChange={(e) => setFilters({ shift: e.target.value === '' ? null : +e.target.value })}>
            <option value="">All shifts</option>
            <option value="0">Shift A (06–14)</option>
            <option value="1">Shift B (14–22)</option>
            <option value="2">Shift C (22–06)</option>
          </select>
        </div>
        <div className="tb-field">
          <label>Product category</label>
          <select value={filters.category} onChange={(e) => setFilters({ category: e.target.value, sku: 'ALL' })}>
            <option value="ALL">All categories</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="tb-field">
          <label>SKU</label>
          <select value={filters.sku} onChange={(e) => setFilters({ sku: e.target.value })}>
            <option value="ALL">All SKUs</option>
            {skus.map((s) => <option key={s.code} value={s.code}>{s.code}</option>)}
          </select>
        </div>
        <div className="tb-actions">
        {canSee(persona, '#/alerts') && <Notifications />}
        <button className="btn small icon-btn" onClick={onFull} aria-label={full ? 'Exit full screen' : 'Full screen'} title={full ? 'Exit full screen (Esc)' : 'Show the application full screen'} aria-pressed={full}><span className="tb-ico">{full ? '⤡' : '⤢'}</span></button>
        <button className="btn small icon-btn" onClick={refresh} title={'Refresh (last refreshed ' + refreshedAt.toLocaleTimeString() + ')'} aria-label="Refresh"><span className="tb-ico">⟳</span></button>
        <div style={{ position: 'relative' }}>
          <button className="btn tb-profile" onClick={() => setMenu(!menu)} title={persona ? persona.name + ' · ' + persona.title : ''}>
            <span className="avatar" style={{ width: 24, height: 24, fontSize: 10, background: 'linear-gradient(135deg,#4f8ff7,#22c3e6)' }}>{persona?.name.split(' ').map((x) => x[0]).join('').slice(0, 2)}</span>
            <span className="tb-who" style={{ textAlign: 'left', lineHeight: 1.15 }}><div style={{ fontSize: 12 }}>{persona?.name}</div><div className="muted" style={{ fontSize: 10.5 }}>{persona?.title}</div></span>
          </button>
          {menu && (
            <div className="dr-pop" style={{ right: 0, left: 'auto', flexDirection: 'column', gap: 2, minWidth: 220, top: 40 }} onMouseLeave={() => setMenu(false)}>
              <div style={{ fontWeight: 600 }}>{persona?.name}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>{persona?.title}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{persona?.pages === 'all' ? 'Access: all modules' : `Access: ${persona?.pages.length} modules`}{persona?.canAdmin ? ' · admin' : persona?.canEdit ? ' · can edit' : ' · view only'}</div>
              <button className="btn small" style={{ marginTop: 8 }} onClick={() => { setMenu(false); setPersona(null); }}>⎋ Sign out</button>
            </div>
          )}
        </div>
        </div>
      </div>
    </>
  );
}

export const NAV: { group: string; items: { href: string; label: string; ico: string }[] }[] = [
  { group: 'Overview', items: [
    { href: '#/exec', label: 'Executive Dashboard', ico: '◆' },
    { href: '#/plant', label: 'Plant Overview', ico: '▣' },
    { href: '#/tree', label: 'Energy Hierarchy', ico: '⋔' },
    { href: '#/departments', label: 'Departments', ico: '▤' },
  ] },
  { group: 'Production', items: [
    { href: '#/production', label: 'Production Lines', ico: '⚙' },
    { href: '#/intel', label: 'Energy vs Production', ico: '⟋' },
    { href: '#/benchmark', label: 'Benchmarking', ico: '≣' },
  ] },
  { group: 'Utilities & Infrastructure', items: [
    { href: '#/utilities', label: 'Utilities', ico: '❄' },
    { href: '#/electrical', label: 'Electrical Infrastructure', ico: 'ϟ' },
    { href: '#/buildings', label: 'Buildings & Warehouses', ico: '⌂' },
    { href: '#/hubs', label: 'Distribution Hubs', ico: '⛟' },
  ] },
  { group: 'Intelligence', items: [
    { href: '#/intelligence', label: 'Energy Intelligence', ico: '✦' },
    { href: '#/alerts', label: 'Alerts & Events', ico: '🔔' },
  ] },
  { group: 'Cost & Sustainability', items: [
    { href: '#/cost', label: 'Energy Cost', ico: '₹' },
    { href: '#/carbon', label: 'Carbon & Sustainability', ico: '♻' },
    { href: '#/targets', label: 'Targets & Baselines', ico: '◎' },
    { href: '#/projects', label: 'Improvement Projects', ico: '↗' },
    { href: '#/reports', label: 'Reports', ico: '⎙' },
  ] },
  { group: 'Configuration', items: [
    { href: '#/meters', label: 'Energy Meters', ico: '⏲' },
    { href: '#/assets', label: 'Asset Master', ico: '▦' },
    { href: '#/quality', label: 'Data Quality & Balance', ico: '⚖' },
    { href: '#/integration', label: 'Data Integration', ico: '⇄' },
    { href: '#/admin', label: 'Administration', ico: '⚿' },
  ] },
];

export function Sidebar({ route, collapsed, onToggle }: { route: string[]; collapsed: boolean; onToggle: () => void }) {
  const { persona } = useStore();
  const nav = NAV.map((g) => ({ ...g, items: g.items.filter((it) => canSee(persona, it.href)) })).filter((g) => g.items.length);
  const cur = '#/' + route[0];
  const alias: Record<string, string> = { '#/line': '#/production', '#/machine': '#/production', '#/analytics': '#/intelligence', '#/insights': '#/intelligence', '#/losses': '#/intelligence' };
  const active = alias[cur] ?? cur;
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">E</div>
        <div>
          <div className="brand-t">EnergyIQ · EMS</div>
          <div className="brand-s">Plant Energy Intelligence</div>
        </div>
      </div>
      <button className="side-toggle" onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}>
        <span className="ico">{collapsed ? '»' : '«'}</span>
        <span className="lbl">Collapse menu</span>
      </button>
      <nav className="nav">
        {nav.map((g) => (
          <div key={g.group} className="nav-group">
            <div className="nav-gt">{g.group}</div>
            {g.items.map((it) => (
              <a key={it.href} href={it.href} className={active === it.href ? 'active' : ''} title={it.label}>
                <span className="ico">{it.ico}</span>
                <span className="lbl">{it.label}</span>
              </a>
            ))}
          </div>
        ))}
      </nav>
      <div style={{ marginTop: 'auto', padding: 12, fontSize: 11 }} className="muted side-foot">
        v1.0 demo · Simulated dataset
      </div>
    </aside>
  );
}

const SEV_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Informational: 4 };
function Notifications() {
  const { alerts } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = alerts.filter((a) => a.status === 'Active').sort((a, b) => b.d - a.d || SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  const crit = active.filter((a) => a.severity === 'Critical' || a.severity === 'High').length;
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="notif" ref={ref}>
      <button className="btn small notif-btn" onClick={() => setOpen(!open)} aria-label={`Notifications, ${active.length} active alerts`} title={`${active.length} active alerts`}>
        <span style={{ fontSize: 14 }}>🔔</span>
        {active.length > 0 && <span className={'notif-count' + (crit ? ' hot' : '')}>{active.length > 99 ? '99+' : active.length}</span>}
      </button>
      {open && (
        <div className="notif-pop">
          <div className="notif-head">
            <b>Notifications</b>
            <span className="muted">{active.length} active · {crit} high or critical</span>
          </div>
          <div className="notif-list">
            {active.length === 0 && <div className="muted" style={{ padding: 12 }}>No active alerts.</div>}
            {active.slice(0, 8).map((a) => (
              <button key={a.id} className="notif-item" onClick={() => { setOpen(false); go('#/alerts'); }}>
                <span className="ni-top"><SevBadge s={a.severity} /><span className="muted">{a.time}</span></span>
                <span className="ni-t">{a.type} · {a.asset}</span>
                <span className="muted ni-m">{a.message}</span>
              </button>
            ))}
          </div>
          <a className="btn small notif-all" href="#/alerts" onClick={() => setOpen(false)}>View all alerts & events →</a>
        </div>
      )}
    </div>
  );
}
