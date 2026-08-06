import { buildQueryContext, QueryFormData } from '@superset-ui/core';

export default function buildQuery(formData: QueryFormData) {
  const fd = formData as any;
  const isRaw = fd.query_mode === 'raw_records';

  return buildQueryContext(formData, baseQueryObject => {
    if (isRaw) {
      // Raw records: select explicit columns, no groupby / metrics.
      // Superset's own backend GROUP BYs every selected column whenever
      // metrics is empty (confirmed via a chart's "View query" output) —
      // rows that match on every DISPLAYED column silently collapse into
      // one, even if they're genuinely different records. row_id_column
      // is always folded into the query (whether or not the chart author
      // also chose to display it) so the GROUP BY can never merge two
      // distinct rows.
      const allCols: string[] = fd.all_columns ?? [];
      const rowIdCol: string | undefined = fd.row_id_column || undefined;
      const queryCols =
        rowIdCol && !allCols.includes(rowIdCol) ? [rowIdCol, ...allCols] : allCols;
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
          columns: queryCols.length > 0 ? queryCols : undefined,
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
