import { useMemo } from 'react';
import { Layer, Rectangle, ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import { useStore } from '../store';
import { buckets, Granularity, plantMetrics, Range, rangeLabel } from '../data/engine';
import { n0, PALETTE } from '../format';

export function useView() {
  const s = useStore();
  const r = s.filters.range;
  const P = useMemo(() => plantMetrics(r, s.cfg), [r, s.cfg]);
  const Pc = useMemo(() => (s.cmp ? plantMetrics(s.cmp, s.cfg) : null), [s.cmp, s.cfg]);
  const cmpLabel = s.cmp ? (s.filters.compare === 'yoy' ? 'vs last year' : 'vs prev. period') : 'no comparison';
  return { ...s, r, P, Pc, cmpLabel, cmpRangeLabel: rangeLabel(s.cmp) };
}

export type Agg = 'sum' | 'avg' | 'max';
export function bucketSeries(r: Range, gran: Granularity, fns: Record<string, (d: number) => number>, agg: Agg | Record<string, Agg> = 'sum') {
  return buckets(r, gran).map((b) => {
    const row: Record<string, number | string> = { label: b.label, i0: b.i0, i1: b.i1 };
    for (const k of Object.keys(fns)) {
      const a = typeof agg === 'string' ? agg : agg[k] ?? 'sum';
      let v = a === 'max' ? -Infinity : 0;
      for (let d = b.i0; d <= b.i1; d++) {
        const x = fns[k](d);
        if (a === 'max') v = Math.max(v, x);
        else v += x;
      }
      if (a === 'avg') v /= b.i1 - b.i0 + 1;
      row[k] = v;
    }
    return row;
  });
}
/** ratio series: Σnum / Σden per bucket */
export function bucketRatio(r: Range, gran: Granularity, num: (d: number) => number, den: (d: number) => number, scale = 1) {
  return buckets(r, gran).map((b) => {
    let a = 0, c = 0;
    for (let d = b.i0; d <= b.i1; d++) { a += num(d); c += den(d); }
    return { label: b.label, v: c ? (a / c) * scale : null };
  });
}

export function spark(r: Range, fn: (d: number) => number, points = 30) {
  const n = r.i1 - r.i0 + 1;
  const step = Math.max(1, Math.ceil(n / points));
  const out: number[] = [];
  for (let d = r.i0; d <= r.i1; d += step) {
    let s = 0, k = 0;
    for (let x = d; x < Math.min(d + step, r.i1 + 1); x++) { s += fn(x); k++; }
    out.push(s / k);
  }
  return out;
}

// ---------------- Sankey ----------------
export interface SNode { name: string; color?: string }
export interface SLink { source: number; target: number; value: number }
function SankeyNode({ x, y, width, height, index, payload }: any) {
  const isOut = !payload.targetNodes || payload.targetNodes.length === 0;
  const color = payload.color ?? PALETTE[index % PALETTE.length];
  return (
    <Layer key={`n${index}`}>
      <Rectangle x={x} y={y} width={width} height={Math.max(2, height)} fill={color} fillOpacity={0.95} radius={2} />
      <text x={isOut ? x - 6 : x + width + 6} y={y + height / 2 + (height >= 16 ? 0 : 1)} textAnchor={isOut ? 'end' : 'start'} dominantBaseline="middle" fontSize={11} fill="#dbe6fb">
        {payload.name}
      </text>
      {height >= 16 && <text x={isOut ? x - 6 : x + width + 6} y={y + height / 2 + 13} textAnchor={isOut ? 'end' : 'start'} dominantBaseline="middle" fontSize={10} fill="#7f95bd">
        {n0(payload.value / 1000)} MWh
      </text>}
    </Layer>
  );
}
export function SankeyChart({ nodes, links, height = 380 }: { nodes: SNode[]; links: SLink[]; height?: number }) {
  const data = useMemo(() => ({ nodes, links: links.filter((l) => l.value > 0) }), [nodes, links]);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Sankey data={data} nodePadding={9} nodeWidth={10} margin={{ top: 10, bottom: 10, left: 6, right: 6 }} link={{ stroke: '#3b82f6', strokeOpacity: 0.22 } as any} node={<SankeyNode />} iterations={48}>
        <Tooltip content={({ active, payload }: any) => {
          if (!active || !payload?.length) return null;
          const p = payload[0].payload;
          const name = p.source ? `${p.source.name} → ${p.target.name}` : p.name;
          return <div className="tt"><div className="tt-t">{name}</div><b>{n0(p.value)} kWh</b></div>;
        }} />
      </Sankey>
    </ResponsiveContainer>
  );
}
