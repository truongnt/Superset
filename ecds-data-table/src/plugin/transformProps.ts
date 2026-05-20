import { ChartProps, DataRecord, getMetricLabel } from '@superset-ui/core';
import { EcdsDataTableProps } from '../types';

function metricKey(m: any): string {
  if (!m) return '';
  if (typeof m === 'string') return m;
  if (m.label) return m.label;
  if (m.metric_name) return m.metric_name;
  return String(m);
}

export default function transformProps(chartProps: ChartProps): EcdsDataTableProps {
  const { width, height, formData, queriesData } = chartProps;
  const fd = formData as any;

  const rows = (queriesData[0]?.data ?? []) as DataRecord[];

  // Build column order: groupby dimensions first, then metrics
  const groupbyCols: string[] = (fd.groupby ?? []).map((c: any) =>
    typeof c === 'string' ? c : (c.column_name ?? String(c)),
  );
  const metricCols: string[] = (fd.metrics ?? []).map(metricKey).filter(Boolean);

  // Fall back to keys from first row if both empty
  const columns =
    groupbyCols.length + metricCols.length > 0
      ? [...groupbyCols, ...metricCols]
      : Object.keys(rows[0] ?? {});

  // Human-readable labels: metrics get their label, dimensions keep name
  const columnLabels: Record<string, string> = {};
  columns.forEach(col => {
    columnLabels[col] = col;
  });
  (fd.metrics ?? []).forEach((m: any) => {
    const key = metricKey(m);
    if (key) columnLabels[key] = getMetricLabel(m);
  });

  return {
    width,
    height,
    data: rows as Array<Record<string, any>>,
    columns,
    columnLabels,
    enableHeatmap: fd.enable_heatmap ?? false,
    heatmapColor: fd.heatmap_color ?? 'red',
    heatmapScope: fd.heatmap_scope ?? 'column',
    pageSize: fd.page_size ?? 50,
  };
}
