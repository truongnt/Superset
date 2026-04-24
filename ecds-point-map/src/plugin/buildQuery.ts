import { buildQueryContext } from '@superset-ui/core';
import { EcdsPointMapFormData } from '../types';

export default function buildQuery(formData: EcdsPointMapFormData) {
  const fd = formData as any;

  const latCol: string = fd.lat_column  ?? fd.latColumn  ?? '';
  const lngCol: string = fd.lng_column  ?? fd.lngColumn  ?? '';
  const lblCol: string = fd.label_column ?? fd.labelColumn ?? '';

  const groupbyCols: string[] = (fd.groupby ?? []).map((c: any) =>
    typeof c === 'string' ? c : (c.column_name ?? String(c)),
  );

  const metrics: any[] = fd.metrics ?? [];

  // Không override time_range — để buildQueryContext tự merge:
  //   extra_form_data.time_range (dashboard native filter)  ← ưu tiên cao hơn
  //   formData.time_range (adhoc filter / time range trong edit chart)
  // Sau khi re-save chart, formData.time_range sẽ không còn giá trị stale cũ.

  // Nếu chưa cấu hình cột lat/lng → trả query tối thiểu để Superset không lỗi
  if (!latCol || !lngCol) {
    return buildQueryContext(formData, baseQueryObject => [
      { ...baseQueryObject, columns: [], metrics: [], row_limit: 1 },
    ]);
  }

  const regionIdCol: string   = fd.region_id_column      ?? fd.regionIdColumn      ?? '';
  const regionDrillCol: string = fd.region_drill_id_column ?? fd.regionDrillIdColumn ?? '';

  const timelapseCol: string = fd.timelapse_time_column ?? fd.timelapseTimeColumn ?? '';
  const columns = Array.from(
    new Set([latCol, lngCol, lblCol, regionIdCol, regionDrillCol, timelapseCol, ...groupbyCols].filter(Boolean)),
  );

  return buildQueryContext(formData, baseQueryObject => [
    {
      ...baseQueryObject,
      columns,
      metrics,
      groupby: undefined,
      row_limit: fd.row_limit ?? 50000,
    },
  ]);
}
