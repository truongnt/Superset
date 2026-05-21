# Superset Custom Plugin — Dev Notes

Kinh nghiệm tích lũy khi build các ECDS custom plugins. Đọc trước khi bắt đầu plugin mới hoặc debug plugin hiện có.

---

## Architecture tổng quan

Mỗi plugin là một npm package độc lập với 3 file cốt lõi:

```
src/
  index.ts              # export plugin class
  plugin/
    buildQuery.ts       # build SQL query gửi lên Superset backend
    controlPanel.tsx    # định nghĩa control panel (các tùy chọn bên trái)
    transformProps.ts   # nhận ChartProps → trả về props cho component React
  MyComponent.tsx       # React component render chart
  types.ts              # TypeScript interfaces
```

---

## controlPanel.tsx — Những điểm quan trọng

### Override built-in controls (metrics, groupby, adhoc_filters...)

Dùng `override`, **không phải** `config`. Nếu dùng `config` cho built-in control, Superset sẽ không nhận ra và control không hiện.

```tsx
// ĐÚNG
{ name: 'metrics', override: { validators: [], visibility: isAggregate, resetOnHide: false } }
{ name: 'groupby', override: { visibility: isAggregate, resetOnHide: false } }

// SAI — built-in controls không dùng config
{ name: 'metrics', config: { type: 'MetricsControl', visibility: isAggregate } as any }
```

### resetOnHide: false — bắt buộc khi có visibility toggle

Nếu không có `resetOnHide: false`, Superset sẽ xóa giá trị control khi nó bị ẩn (ví dụ: switch mode từ aggregate → raw → aggregate). Luôn thêm vào các control có `visibility`.

### validators: [] trên metrics

Built-in `metrics` control mặc định có validator "required". Khi raw mode không cần metrics, phải bỏ validator này đi:

```tsx
{ name: 'metrics', override: { validators: [], visibility: isAggregate, resetOnHide: false } }
```

### formDataOverrides — bắt buộc dùng getStandardizedControls()

```tsx
import { getStandardizedControls } from '@superset-ui/chart-controls';

formDataOverrides: formData => {
  const isRawMode = (formData as any).query_mode === 'raw_records';
  return {
    ...formData,
    metrics: isRawMode ? [] : getStandardizedControls().popAllMetrics(),
    groupby: isRawMode ? [] : getStandardizedControls().popAllColumns(),
  };
},
```

Nếu chỉ `return formData` mà không gọi `getStandardizedControls()`, Superset pipeline sẽ **strip toàn bộ custom fields** khỏi `formData` — color picker, heatmap, page_size... đều mất hết.

---

## transformProps.ts — rawFormData vs formData

**Luôn đọc custom control values từ `chartProps.rawFormData`, không phải `chartProps.formData`.**

```typescript
export default function transformProps(chartProps: ChartProps) {
  const { width, height, formData, queriesData } = chartProps;
  const rfd = (chartProps as any).rawFormData as any;  // ← custom fields
  const fd = formData as any;                           // ← chỉ dùng cho metrics/groupby

  const queryMode = rfd.query_mode ?? 'aggregate';      // ← rfd
  const enableHeatmap = rfd.enable_heatmap ?? false;    // ← rfd
  // ...

  // metrics/groupby dùng fd vì đã qua getStandardizedControls()
  const groupbyCols = (fd.groupby ?? []).map(...);
  const metricCols = (fd.metrics ?? []).map(...);
}
```

**Tại sao:** `formDataOverrides` xử lý xong, Superset pipeline có thể strip các fields không nằm trong schema chuẩn ra khỏi `formData`. `rawFormData` là bản gốc trước mọi xử lý, luôn có đầy đủ giá trị user đã chọn.

---

## Datetime columns

Superset trả về datetime dưới dạng epoch milliseconds. Để format đúng:

```typescript
import { GenericDataType, getTimeFormatter, TimeFormats } from '@superset-ui/core';

// Từ queriesData[0]
const colnames: string[] = (queryResult as any).colnames ?? [];
const coltypes: GenericDataType[] = (queryResult as any).coltypes ?? [];

const temporalColumns = new Set<string>(
  colnames.filter((_, i) => coltypes[i] === GenericDataType.Temporal),
);

const dateFormatter = getTimeFormatter(TimeFormats.DATABASE_DATETIME);
const data = rows.map(row => {
  const out = { ...row };
  temporalColumns.forEach(col => {
    if (out[col] != null) out[col] = dateFormatter(out[col]);
  });
  return out;
});
```

