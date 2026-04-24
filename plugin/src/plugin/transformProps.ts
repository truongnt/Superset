import { ChartProps, DataRecord, getMetricLabel } from '@superset-ui/core';

import { HelloWorldChartFormData, HelloWorldChartProps } from '../types';

export default function transformProps(chartProps: ChartProps): HelloWorldChartProps {
  const { width, height, queriesData, formData } = chartProps;
  const typedFormData = formData as HelloWorldChartFormData;
  const records = (queriesData[0]?.data ?? []) as DataRecord[];
  const metricLabel = typedFormData.metric
    ? getMetricLabel(typedFormData.metric)
    : 'metric';
  const value =
    records.length > 0 ? (records[0][metricLabel] as number | string | null) : null;

  return {
    width,
    height,
    headerText: typedFormData.headerText || 'Superset Plugin',
    metricLabel,
    value,
  };
}
