import React, { useState, useMemo, CSSProperties } from 'react';
import { EcdsDataTableProps, HeatmapColor, HeatmapScope } from './types';

const BTN: CSSProperties = {
  padding: '2px 8px',
  border: '1px solid #d9d9d9',
  borderRadius: 4,
  background: '#fafafa',
  cursor: 'pointer',
  fontSize: 11,
  lineHeight: 1.5,
};

function heatBg(ratio: number, scheme: HeatmapColor): string {
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * ratio);
  if (scheme === 'blue')  return `rgb(${lerp(255, 59)},${lerp(255, 130)},${lerp(255, 246)})`;
  if (scheme === 'green') return `rgb(${lerp(255, 34)},${lerp(255, 197)},${lerp(255, 94)})`;
  return `rgb(255,${lerp(255, 80)},${lerp(255, 80)})`;
}

export default function EcdsDataTable({
  width,
  height,
  data,
  columns,
  columnLabels,
  enableHeatmap,
  heatmapColor,
  heatmapScope,
  pageSize,
}: EcdsDataTableProps) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);

  // Pre-compute heatmap ranges based on scope
  const heatRanges = useMemo(() => {
    if (!enableHeatmap) return { colRange: {}, globalRange: null };

    // Collect numeric values per column
    const colVals: Record<string, number[]> = {};
    columns.forEach(col => {
      const vals = data.map(r => Number(r[col])).filter(v => !isNaN(v));
      if (vals.length > 0) colVals[col] = vals;
    });

    // Per-column range (used for scope='column')
    const colRange: Record<string, { min: number; max: number }> = {};
    Object.entries(colVals).forEach(([col, vals]) => {
      const min = Math.min(...vals), max = Math.max(...vals);
      if (min !== max) colRange[col] = { min, max };
    });

    // Global range (used for scope='cell')
    const allVals = Object.values(colVals).flat();
    const globalMin = Math.min(...allVals), globalMax = Math.max(...allVals);
    const globalRange = allVals.length > 0 && globalMin !== globalMax
      ? { min: globalMin, max: globalMax }
      : null;

    return { colRange, globalRange };
  }, [data, columns, enableHeatmap]);

  const filtered = useMemo(() => {
    return data.filter(row =>
      columns.every(col => {
        const f = filters[col];
        return !f || String(row[col] ?? '').toLowerCase().includes(f.toLowerCase());
      }),
    );
  }, [data, filters, columns]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a[sortCol], vb = b[sortCol];
      const na = Number(va), nb = Number(vb);
      const cmp =
        !isNaN(na) && !isNaN(nb)
          ? na - nb
          : String(va ?? '').localeCompare(String(vb ?? ''), 'vi');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = pageSize > 0 ? Math.ceil(sorted.length / pageSize) : 1;
  const paginated = pageSize > 0 ? sorted.slice(page * pageSize, (page + 1) * pageSize) : sorted;

  function toggleSort(col: string) {
    if (sortCol === col) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
      setPage(0);
    }
  }

  function getRowRange(row: Record<string, any>): { min: number; max: number } | null {
    const vals = columns.map(c => Number(row[c])).filter(v => !isNaN(v));
    if (vals.length === 0) return null;
    const min = Math.min(...vals), max = Math.max(...vals);
    return min !== max ? { min, max } : null;
  }

  function getCellBg(
    col: string,
    val: any,
    row: Record<string, any>,
    scope: HeatmapScope,
  ): string | undefined {
    if (!enableHeatmap) return undefined;
    const n = Number(val);
    if (isNaN(n) || val === null || val === '') return undefined;

    let range: { min: number; max: number } | null | undefined;
    if (scope === 'column') {
      range = heatRanges.colRange[col];
    } else if (scope === 'row') {
      range = getRowRange(row);
    } else {
      range = heatRanges.globalRange;
    }

    if (!range) return undefined;
    const ratio = (n - range.min) / (range.max - range.min);
    return heatBg(ratio, heatmapColor);
  }

  const hasFilter = Object.values(filters).some(Boolean);

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontSize: 13,
        color: '#222',
        boxSizing: 'border-box',
      }}
    >
      {/* Scrollable table area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table
          style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}
        >
          <thead>
            {/* Column headers */}
            <tr style={{ background: '#f0f4ff', position: 'sticky', top: 0, zIndex: 2 }}>
              <th
                style={{
                  padding: '7px 10px',
                  textAlign: 'center',
                  borderBottom: '2px solid #dde3f0',
                  color: '#999',
                  fontWeight: 400,
                  fontSize: 11,
                  width: 36,
                }}
              >
                #
              </th>
              {columns.map(col => {
                const active = sortCol === col;
                return (
                  <th
                    key={col}
                    onClick={() => toggleSort(col)}
                    style={{
                      padding: '7px 10px',
                      textAlign: 'left',
                      borderBottom: '2px solid #dde3f0',
                      cursor: 'pointer',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      color: active ? '#1a73e8' : '#555',
                      fontWeight: active ? 700 : 600,
                      fontSize: 12,
                    }}
                  >
                    {columnLabels[col] || col}
                    {' '}
                    {active ? (
                      <span style={{ fontSize: 10 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                    ) : (
                      <span style={{ color: '#ccc', fontSize: 10 }}>⇅</span>
                    )}
                  </th>
                );
              })}
            </tr>

            {/* Filter row */}
            <tr style={{ position: 'sticky', top: 33, zIndex: 2, background: '#fafafa' }}>
              <td style={{ borderBottom: '1px solid #eee' }} />
              {columns.map(col => (
                <td key={col} style={{ padding: '3px 6px', borderBottom: '1px solid #eee' }}>
                  <input
                    value={filters[col] || ''}
                    onChange={e => {
                      setFilters(f => ({ ...f, [col]: e.target.value }));
                      setPage(0);
                    }}
                    placeholder="Lọc..."
                    style={{
                      width: '100%',
                      padding: '2px 6px',
                      border: `1px solid ${filters[col] ? '#1a73e8' : '#ddd'}`,
                      borderRadius: 4,
                      fontSize: 11,
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </td>
              ))}
            </tr>
          </thead>

          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  style={{ textAlign: 'center', padding: 24, color: '#999' }}
                >
                  Không có dữ liệu
                </td>
              </tr>
            ) : (
              paginated.map((row, i) => {
                const globalIdx = page * pageSize + i + 1;
                return (
                  <tr
                    key={i}
                    style={{ background: i % 2 === 0 ? '#fff' : '#fafcff' }}
                    onMouseEnter={e =>
                      ((e.currentTarget as HTMLTableRowElement).style.background = '#f0f4ff')
                    }
                    onMouseLeave={e =>
                      ((e.currentTarget as HTMLTableRowElement).style.background =
                        i % 2 === 0 ? '#fff' : '#fafcff')
                    }
                  >
                    <td
                      style={{
                        padding: '5px 10px',
                        borderBottom: '1px solid #eee',
                        color: '#bbb',
                        fontSize: 11,
                        textAlign: 'center',
                      }}
                    >
                      {globalIdx}
                    </td>
                    {columns.map(col => {
                      const val = row[col];
                      const n = Number(val);
                      const isNum = val !== null && val !== '' && !isNaN(n);
                      const bg = getCellBg(col, val, row, heatmapScope);
                      return (
                        <td
                          key={col}
                          style={{
                            padding: '5px 10px',
                            borderBottom: '1px solid #eee',
                            textAlign: isNum ? 'right' : 'left',
                            fontVariantNumeric: 'tabular-nums',
                            background: bg ?? 'inherit',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isNum ? n.toLocaleString('vi-VN') : String(val ?? '')}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer: row count + pagination */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 10px',
          borderTop: '1px solid #eee',
          fontSize: 11,
          color: '#888',
          flexShrink: 0,
        }}
      >
        <span>
          {sorted.length.toLocaleString('vi-VN')} dòng
          {hasFilter ? ` (lọc từ ${data.length.toLocaleString('vi-VN')})` : ''}
        </span>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button style={BTN} disabled={page === 0} onClick={() => setPage(0)}>
              «
            </button>
            <button style={BTN} disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              ‹
            </button>
            <span style={{ padding: '0 6px' }}>
              Trang {page + 1} / {totalPages}
            </span>
            <button
              style={BTN}
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              ›
            </button>
            <button
              style={BTN}
              disabled={page >= totalPages - 1}
              onClick={() => setPage(totalPages - 1)}
            >
              »
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
