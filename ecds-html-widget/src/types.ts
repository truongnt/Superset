export interface EcdsHtmlWidgetProps {
  width: number;
  height: number;
  /** Template HTML/JS do user nhập, có chứa {{placeholder}} */
  htmlTemplate: string;
  /** Toàn bộ rows query trả về (dạng mảng object) */
  rows: Array<Record<string, any>>;
  /** Row đầu tiên — dùng cho placeholder đơn giản */
  firstRow: Record<string, any>;
  /** Danh sách metric labels có trong query */
  metricLabels: string[];
  /** Danh sách column names có trong query */
  columnNames: string[];
}
