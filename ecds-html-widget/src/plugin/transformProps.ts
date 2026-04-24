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

  const rows = (queriesData[0]?.data ?? []) as Array<Record<string, any>>;
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
