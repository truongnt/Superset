import { ChartProps } from '@superset-ui/core';
import { EcdsKpiBreakdownProps, BreakdownItem } from '../types';

function metricKey(m: any): string {
  if (!m) return '';
  if (typeof m === 'string') return m;
  if (m.label) return m.label;
  if (m.metric_name) return m.metric_name;
  return String(m);
}

/** Chuyển bất kỳ giá trị nào sang number an toàn (NaN → 0) */
const safeNum = (v: any): number => {
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

/**
 * Tìm tên cột metric trong data rows.
 * Ưu tiên: label từ formData → cột DẠNG SỐ THỰC trong data (typeof === 'number').
 * Loại bỏ cột breakdown để tránh nhầm.
 */
function resolveMetricLabel(
  rawMetrics: any[],
  fd: any,
  data: Array<Record<string, any>>,
  breakdownCol: string | undefined,
): string {
  const fromForm = metricKey(rawMetrics[0] ?? fd.metric);

  if (data.length === 0) return fromForm;

  // Nếu label từ formData tồn tại trong data và là số → dùng luôn
  if (fromForm && fromForm in data[0] && typeof data[0][fromForm] === 'number') {
    return fromForm;
  }

  // Tìm cột mà GIÁ TRỊ LÀ SỐ THỰC (typeof number), loại trừ breakdown column
  const numericKeys = Object.keys(data[0]).filter(k => {
    if (k === breakdownCol) return false;
    // Phải là số thực (không phải string) trong tất cả rows có dữ liệu
    return data.some(row => typeof row[k] === 'number');
  });

  if (numericKeys.length === 1) return numericKeys[0];

  // Nếu nhiều cột số, ưu tiên cột khớp gần với label formData
  if (numericKeys.length > 1 && fromForm) {
    const match = numericKeys.find(
      k => k.toLowerCase().includes(fromForm.toLowerCase()) ||
           fromForm.toLowerCase().includes(k.toLowerCase()),
    );
    if (match) return match;
    return numericKeys[0];
  }

  return fromForm || (numericKeys[0] ?? '');
}

type SortMode = 'value_desc' | 'value_asc' | 'label_asc' | 'label_desc' | 'natural';

function sortItems(items: BreakdownItem[], mode: SortMode): BreakdownItem[] {
  const sorted = [...items];
  switch (mode) {
    case 'value_desc': return sorted.sort((a, b) => b.current - a.current);
    case 'value_asc':  return sorted.sort((a, b) => a.current - b.current);
    case 'label_asc':  return sorted.sort((a, b) => a.label.localeCompare(b.label, 'vi'));
    case 'label_desc': return sorted.sort((a, b) => b.label.localeCompare(a.label, 'vi'));
    default:           return sorted;
  }
}

export default function transformProps(chartProps: ChartProps): EcdsKpiBreakdownProps {
  const { width, height, formData, queriesData } = chartProps;
  const fd = formData as any;

  const currentData = (queriesData[0]?.data ?? []) as Array<Record<string, any>>;
  const prevData    = (queriesData[1]?.data ?? []) as Array<Record<string, any>>;

  const rawMetrics: any[] = fd.metrics ?? [];

  // Superset runtime convert snake_case → camelCase
  const breakdownCol: string | undefined = fd.breakdown_column ?? fd.breakdownColumn;
  const showComparison: boolean = fd.show_comparison ?? fd.showComparison ?? true;
  const sortMode: SortMode = fd.sort_breakdown ?? fd.sortBreakdown ?? 'value_desc';

  // Tìm đúng key metric trong data
  const metricLabel = resolveMetricLabel(rawMetrics, fd, currentData, breakdownCol);

  // ── Aggregate current ───────────────────────────────────────────────────────
  let total = 0;
  const currentByLabel: Record<string, number> = {};
  const labelOrder: string[] = [];

  for (const row of currentData) {
    const val = safeNum(row[metricLabel]);
    total += val;

    if (breakdownCol) {
      const rawLabel = row[breakdownCol];
      // Bỏ qua row nếu giá trị breakdown là null/undefined và metric cũng là 0
      const label = (rawLabel == null || rawLabel === '')
        ? '(trống)'
        : String(rawLabel).trim();
      if (!(label in currentByLabel)) {
        currentByLabel[label] = 0;
        labelOrder.push(label);
      }
      currentByLabel[label] += val;
    }
  }

  // ── Aggregate previous ──────────────────────────────────────────────────────
  let totalPrev: number | null = null;
  const prevByLabel: Record<string, number> = {};

  if (showComparison && prevData.length > 0) {
    totalPrev = 0;
    for (const row of prevData) {
      const val = safeNum(row[metricLabel]);
      (totalPrev as number) += val;
      if (breakdownCol) {
        const rawLabel = row[breakdownCol];
        const label = (rawLabel == null || rawLabel === '')
          ? '(trống)'
          : String(rawLabel).trim();
        prevByLabel[label] = (prevByLabel[label] ?? 0) + val;
      }
    }
  }

  // ── Build breakdown items ───────────────────────────────────────────────────
  const breakdownItems: BreakdownItem[] = breakdownCol
    ? sortItems(
        labelOrder.map(label => ({
          label,
          current: currentByLabel[label] ?? 0,
          prev: totalPrev !== null ? (prevByLabel[label] ?? 0) : null,
        })),
        sortMode,
      )
    : [];

  return {
    width,
    height,
    title: fd.title_text ?? fd.titleText ?? 'Tổng số trường hợp bệnh',
    total,
    totalPrev,
    breakdownItems,
    comparisonLabel: fd.comparison_label ?? fd.comparisonLabel ?? 'cùng kỳ năm trước',
    showComparison,
  };
}
