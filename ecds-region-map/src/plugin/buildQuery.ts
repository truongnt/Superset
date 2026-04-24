import { buildQueryContext } from '@superset-ui/core';
import { EcdsRegionMapFormData } from '../types';

export default function buildQuery(formData: EcdsRegionMapFormData) {
  const fd = formData as any;
  const regionIdCol: string      = fd.region_id_column       ?? fd.regionIdColumn      ?? '';
  const regionDrillIdCol: string = fd.region_drill_id_column ?? fd.regionDrillIdColumn ?? '';
  const metrics: any[] = fd.metrics ?? [];

  // Không override time_range — để buildQueryContext tự merge:
  //   extra_form_data.time_range (dashboard native filter)  ← ưu tiên cao hơn
  //   formData.time_range (adhoc filter / time range trong edit chart)
  // Sau khi re-save chart, formData.time_range sẽ không còn giá trị stale cũ.

  // Nếu chưa cấu hình cột mã vùng → trả query tối thiểu để không gây lỗi
  if (!regionIdCol || metrics.length === 0) {
    return buildQueryContext(formData, baseQueryObject => [
      { ...baseQueryObject, columns: [], metrics: [], row_limit: 1 },
    ]);
  }

  // Thêm regionDrillIdCol + timelapse_time_column vào columns nếu được cấu hình
  // → transformProps mới có data để build metricByDrillCode và dataByTime
  const timelapseCol: string = fd.timelapse_time_column ?? fd.timelapseTimeColumn ?? '';
  const columns = Array.from(
    new Set([regionIdCol, regionDrillIdCol, timelapseCol].filter(Boolean)),
  );

  return buildQueryContext(formData, baseQueryObject => [
    {
      ...baseQueryObject,
      columns,
      metrics,
      row_limit: fd.row_limit ?? 10000,
    },
  ]);
}
