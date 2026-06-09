import { QueryFormData, supersetTheme, ChartProps } from '@superset-ui/core';

export interface EcdsRegionMapFormData extends QueryFormData {
  // ── Metric datasource (primary, gắn với chart) ─────────────
  region_id_column: string;        // cột mã tỉnh trong data dataset (join map cấp tỉnh)
  region_name_column?: string;     // cột tên tỉnh trong data dataset (cho filter theo tên)
  region_drill_id_column: string;  // cột mã xã trong data dataset (join map cấp xã)
  region_drill_name_column?: string; // cột tên xã trong data dataset (cho filter theo tên)
  metrics: any[];

  // ── Map datasource (secondary, fetch qua REST API) ─────────
  map_dataset_id: string;         // ID dataset bản đồ trên Superset
  map_id_column: string;          // cột PK/UUID của đơn vị hành chính (để xã reference qua parent_id)
  map_code_column: string;        // cột mã tỉnh (join với region_id_column), vd: province_code
  map_drill_code_column: string;  // cột mã xã (join với region_drill_id_column), vd: commune_code
  map_name_column: string;        // cột tên hiển thị, vd: name
  map_geojson_column: string;     // cột chứa Polygon/MultiPolygon, vd: boundary
  map_level_column: string;       // cột level, vd: level
  map_parent_id_column: string;   // cột parent_id (UUID), vd: parent_id
  map_top_level: string;          // giá trị level của tỉnh, vd: "2"
  map_drill_level: string;        // giá trị level của xã, vd: "3"

  // ── Display ────────────────────────────────────────────────
  linear_color_scheme: string;
  enable_drilldown: boolean;
}

/** Một vùng đã parse, dùng nội bộ trong component */
export interface MapUnit {
  id: string;           // giá trị cột map_id_column (UUID) — dùng để link tỉnh-xã qua parent_id
  code: string;         // giá trị cột map_code_column (join với metric)
  name: string;
  level: number;
  parentId: string | null;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any };
  props: Record<string, any>;
}

/** Dữ liệu metric cho một mốc thời gian (dùng trong timelapse) */
export interface TimeStepData {
  byCode:      Record<string, number>;  // mã tỉnh → metric
  byDrillCode: Record<string, number>;  // mã xã   → metric
}

export interface EcdsRegionMapProps {
  width: number;
  height: number;

  // ── Metric data từ primary datasource ─────────────────────
  metricByCode: Record<string, number>;      // mã tỉnh → giá trị
  metricByDrillCode: Record<string, number>; // mã xã   → giá trị
  queriedProvinceCodes: string[];            // mã tỉnh từ data rows khi có filter vùng (rỗng = không filter)
  queriedProvinceNames: string[];            // tên tỉnh từ native filter theo cột tên (để lọc bản đồ khi data rỗng)
  queriedCommuneCodes: string[];             // mã xã từ native filter theo cột mã (rỗng = không filter)
  queriedCommuneNames: string[];             // tên xã từ native filter theo cột tên (rỗng = không filter)
  metricName: string;
  metricNames: string[];                                          // tất cả metric labels
  allMetricsByCode:      Record<string, Record<string, number>>; // mã tỉnh → {metricLabel → value}
  allMetricsByDrillCode: Record<string, Record<string, number>>; // mã xã   → {metricLabel → value}
  adhocProvinceCodes: string[];  // mã tỉnh từ adhoc/extra filter (chỉ dùng để detect auto-drill)
  adhocProvinceNames: string[];  // tên tỉnh từ adhoc/extra filter (chỉ dùng để detect auto-drill)

  // ── Timelapse ──────────────────────────────────────────────
  timelapseEnabled: boolean;
  timeSteps: string[];                       // danh sách mốc thời gian đã sort
  dataByTime: Record<string, TimeStepData>;  // mốc → metric data
  stepTotals: number[];                      // tổng metric mỗi mốc (cho epi curve)
  timelapseSpeed: number;                    // ms/bước
  globalMetricMin: number;                   // min xuyên suốt tất cả mốc (cho color scale nhất quán)
  globalMetricMax: number;

  // ── Map config ────────────────────────────────────────────
  mapDatasetId: number;
  mapIdColumn: string;         // cột PK/UUID trong map dataset (dùng để link tỉnh↔xã qua parent_id)
  mapCodeColumn: string;       // cột mã tỉnh trong map dataset (join với metricByCode)
  mapDrillCodeColumn: string;  // cột mã xã trong map dataset (fallback = mapCodeColumn)
  mapNameColumn: string;
  mapGeojsonColumn: string;
  mapLevelColumn: string;
  mapParentIdColumn: string;
  mapTopLevel: number;
  mapDrillLevel: number;

  colorScheme: string;
  noDataColor: string;
  mapBorderWidth: number;       // độ dày đường ranh giới cấp tỉnh (cấp xã = /3)
  enableDrilldown: boolean;
  startAtDrillLevel: boolean;   // hiển thị cấp xã ngay từ đầu (không cần click)
  theme: typeof supersetTheme;
}

export type EcdsRegionMapChartProps = ChartProps & {
  formData: EcdsRegionMapFormData;
};
