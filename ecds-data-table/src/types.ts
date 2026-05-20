export type HeatmapColor = 'red' | 'blue' | 'green';
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
  heatmapColor: HeatmapColor;
  heatmapScope: HeatmapScope;
  pageSize: number;
}
