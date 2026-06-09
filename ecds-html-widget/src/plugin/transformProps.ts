import { ChartProps } from '@superset-ui/core';
import { EcdsHtmlWidgetProps } from '../types';

function metricKey(m: any): string {
  if (!m) return '';
  if (typeof m === 'string') return m;
  if (m.label) return m.label;
  if (m.metric_name) return m.metric_name;
  return String(m);
}

export default function transformProps(chartProps: ChartProps): EcdsHtmlWidgetProps {
  const { width, height, formData, queriesData } = chartProps;
  const fd = formData as any;

  const orderByCols: string[] = fd.ecds_sort_cols ?? [];
  let rows = (queriesData[0]?.data ?? []) as Array<Record<string, any>>;

  if (orderByCols.length > 0) {
    const sortSpec = orderByCols.map((s: string) => {
      const parts = s.split(' ');
      const dir = parts.pop()?.toUpperCase();
      return { col: parts.join(' '), asc: dir !== 'DESC' };
    });
    rows = [...rows].sort((a, b) => {
      for (const { col, asc } of sortSpec) {
        const va = a[col];
        const vb = b[col];
        if (va === vb) continue;
        if (va == null) return asc ? -1 : 1;
        if (vb == null) return asc ? 1 : -1;
        return (va < vb ? -1 : 1) * (asc ? 1 : -1);
      }
      return 0;
    });
  }

  const firstRow: Record<string, any> = rows[0] ?? {};

  // Lấy danh sách metric labels
  const rawMetrics: any[] = fd.metrics ?? [];
  const metricLabels = rawMetrics.map(metricKey).filter(Boolean);

  // Lấy danh sách column names (groupby)
  const columnNames: string[] = (fd.groupby ?? []).map((c: any) =>
    typeof c === 'string' ? c : c.column_name ?? String(c),
  );

  return {
    width,
    height,
    htmlTemplate: fd.html_template ?? fd.htmlTemplate ?? '',
    rows,
    firstRow,
    metricLabels,
    columnNames,
  };
}
