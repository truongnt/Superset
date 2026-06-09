import { buildQueryContext, QueryFormData } from '@superset-ui/core';

export default function buildQuery(formData: QueryFormData) {
  const fd = formData as any;

  const sortCols: string[] = fd.ecds_sort_cols ?? [];
  const orderby: [string, boolean][] = sortCols.map((s: string) => {
    const parts = s.split(' ');
    const dir = parts.pop()?.toUpperCase();
    return [parts.join(' '), dir !== 'DESC'];
  });

  return buildQueryContext(formData, baseQueryObject => [
    {
      ...baseQueryObject,
      row_limit: fd.row_limit ?? 1000,
      orderby: orderby.length > 0 ? orderby : [],
    },
  ]);
}
