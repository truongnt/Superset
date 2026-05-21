import { ChartProps, DataRecord, getMetricLabel } from '@superset-ui/core';
import { EcdsDataTableProps, QueryMode, RgbColor, TableStyle } from '../types';

const DEFAULT_LOW:  RgbColor = { r: 255, g: 255, b: 255, a: 1 };
const DEFAULT_HIGH: RgbColor = { r: 220, g: 38,  b: 38,  a: 1 };

const DEFAULT_STYLE: TableStyle = {
  headerBg:    { r: 240, g: 244, b: 255, a: 1 },
  headerText:  { r: 85,  g: 85,  b: 85,  a: 1 },
  rowOddBg:    { r: 255, g: 255, b: 255, a: 1 },
  rowEvenBg:   { r: 250, g: 252, b: 255, a: 1 },
  borderColor: { r: 238, g: 238, b: 238, a: 1 },
};

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

  const queryMode: QueryMode = fd.query_mode ?? 'aggregate';
  const rows = (queriesData[0]?.data ?? []) as DataRecord[];
  const firstRowKeys = Object.keys(rows[0] ?? {});

  let columns: string[];
  const columnLabels: Record<string, string> = {};

  if (queryMode === 'raw_records') {
    const selected: string[] = fd.all_columns ?? [];
    columns = selected.length > 0 ? selected : firstRowKeys;
    columns.forEach(col => { columnLabels[col] = col; });
  } else {
    const groupbyCols: string[] = (fd.groupby ?? []).map((c: any) =>
      typeof c === 'string' ? c : (c.column_name ?? String(c)),
    );
    const metricCols: string[] = (fd.metrics ?? []).map(metricKey).filter(Boolean);

    columns =
      groupbyCols.length + metricCols.length > 0
        ? [...groupbyCols, ...metricCols]
        : firstRowKeys;

    columns.forEach(col => { columnLabels[col] = col; });
    (fd.metrics ?? []).forEach((m: any) => {
      const key = metricKey(m);
      if (key) columnLabels[key] = getMetricLabel(m);
    });
  }

  const tableStyle: TableStyle = {
    headerBg:    fd.header_bg    ?? DEFAULT_STYLE.headerBg,
    headerText:  fd.header_text  ?? DEFAULT_STYLE.headerText,
    rowOddBg:    fd.row_odd_bg   ?? DEFAULT_STYLE.rowOddBg,
    rowEvenBg:   fd.row_even_bg  ?? DEFAULT_STYLE.rowEvenBg,
    borderColor: fd.border_color ?? DEFAULT_STYLE.borderColor,
  };

  return {
    width,
    height,
    data: rows as Array<Record<string, any>>,
    columns,
    columnLabels,
    queryMode,
    enableHeatmap: fd.enable_heatmap ?? false,
    heatmapColorLow:  fd.heatmap_color_low  ?? DEFAULT_LOW,
    heatmapColorHigh: fd.heatmap_color_high ?? DEFAULT_HIGH,
    heatmapScope: fd.heatmap_scope ?? 'column',
    pageSize: fd.page_size ?? 50,
    tableStyle,
  };
}
