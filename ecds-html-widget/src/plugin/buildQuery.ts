import { buildQueryContext, QueryFormData } from '@superset-ui/core';

export default function buildQuery(formData: QueryFormData) {
  return buildQueryContext(formData, baseQueryObject => [
    {
      ...baseQueryObject,
      // groupby đã được controlPanel cấu hình qua 'groupby' control chuẩn
      // metrics được lấy từ 'metrics' control chuẩn
      row_limit: (formData as any).row_limit ?? 1000,
    },
  ]);
}
