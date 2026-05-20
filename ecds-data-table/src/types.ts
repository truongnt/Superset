export interface RgbColor { r: number; g: number; b: number; a?: number; }
export type HeatmapScope = 'column' | 'row' | 'cell';
export type QueryMode = 'aggregate' | 'raw_records';

export interface EcdsDataTableProps {
  width: number;
  height: number;
  data: Array<Record<string, any>>;
  columns: string[];
  columnLabels: Record<string, string>;
  queryMode: QueryMode;
  enableHeatmap: boolean;
  heatmapColorLow: RgbColor;
  heatmapColorHigh: RgbColor;
  heatmapScope: HeatmapScope;
  pageSize: number;
}
