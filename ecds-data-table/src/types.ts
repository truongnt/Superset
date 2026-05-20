export type HeatmapColor = 'red' | 'blue' | 'green';
export type HeatmapScope = 'column' | 'row' | 'cell';

export interface EcdsDataTableProps {
  width: number;
  height: number;
  data: Array<Record<string, any>>;
  columns: string[];
  columnLabels: Record<string, string>;
  enableHeatmap: boolean;
  heatmapColor: HeatmapColor;
  heatmapScope: HeatmapScope;
  pageSize: number;
}
