import { QueryFormData, ChartProps } from '@superset-ui/core';

export interface PointSegment {
  label: string;
  value: number;
  color: string;
}

export interface MapPoint {
  lat: number;
  lng: number;
  total: number;
  segments: PointSegment[];
  label: string;
  provinceCode: string;  // giá trị cột region_id_column — dùng để lọc khi drill
}

export interface EcdsPointMapProps {
  width: number;
  height: number;

  // Bản đồ nền
  mapDatasetId: number | null;
  mapIdColumn: string;
  mapCodeColumn: string;
  mapNameColumn: string;
  mapGeojsonColumn: string;
  mapLevelColumn: string;
  mapParentIdColumn: string;
  mapTopLevel: number;
  mapDrillLevel: number;
  mapFillColor: string;
  mapStrokeColor: string;
  mapBorderWidth: number;
  enableDrilldown: boolean;
  startAtDrillLevel: boolean;
  queriedProvinceCodes: string[];
  queriedProvinceNames: string[];
  queriedCommuneCodes: string[];

  // Điểm
  points: MapPoint[];
  hasMetric: boolean;
  hasGroupby: boolean;
  pointColor: string;
  pointSizeMin: number;
  pointSizeMax: number;
  metricName: string;
  groupbyName: string;
  labelColorMap: Record<string, string>;

  // Timelapse
  timelapseEnabled: boolean;
  timeSteps: string[];
  pointsByTime: Record<string, MapPoint[]>;   // mốc thời gian → danh sách điểm
  stepTotals: number[];                       // tổng ca mỗi mốc (cho epi curve)
  timelapseSpeed: number;                     // ms/bước
  globalPointMin: number;                     // min tổng xuyên suốt tất cả mốc (bubble scale nhất quán)
  globalPointMax: number;
}

export interface EcdsPointMapFormData extends QueryFormData {
  lat_column: string;
  lng_column: string;
  label_column?: string;
  metrics?: any[];
  groupby?: any[];

  map_dataset_id?: string;
  map_id_column?: string;
  map_name_column?: string;
  map_geojson_column?: string;
  map_level_column?: string;
  map_parent_id_column?: string;
  map_top_level?: string;
  map_drill_level?: string;
  map_fill_color?: string;
  map_stroke_color?: string;
  enable_drilldown?: boolean;

  point_color?: string;
  point_size_min?: number;
  point_size_max?: number;
}

export type EcdsPointMapChartProps = ChartProps & {
  formData: EcdsPointMapFormData;
};
