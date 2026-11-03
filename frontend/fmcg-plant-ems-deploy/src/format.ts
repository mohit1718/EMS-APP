export const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const nf1 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
export const nf2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const n0 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : nf0.format(v));
export const n1 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : nf1.format(v));
export const n2 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : nf2.format(v));

/** energy with auto unit */
export function kwh(v: number | null | undefined): [string, string] {
  if (v == null || !isFinite(v)) return ['—', 'kWh'];
  const a = Math.abs(v);
  if (a >= 1e6) return [nf2.format(v / 1e6), 'GWh'];
  if (a >= 1e4) return [nf1.format(v / 1e3), 'MWh'];
  return [nf0.format(v), 'kWh'];
}
export const kwhS = (v: number | null | undefined) => kwh(v).join(' ');

/** Indian currency format: ₹ lakh / crore */
export function rs(v: number | null | undefined): [string, string] {
  if (v == null || !isFinite(v)) return ['—', ''];
  const a = Math.abs(v);
  if (a >= 1e7) return ['₹' + nf2.format(v / 1e7), 'Cr'];
  if (a >= 1e5) return ['₹' + nf2.format(v / 1e5), 'L'];
  return ['₹' + nf0.format(v), ''];
}
export const rsS = (v: number | null | undefined) => rs(v).join(' ').trim();

export const pctS = (v: number | null | undefined, digits = 1) => (v == null || !isFinite(v) ? 'n/a' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`);

export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.endsWith('.csv') ? name : name + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const PALETTE = ['#4f8ff7', '#22c3e6', '#8b7cf6', '#2dd4bf', '#f5a524', '#f472b6', '#a3e635', '#fb923c', '#60a5fa', '#c084fc', '#34d399', '#fbbf24', '#38bdf8', '#e879f9', '#94a3b8'];
export const C = { blue: '#4f8ff7', cyan: '#22c3e6', green: '#22c55e', amber: '#f59e0b', red: '#ef4444', grey: '#64748b', violet: '#8b7cf6', teal: '#2dd4bf' };
