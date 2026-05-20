import { buildQueryContext, QueryFormData } from '@superset-ui/core';

export default function buildQuery(formData: QueryFormData) {
  const fd = formData as any;
  const isRaw = fd.query_mode === 'raw_records';

  return buildQueryContext(formData, baseQueryObject => {
    if (isRaw) {
      // Raw records: select explicit columns, no groupby / metrics
      const allCols: string[] = fd.all_columns ?? [];
      const orderByCols: string[] = fd.order_by_cols ?? [];

      // Parse "col ASC" / "col DESC" strings into [col, asc] tuples
      const orderby = orderByCols.map((s: string) => {
        const parts = s.split(' ');
        const dir = parts.pop()?.toUpperCase();
        return [parts.join(' '), dir !== 'DESC'] as [string, boolean];
      });

      return [
        {
          ...baseQueryObject,
          columns: allCols.length > 0 ? allCols : undefined,
          metrics: [],
          groupby: [],
          orderby: orderby.length > 0 ? orderby : baseQueryObject.orderby,
          row_limit: fd.row_limit ?? 5000,
        },
      ];
    }

    // Aggregate mode: default behaviour
    return [
      {
        ...baseQueryObject,
        row_limit: fd.row_limit ?? 5000,
      },
    ];
  });
}
