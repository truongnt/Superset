import { QueryFormData } from '@superset-ui/core';

export interface HelloWorldChartStylesProps {
  height: number;
  width: number;
}

export interface HelloWorldChartFormData extends QueryFormData {
  metric?: string;
  headerText?: string;
}

export type HelloWorldChartProps = HelloWorldChartStylesProps & {
  headerText: string;
  metricLabel: string;
  value: number | string | null;
};