`GenericDataType.Temporal = 2` — giá trị enum trong `@superset-ui/core`.

---

## CSS trong Superset plugin

### Màu nền ô bảng — đặt trên `<td>`, không phải `<tr>`

CSS `background-color` trên `<tr>` không cascade xuống `<td>` đáng tin cậy trong context của Superset (Ant Design + CSS reset). Phải đặt trực tiếp trên mỗi `<td>`:

```tsx
// ĐÚNG
<td style={{ backgroundColor: cellBg }}>...</td>

// SAI — không chắc ăn
<tr style={{ backgroundColor: rowBg }}>
  <td>...</td>  {/* có thể không nhận màu */}
</tr>
```

### Hover restore với heatmap

Khi có heatmap, mỗi cell có màu riêng. Dùng `data-*` attribute để lưu màu heatmap, restore khi mouseLeave:

```tsx
<td
  data-heat-bg={heatColor ?? ''}
  style={{ backgroundColor: heatColor ?? rowBg }}
>
// onMouseLeave restore:
td.style.backgroundColor = j === 0 ? rowBg : (td.dataset.heatBg || rowBg);
```

---

## ColorPickerControl

```tsx
{
  name: 'header_bg',
  config: {
    type: 'ColorPickerControl',
    label: 'Nền header',
    default: { r: 240, g: 244, b: 255, a: 1 },
    renderTrigger: true,
  },
}
```

Giá trị trả về là `{ r, g, b, a }` — convert sang CSS bằng:

```typescript
function toRgba(c: RgbColor): string {
  return `rgba(${c.r},${c.g},${c.b},${c.a ?? 1})`;
}
```

**Quan trọng:** ColorPickerControl trả về object `RgbColor` — không phải string hex hay CSS color. Đọc từ `rawFormData`.

---

## Export Excel (xlsx / SheetJS)

```typescript
import * as XLSX from 'xlsx';

function downloadExcel() {
  const headers = columns.map(col => columnLabels[col] || col);
  const wsData = [
    headers,
    ...sorted.map(row =>
      columns.map(col => {
        const val = row[col];
        if (!temporalColumns.has(col) && val !== null && val !== '' && !isNaN(Number(val))) {
          return Number(val);  // export số thực, không phải string
        }
        return val ?? '';
      }),
    ),
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, 'export.xlsx');
}
```

`xlsx` cần có trong `node_modules` của Superset frontend (hoặc plugin's own deps). Superset 2.x/3.x thường đã có sẵn. Nếu không, thêm vào `dependencies` trong plugin's `package.json` và install trong Superset frontend.

---

## buildQuery.ts — Raw vs Aggregate

```typescript
export default function buildQuery(formData: any) {
  const { query_mode, all_columns = [], row_limit } = formData;

  if (query_mode === 'raw_records') {
    return buildQueryContext(formData, params => [{
      ...params[0],
      columns: all_columns,
      metrics: [],
      groupby: [],
      row_limit: row_limit ?? 1000,
    }]);
  }

  // aggregate — dùng mặc định
  return buildQueryContext(formData);
}
```

---

## Các import hay dùng

```typescript
// Core
import { ChartProps, DataRecord, getMetricLabel, GenericDataType, getTimeFormatter, TimeFormats } from '@superset-ui/core';

// Controls
import { ControlPanelConfig, sections, getStandardizedControls } from '@superset-ui/chart-controls';

// Query
import { buildQueryContext } from '@superset-ui/core';
```

---

## Checklist khi tạo plugin mới

- [ ] `formDataOverrides` gọi `getStandardizedControls().popAllMetrics()` và `.popAllColumns()`
- [ ] `transformProps` đọc custom fields từ `rawFormData`, không phải `formData`
- [ ] Built-in controls dùng `override:`, custom controls dùng `config:`
- [ ] Controls có `visibility` đều có `resetOnHide: false`
- [ ] `metrics` override có `validators: []` nếu không muốn required
- [ ] Màu nền set trực tiếp trên `<td>`, không phải `<tr>`
- [ ] Datetime columns format trước khi đưa vào component
- [ ] `renderTrigger: true` cho controls chỉ ảnh hưởng render (không cần re-query)
- [ ] `renderTrigger: false` cho controls ảnh hưởng query (metrics, groupby, filters...)
