// File này không còn dùng — cột bản đồ nay dùng SelectAsyncControl với mapStateToProps
// Kept as empty export to avoid breaking existing imports.
/*
 * Custom control component: dropdown cột của một dataset phụ (secondary datasource).
 * Tự fetch /api/v1/dataset/{datasetId} khi datasetId thay đổi.
 * Dùng trong controlPanel với type: DatasetColumnSelect.
 */
import React, { useEffect, useState } from 'react';

export interface DatasetColumnSelectProps {
  // Giá trị control (Superset truyền vào)
  value: string;
  onChange: (value: string) => void;
  // Từ mapStateToProps
  datasetId?: string | number | null;
  default?: string;
  // Hiển thị
  label?: string;
  description?: string;
  placeholder?: string;
}

const DatasetColumnSelect: React.FC<DatasetColumnSelectProps> = ({
  value,
  onChange,
  datasetId,
  placeholder = 'Chọn cột…',
}) => {
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!datasetId) {
      setColumns([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const csrf = document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? '';
    const headers: Record<string, string> = {};
    if (csrf) headers['X-CSRFToken'] = csrf;

    fetch(`/api/v1/dataset/${datasetId}`, { credentials: 'same-origin', headers })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const cols: string[] = (data.result?.columns ?? [])
          .map((c: any) => c.column_name as string)
          .sort();
        setColumns(cols);
      })
      .catch(() => { if (!cancelled) setColumns([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [datasetId]);

  const style: React.CSSProperties = {
    width: '100%',
    padding: '4px 8px',
    border: '1px solid #d9d9d9',
    borderRadius: 4,
    background: '#fff',
    fontSize: 13,
    cursor: !datasetId || loading ? 'not-allowed' : 'pointer',
    color: !datasetId ? '#bbb' : '#000',
  };

  // Nếu value hiện tại không có trong danh sách → vẫn hiển thị như option
  const showCustom = !!value && columns.length > 0 && !columns.includes(value);

  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      style={style}
      disabled={!datasetId || loading}
    >
      <option value="">
        {!datasetId
          ? '— Chọn dataset trước —'
          : loading
          ? 'Đang tải cột…'
          : placeholder}
      </option>
      {columns.map(col => (
        <option key={col} value={col}>{col}</option>
      ))}
      {showCustom && (
        <option value={value}>{value} (tùy chỉnh)</option>
      )}
    </select>
  );
};

export default DatasetColumnSelect;
