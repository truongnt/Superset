export interface RgbColor { r: number; g: number; b: number; a?: number; }
export type HeatmapScope = 'column' | 'row' | 'cell';
export type QueryMode = 'aggregate' | 'raw_records';

export interface TableStyle {
  headerBg: RgbColor;
  headerText: RgbColor;
  rowOddBg: RgbColor;
  rowEvenBg: RgbColor;
  borderColor: RgbColor;
}

export interface EcdsDataTableProps {
  width: number;
  height: number;
  data: Array<Record<string, any>>;
  columns: string[];
  columnLabels: Record<string, string>;
  temporalColumns: Set<string>;
  queryMode: QueryMode;
  enableHeatmap: boolean;
  heatmapColorLow: RgbColor;
  heatmapColorHigh: RgbColor;
  heatmapScope: HeatmapScope;
  pageSize: number;
  tableStyle: TableStyle;
}
