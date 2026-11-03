import { go } from '../store';
import React, { useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { C, downloadCsv, n0, n1, n2, PALETTE, pctS } from '../format';

export function Panel({ title, sub, actions, children, className = '', style }: { title?: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={'panel ' + className} style={style}>
      {(title || actions) && (
        <div className="panel-h">
          <div>
            <div className="panel-t">{title}</div>
            {sub && <div className="panel-s">{sub}</div>}
          </div>
          {actions && <div className="panel-a">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function PageHeader({ title, sub, crumbs, actions }: { title: string; sub?: React.ReactNode; crumbs?: { label: string; href?: string }[]; actions?: React.ReactNode }) {
  return (
    <div className="page-h">
      <div>
        {crumbs && (
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && ' › '}
                {c.href ? <a href={c.href}>{c.label}</a> : c.label}
              </span>
            ))}
          </div>
        )}
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Sparkline({ data, color = C.blue }: { data: number[]; color?: string }) {
  const d = data.map((v, i) => ({ i, v }));
  const id = useMemo(() => 'sp' + Math.random().toString(36).slice(2), []);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={d} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.45} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${id})`} isAnimationActive={false} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export type KpiStatus = 'good' | 'warn' | 'bad' | 'info' | 'na';
const statusColor: Record<KpiStatus, string> = { good: C.green, warn: C.amber, bad: C.red, info: C.blue, na: C.grey };

export function Kpi({ label, value, unit, prev, change, lowerIsBetter = true, spark, status, href, cmpLabel = 'vs comparison', tag, title }: {
  label: string; value: string; unit?: string; prev?: string; change?: number | null; lowerIsBetter?: boolean; spark?: number[]; status?: KpiStatus; href?: string; cmpLabel?: string; tag?: React.ReactNode; title?: string;
}) {
  let cls = 'neutral', arrow = '•';
  if (change != null && isFinite(change)) {
    arrow = change > 0.05 ? '▲' : change < -0.05 ? '▼' : '•';
    const good = lowerIsBetter ? change < 0 : change > 0;
    cls = Math.abs(change) < 0.5 ? 'neutral' : good ? 'up-good' : 'up-bad';
  }
  const st = status ?? (change == null ? 'info' : cls === 'up-bad' ? (Math.abs(change) > 5 ? 'bad' : 'warn') : 'good');
  return (
    <div className={'kpi' + (href ? ' click' : '')} onClick={() => href && go(href)} title={title ?? (href ? 'Click to drill down' : undefined)}>
      <div className="kpi-l">
        <span>{label}</span>
        <span className="row" style={{ gap: 4 }}>
          {tag}
          <span className="status-dot" style={{ background: statusColor[st] }} />
        </span>
      </div>
      <div className="kpi-v">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <div className="kpi-c">
        <span className={cls}>
          {arrow} {change == null ? 'n/a' : pctS(change)}
        </span>
        <span title={cmpLabel}>{prev != null ? `${cmpLabel.replace('vs ', '')}: ${prev}` : cmpLabel}</span>
      </div>
      {spark && spark.length > 1 && (
        <div className="kpi-spark">
          <Sparkline data={spark} color={statusColor[st] === C.green ? C.cyan : statusColor[st]} />
        </div>
      )}
    </div>
  );
}

export function Badge({ kind = 'info', children }: { kind?: string; children: React.ReactNode }) {
  return <span className={'badge b-' + kind}>{children}</span>;
}
export function SevBadge({ s }: { s: string }) {
  const k = s === 'Critical' ? 'crit' : s === 'High' ? 'high' : s === 'Medium' ? 'med' : s === 'Low' ? 'low' : 'info';
  return <Badge kind={k}>{s}</Badge>;
}
export function SimBadge() {
  return <Badge kind="sim">SIMULATED</Badge>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.key} className={'tab' + (value === t.key ? ' on' : '')} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------- table ----------------
export interface Col<R> {
  key: string;
  label: string;
  num?: boolean;
  render?: (r: R) => React.ReactNode;
  value?: (r: R) => number | string;
  bar?: boolean;
  width?: number;
}
export function DataTable<R extends Record<string, any>>({ cols, rows, exportName, pageSize = 0, onRow, maxHeight, initialSort }: { cols: Col<R>[]; rows: R[]; exportName?: string; pageSize?: number; onRow?: (r: R) => void; maxHeight?: number; initialSort?: { key: string; dir: 1 | -1 } }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const val = (r: R, c: Col<R>) => (c.value ? c.value(r) : r[c.key]);
  const filtered = useMemo(() => {
    let rs = rows;
    if (q) {
      const ql = q.toLowerCase();
      rs = rs.filter((r) => cols.some((c) => String(val(r, c) ?? '').toLowerCase().includes(ql)));
    }
    if (sort) {
      const c = cols.find((x) => x.key === sort.key);
      if (c) rs = [...rs].sort((a, b) => { const va = val(a, c), vb = val(b, c); return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * sort.dir; });
    }
    return rs;
  }, [rows, sort, q, cols]);
  const maxes = useMemo(() => {
    const m: Record<string, number> = {};
    cols.forEach((c) => { if (c.bar) m[c.key] = Math.max(...filtered.map((r) => Math.abs(Number(val(r, c)) || 0)), 1); });
    return m;
  }, [filtered, cols]);
  const shown = pageSize ? filtered.slice(page * pageSize, (page + 1) * pageSize) : filtered;
  const pages = pageSize ? Math.ceil(filtered.length / pageSize) : 1;
  return (
    <div>
      {(exportName || rows.length > 12) && (
        <div className="row between" style={{ marginBottom: 8 }}>
          <input placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} style={{ width: 200 }} />
          <div className="row">
            <span className="muted">{filtered.length} rows</span>
            {exportName && (
              <button className="btn small" onClick={() => downloadCsv(exportName, filtered.map((r) => Object.fromEntries(cols.map((c) => [c.label, val(r, c)]))))}>
                ⤓ CSV / Excel
              </button>
            )}
          </div>
        </div>
      )}
      <div className="tbl-wrap" style={{ maxHeight }}>
        <table className="tbl">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={c.num ? 'num' : ''} style={{ width: c.width }} onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
                  {c.label} {sort?.key === c.key ? (sort.dir === 1 ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className={onRow ? 'click' : ''} onClick={() => onRow?.(r)}>
                {cols.map((c) => (
                  <td key={c.key} className={(c.num ? 'num ' : '') + (c.bar ? 'bar-cell' : '')}>
                    {c.bar && <div className="bar" style={{ width: `${(Math.abs(Number(val(r, c)) || 0) / maxes[c.key]) * 100}%` }} />}
                    <span>{c.render ? c.render(r) : typeof val(r, c) === 'number' ? n0(val(r, c) as number) : (val(r, c) as React.ReactNode)}</span>
                  </td>
                ))}
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={cols.length} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                  No data for the selected filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pageSize > 0 && pages > 1 && (
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Prev</button>
          <span className="muted">Page {page + 1} / {pages}</span>
          <button className="btn small" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next ›</button>
        </div>
      )}
    </div>
  );
}

// ---------------- chart helpers ----------------
export const axisProps = { stroke: '#2a4a80', tickLine: false, axisLine: { stroke: '#1e3a6b' } } as const;
const fmtTick = (v: number) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(Math.abs(v) >= 1e4 ? 0 : 1) + 'k' : Math.abs(v) < 10 && v !== 0 ? v.toFixed(2) : v.toFixed(0));
export { fmtTick };

export function TT({ active, payload, label, unit, digits = 0 }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tt">
      <div className="tt-t">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="tt-r">
          <span><i style={{ background: p.color || p.fill || p.stroke }} />{p.name}</span>
          <b>{typeof p.value === 'number' ? (digits === 2 ? n2(p.value) : digits === 1 ? n1(p.value) : n0(p.value)) : p.value} {p.unit ?? unit ?? ''}</b>
        </div>
      ))}
    </div>
  );
}

export interface SeriesDef { key: string; name: string; color?: string; type?: 'bar' | 'line' | 'area'; stack?: string; axis?: 'left' | 'right'; dashed?: boolean; unit?: string }
export function Combo({ data, x = 'label', series, height = 260, yLabel, y2Label, refLines, digits = 0, onClick, legend = true }: {
  data: any[]; x?: string; series: SeriesDef[]; height?: number; yLabel?: string; y2Label?: string; refLines?: { y: number; label: string; color?: string; axis?: 'left' | 'right' }[]; digits?: number; onClick?: (d: any) => void; legend?: boolean;
}) {
  const hasRight = series.some((s) => s.axis === 'right');
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: hasRight ? 6 : 10, left: 0, bottom: 0 }} onClick={(e: any) => onClick && e?.activePayload && onClick(e.activePayload[0].payload)}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={x} {...axisProps} minTickGap={18} />
        <YAxis yAxisId="left" {...axisProps} tickFormatter={fmtTick} width={52} label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: '#7f95bd', fontSize: 11, dy: 30 } : undefined} />
        {hasRight && <YAxis yAxisId="right" orientation="right" {...axisProps} tickFormatter={fmtTick} width={52} label={y2Label ? { value: y2Label, angle: 90, position: 'insideRight', fill: '#7f95bd', fontSize: 11, dy: -30 } : undefined} />}
        <Tooltip content={<TT digits={digits} />} cursor={{ fill: '#1d3f7e33' }} />
        {legend && series.length > 1 && <Legend iconSize={9} wrapperStyle={{ fontSize: 11.5 }} />}
        {refLines?.map((r, i) => <ReferenceLine key={i} yAxisId={r.axis ?? 'left'} y={r.y} stroke={r.color ?? C.amber} strokeDasharray="5 4" label={{ value: r.label, fill: r.color ?? C.amber, fontSize: 10.5, position: 'insideTopRight' }} />)}
        {series.map((s, i) => {
          const color = s.color ?? PALETTE[i % PALETTE.length];
          const common = { key: s.key, dataKey: s.key, name: s.name, yAxisId: s.axis ?? 'left', isAnimationActive: false, unit: s.unit } as any;
          if (s.type === 'line') return <Line {...common} stroke={color} strokeWidth={2} dot={false} strokeDasharray={s.dashed ? '5 4' : undefined} />;
          if (s.type === 'area') return <Area {...common} stroke={color} fill={color} fillOpacity={0.18} strokeWidth={1.6} stackId={s.stack} />;
          return <Bar {...common} fill={color} stackId={s.stack} radius={s.stack ? undefined : [3, 3, 0, 0]} maxBarSize={38} />;
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function HBar({ data, height, unit, color = C.blue, onClick, digits = 0, labelWidth = 150 }: { data: { name: string; value: number; color?: string; id?: string }[]; height?: number; unit?: string; color?: string; onClick?: (d: any) => void; digits?: number; labelWidth?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(120, data.length * 26 + 20)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }} onClick={(e: any) => onClick && e?.activePayload && onClick(e.activePayload[0].payload)}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" {...axisProps} tickFormatter={fmtTick} />
        <YAxis type="category" dataKey="name" {...axisProps} width={labelWidth} tick={{ fontSize: 11, fill: '#b9c8e4' }} interval={0} />
        <Tooltip content={<TT unit={unit} digits={digits} />} cursor={{ fill: '#1d3f7e33' }} />
        <Bar dataKey="value" name={unit ?? 'Value'} radius={[0, 3, 3, 0]} isAnimationActive={false} maxBarSize={18} style={{ cursor: onClick ? 'pointer' : 'default' }}>
          {data.map((d, i) => <Cell key={i} fill={d.color ?? color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 220, unit = 'kWh', center }: { data: { name: string; value: number; color?: string }[]; height?: number; unit?: string; center?: string }) {
  const tot = data.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ width: height, height, position: 'relative', flex: 'none' }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={1.5} stroke="none" isAnimationActive={false}>
              {data.map((d, i) => <Cell key={i} fill={d.color ?? PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip content={<TT unit={unit} />} />
          </PieChart>
        </ResponsiveContainer>
        {center && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', fontWeight: 650, fontSize: 14, pointerEvents: 'none' }}>{center}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 140 }}>
        {data.map((d, i) => (
          <div key={i} className="row between" style={{ fontSize: 12, padding: '2px 0' }}>
            <span className="row" style={{ gap: 6 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: d.color ?? PALETTE[i % PALETTE.length], display: 'inline-block' }} />{d.name}</span>
            <b>{((d.value / tot) * 100).toFixed(1)}%</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Scatter2({ data, xName, yName, height = 260, color = C.cyan, fit = true, highlight }: { data: { x: number; y: number; label?: string; flag?: boolean }[]; xName: string; yName: string; height?: number; color?: string; fit?: boolean; highlight?: string }) {
  const reg = useMemo(() => {
    const n = data.length;
    if (n < 3) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    data.forEach((p) => { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; });
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
    const a = (sy - b * sx) / n;
    const xs = data.map((p) => p.x);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const my = sy / n;
    let ssr = 0, sst = 0;
    data.forEach((p) => { ssr += (p.y - (a + b * p.x)) ** 2; sst += (p.y - my) ** 2; });
    return { a, b, x0, x1, r2: 1 - ssr / (sst || 1) };
  }, [data]);
  const normal = data.filter((d) => !d.flag), flagged = data.filter((d) => d.flag);
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 14 }}>
          <CartesianGrid />
          <XAxis type="number" dataKey="x" name={xName} {...axisProps} tickFormatter={fmtTick} label={{ value: xName, position: 'insideBottom', dy: 14, fill: '#7f95bd', fontSize: 11 }} domain={['auto', 'auto']} />
          <YAxis type="number" dataKey="y" name={yName} {...axisProps} tickFormatter={fmtTick} width={52} domain={['auto', 'auto']} />
          <ZAxis range={[26, 26]} />
          <Tooltip content={({ active, payload }: any) => active && payload?.length ? <div className="tt"><div className="tt-t">{payload[0].payload.label}</div><div className="tt-r"><span>{xName}</span><b>{n1(payload[0].payload.x)}</b></div><div className="tt-r"><span>{yName}</span><b>{n1(payload[0].payload.y)}</b></div>{payload[0].payload.flag && <div style={{ color: C.amber }}>Flagged: outside expected band</div>}</div> : null} />
          <Scatter data={normal} fill={color} fillOpacity={0.7} isAnimationActive={false} />
          {flagged.length > 0 && <Scatter data={flagged} fill={C.amber} isAnimationActive={false} />}
          {fit && reg && <Scatter data={[{ x: reg.x0, y: reg.a + reg.b * reg.x0 }, { x: reg.x1, y: reg.a + reg.b * reg.x1 }]} line={{ stroke: C.violet, strokeWidth: 2, strokeDasharray: '6 4' }} shape={() => null as any} isAnimationActive={false} />}
        </ScatterChart>
      </ResponsiveContainer>
      {fit && reg && (
        <div className="muted" style={{ fontSize: 11.5 }}>
          Fit: {yName} = {n1(reg.a)} + {n2(reg.b)} × {xName} · R² = {n2(reg.r2)} {highlight && <span style={{ color: C.amber }}>· {highlight}</span>}
        </div>
      )}
    </div>
  );
}

export function Heatmap({ rows, cols, values, unit = 'kWh', colorMax }: { rows: string[]; cols: string[]; values: number[][]; unit?: string; colorMax?: number }) {
  const all = values.flat().filter((v) => isFinite(v));
  const mn = Math.min(...all), mx = colorMax ?? Math.max(...all);
  const col = (v: number) => {
    const t = Math.max(0, Math.min(1, (v - mn) / (mx - mn || 1)));
    // dark blue -> cyan -> amber
    const stops = [[18, 40, 84], [34, 118, 220], [34, 195, 230], [245, 165, 36]];
    const p = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
    const c = stops[i].map((s, k) => Math.round(s + (stops[i + 1][k] - s) * f));
    return `rgb(${c.join(',')})`;
  };
  return (
    <div className="heat" style={{ gridTemplateColumns: `70px repeat(${cols.length}, minmax(0,1fr))` }}>
      <div />
      {cols.map((c, i) => <div key={i} className="muted" style={{ textAlign: 'center' }}>{i % 2 === 0 ? c : ''}</div>)}
      {rows.map((r, ri) => (
        <React.Fragment key={ri}>
          <div className="l">{r}</div>
          {cols.map((c, ci) => <div key={ci} className="c" style={{ background: col(values[ri][ci]) }} title={`${r} ${c}: ${n0(values[ri][ci])} ${unit}`} />)}
        </React.Fragment>
      ))}
    </div>
  );
}

export function Waterfall({ data, height = 260, unit = 'kWh' }: { data: { name: string; value: number; total?: boolean }[]; height?: number; unit?: string }) {
  let run = 0;
  const rows = data.map((d) => {
    if (d.total) { const r = { name: d.name, base: 0, pos: d.value, neg: 0, raw: d.value, total: true }; run = d.value; return r; }
    const start = run;
    run += d.value;
    return { name: d.name, base: Math.min(start, run), pos: d.value > 0 ? d.value : 0, neg: d.value < 0 ? -d.value : 0, raw: d.value, total: false };
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" {...axisProps} interval={0} tick={{ fontSize: 10.5, fill: '#b9c8e4' }} />
        <YAxis {...axisProps} tickFormatter={fmtTick} width={56} />
        <Tooltip content={({ active, payload, label }: any) => active && payload?.length ? <div className="tt"><div className="tt-t">{label}</div><b>{payload[0].payload.raw > 0 && !payload[0].payload.total ? '+' : ''}{n0(payload[0].payload.raw)} {unit}</b></div> : null} />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="pos" stackId="w" isAnimationActive={false}>
          {rows.map((r, i) => <Cell key={i} fill={r.total ? C.blue : C.red} />)}
        </Bar>
        <Bar dataKey="neg" stackId="w" fill={C.green} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <b style={{ fontSize: 15 }}>{title}</b>
          <button className="btn small ghost" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11 }}>{sub}</div>}
    </div>
  );
}

export { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell, Legend, ReferenceLine };
