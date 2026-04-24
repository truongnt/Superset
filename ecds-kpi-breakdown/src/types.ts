export interface BreakdownItem {
  /** Nhãn hiển thị = giá trị thực tế trong cột breakdown */
  label: string;
  current: number;
  prev: number | null;
}

export interface EcdsKpiBreakdownProps {
  width: number;
  height: number;
  title: string;
  total: number;
  totalPrev: number | null;
  /** Danh sách breakdown động — bao nhiêu loài thì bấy nhiêu phần tử */
  breakdownItems: BreakdownItem[];
  comparisonLabel: string;
  showComparison: boolean;
}
