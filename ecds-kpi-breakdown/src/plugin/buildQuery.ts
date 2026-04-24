import { buildQueryContext, QueryFormData } from '@superset-ui/core';

export default function buildQuery(formData: QueryFormData) {
  const fd = formData as any;
  const breakdownCol: string | undefined = fd.breakdown_column;
  const dateCol: string | undefined = fd.date_column;
  const showComparison: boolean = fd.show_comparison ?? true;

  // Query 0: dữ liệu kỳ hiện tại (áp dụng time_range từ filter)
  // Query 1: dữ liệu cùng kỳ năm trước (time_range dịch lùi 1 năm)
  return buildQueryContext(formData, baseQueryObject => {
    const currentQuery = {
      ...baseQueryObject,
      columns: breakdownCol ? [breakdownCol] : [],
      metrics: (formData.metrics ?? []),
      // Giữ nguyên filters + time_range của user
    };

    if (!showComparison || !dateCol) {
      return [currentQuery];
    }

    // Tạo query năm trước bằng cách shift time_range lùi 1 năm
    const timeRange: string = (formData as any).time_range ?? 'No filter';
    const prevTimeRange = shiftTimeRangeOneYear(timeRange);

    const prevQuery = {
      ...baseQueryObject,
      columns: breakdownCol ? [breakdownCol] : [],
      metrics: (formData.metrics ?? []),
      time_range: prevTimeRange,
      // Loại bỏ time_range filter trong adhoc_filters để tránh conflict
      filters: (baseQueryObject.filters ?? []).filter(
        (f: any) => f.col !== '__time_range',
      ),
    };

    return [currentQuery, prevQuery];
  });
}

/**
 * Dịch time_range lùi 1 năm.
 * Hỗ trợ format "YYYY-MM-DD : YYYY-MM-DD" và các preset phổ biến.
 */
function shiftTimeRangeOneYear(timeRange: string): string {
  if (!timeRange || timeRange === 'No filter') return timeRange;

  // Format: "YYYY-MM-DD : YYYY-MM-DD" hoặc "YYYY-MM-DDTHH:mm:ss : YYYY-MM-DDTHH:mm:ss"
  const parts = timeRange.split(' : ');
  if (parts.length === 2) {
    const shiftDate = (dateStr: string) => {
      const d = new Date(dateStr.trim());
      if (!isNaN(d.getTime())) {
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().slice(0, 10);
      }
      return dateStr;
    };
    return `${shiftDate(parts[0])} : ${shiftDate(parts[1])}`;
  }

  // Preset: "Last year", "Previous year", v.v. — để nguyên, Superset tự xử lý
  return timeRange;
}
