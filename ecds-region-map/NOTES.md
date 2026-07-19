# ECDS Region Map — Ghi chú kỹ thuật

> Cập nhật lần cuối: 2026-04-21  
> Plugin: Custom Superset choropleth map cho đơn vị hành chính Việt Nam

---

## 1. Tổng quan kiến trúc

Plugin dùng **2 datasource**:

| Datasource | Vai trò | Cách truy cập |
|---|---|---|
| **Primary** (chart dataset) | Số liệu metric theo mã tỉnh / mã xã | Superset query engine (buildQuery) |
| **Secondary** (map dataset) | Ranh giới GeoJSON, cấu trúc hành chính | REST API `/api/v1/chart/data` qua `SupersetClient` |

`SupersetClient` được dùng thay `fetch` thuần để hỗ trợ **guest token** trong embedded dashboard.

---

## 2. Cấu trúc file

```
ecds-region-map/
├── src/
│   ├── RegionMap.tsx          # Component chính (render SVG, drill logic, zoom/pan)
│   ├── types.ts               # Interface: EcdsRegionMapProps, MapUnit, FormData
│   ├── index.ts               # Entry point
│   └── plugin/
│       ├── index.ts           # Plugin registration
│       ├── buildQuery.ts      # Xây dựng SQL query cho primary datasource
│       ├── transformProps.ts  # Chuyển đổi chartProps → component props
│       └── controlPanel.tsx   # UI cấu hình chart trong Superset
├── package.json
└── plugin.meta.json
```

Ranh giới GeoJSON không còn được ship kèm plugin dưới dạng file tĩnh (`maps/`) — toàn bộ lấy
từ secondary map dataset qua REST API như mục 1 mô tả. Thư mục `maps/` cũ đã bị xóa.

---

## 3. Yêu cầu kịch bản (7 scenarios)

| # | Điều kiện filter | Bản đồ hiển thị | Dữ liệu load |
|---|---|---|---|
| 1 | Không filter | Toàn bộ tỉnh/thành | Tất cả tỉnh |
| 2 | Filter **1 tỉnh** | Drill down → xã của tỉnh đó | Cấp xã của tỉnh đó |
| 3 | Filter **2+ tỉnh** | 2+ tỉnh đó | Cấp tỉnh của các tỉnh đó |
| 4 | Filter **1 xã** | Xã của tỉnh chứa xã đó | Cấp xã (xã đó) |
| 5 | Filter **2+ xã cùng 1 tỉnh** | Tất cả xã của tỉnh đó | Cấp xã (các xã được filter) |
| 6 | Filter **2+ xã cùng 1 tỉnh** (>=2 xã) | Tất cả xã của tỉnh đó | Cấp xã của các xã được filter |
| 7 | Filter **2+ xã của 2+ tỉnh khác nhau** | Xã của tất cả tỉnh liên quan | Cấp xã (các xã được filter) |

> **Ghi chú**: Kịch bản 5 và 6 giống nhau về mô tả; kịch bản 7 là trường hợp đặc biệt khi xã thuộc nhiều tỉnh.

---

## 4. Logic drill-down (RegionMap.tsx)

### MapUnit — cấu trúc dữ liệu nội bộ
```
id       — giá trị cột map_id_column (UUID/PK) — dùng để link tỉnh↔xã qua parent_id
code     — giá trị cột map_code_column (mã tỉnh) hoặc map_drill_code_column (mã xã)
           → dùng để join với metricByCode / metricByDrillCode từ primary datasource
parentId — UUID của tỉnh cha (từ map_parent_id_column) — khớp với province.id (UUID)
```

### Các state chính
```
drillId   — id (UUID) của tỉnh đang drill; null = đang ở cấp tỉnh
drillCode — code (mã tỉnh) của tỉnh đó (để fallback metric khi xã không có data)
shouldShowAllCommunes — true khi xã filter thuộc > 1 tỉnh (kịch bản 7)
```

### activeUnits — đơn vị được vẽ lên bản đồ
```
drillId ≠ null               → drillMap[drillId]        (xã của tỉnh đang drill)
startAtDrillLevel = true     → filteredDrillUnits        (xã của tỉnh đang filter)
shouldShowAllCommunes = true → filteredDrillUnits        (xã của tất cả tỉnh filter)
còn lại                      → filteredTopUnits          (tỉnh đang filter hoặc tất cả)
```

### Auto-drill logic (3 useEffect)
1. **Province auto-drill**: `filteredTopUnits.length === 1` → tự động drill vào tỉnh đó
2. **Commune auto-drill**: `queriedCommuneCodes` thuộc đúng 1 tỉnh → tự động drill vào tỉnh đó
3. **Reset drill khi multi-province communes**: `shouldShowAllCommunes = true` → reset `drillId` về null

`lastAutodrillRef` ngăn re-drill sau khi user bấm nút "← Back" (drill thủ công).

### activeMetric — dữ liệu tô màu
```
Đang ở cấp xã (drillId/startAtDrillLevel/shouldShowAllCommunes)
  → metricByDrillCode  nếu có data cấp xã
  → metricByCode       nếu không có data cấp xã (fallback màu theo tỉnh cha)
Đang ở cấp tỉnh
  → metricByCode
```

---

## 5. Cấu hình columns (controlPanel)

### Primary datasource (số liệu)
| Control | Ý nghĩa |
|---|---|
| `region_id_column` | Cột mã tỉnh trong data → join với `map_code_column` |
| `region_name_column` | Cột tên tỉnh trong data → dùng khi native filter theo tên tỉnh (để trống nếu filter theo mã) |
| `region_drill_id_column` | Cột mã xã trong data → join với `map_drill_code_column` |
| `region_drill_name_column` | Cột tên xã trong data → dùng khi native filter theo tên xã (để trống nếu filter theo mã) |
| `metrics` | Metric muốn hiển thị (tổng theo vùng) |

### Secondary datasource (bản đồ)
| Control | Ý nghĩa |
|---|---|
| `map_dataset_id` | ID dataset bản đồ trên Superset |
| `map_id_column` | PK/UUID của tỉnh → dùng làm `MapUnit.id`, xã reference qua `parent_id`. Mặc định `"id"` |
| `map_code_column` | Mã tỉnh → dùng làm `MapUnit.code`, join với `region_id_column` (data). Thường là `"province_code"` |
| `map_drill_code_column` | Mã xã → join với `region_drill_id_column` |
| `map_name_column` | Tên hiển thị trong tooltip |
| `map_geojson_column` | Cột chứa Polygon/MultiPolygon |
| `map_level_column` | Cột phân biệt cấp tỉnh/xã |
| `map_parent_id_column` | Cột parent_id (xã → tỉnh cha) |
| `map_top_level` | Giá trị level của cấp tỉnh (vd: `2`) |
| `map_drill_level` | Giá trị level của cấp xã (vd: `3`) |

---

## 6. Native filter support

Plugin hỗ trợ 3 loại native filter dashboard:

| Loại filter | Cột target | Ghi chú |
|---|---|---|
| **Time filter** | `time_range` hoặc cột date | Tự động qua `buildQueryContext`; **không** trigger province/commune logic |
| **Province filter theo tên** | `region_name_column` | Phải cấu hình `region_name_column` trong chart settings |
| **Province filter theo mã** | `region_id_column` | Mặc định |
| **Commune filter theo tên** | `region_drill_name_column` | Phải cấu hình `region_drill_name_column` trong chart settings |
| **Commune filter theo mã** | `region_drill_id_column` | Mặc định |

**`isAnyRegionFilter`**: Check filter `IN`/`==` trên bất kỳ cột nào trong 4 cột vùng (`regionIdCol`, `regionNameCol`, `regionDrillIdCol`, `regionDrillNameCol`). Time filter và filter cột khác **không** trigger. Phải check cả commune column vì `filteredDrillUnits` (dùng cho `shouldShowAllCommunes`) phụ thuộc vào `filteredTopUnits`.

**`filteredTopUnits` — 3 bước lọc bản đồ**:
1. Khớp qua `metricByCode` (data rows đã được SQL filter — hoạt động cho cả filter theo mã lẫn tên)
2. Fallback: so sánh `queriedProvinceCodes` (mã tỉnh từ data rows) với `code`/`id`/`name` của map unit
3. Fallback theo tên: so sánh `queriedProvinceNames` (từ filter trực tiếp) với `u.name.toLowerCase()` — dùng khi data rỗng (khoảng thời gian không có số liệu) nhưng filter tỉnh vẫn active

**`communeNameToProvinceId`**: Lookup tên xã (lowercase) → province ID, build từ map dataset. Kết hợp với `communeCodeToProvinceId` vào `resolvedCommuneProvinceIds` → dùng cho `shouldShowAllCommunes` và commune auto-drill.

**Lưu ý**: Map dataset (secondary) luôn được fetch đầy đủ một lần qua REST API. Toàn bộ filter chỉ xử lý client-side trên dữ liệu đã load — không gửi thêm request API khi filter thay đổi.

---

## 7. Bugs đã fix

### [2026-04-21] drillId không reset khi chuyển sang kịch bản 7
**Vấn đề**: Khi đang drill vào tỉnh P1 (`drillId = P1`), nếu filter thêm xã của tỉnh P2:
- `shouldShowAllCommunes` trở thành `true`
- Province auto-drill bail sớm vì check `shouldShowAllCommunes`
- Commune auto-drill bail sớm vì check `drillId`
- → `drillId` bị giữ nguyên là P1 → bản đồ vẫn chỉ show xã P1 thay vì xã của cả P1+P2

**Fix**: Thêm `useEffect` riêng theo dõi `shouldShowAllCommunes`:
```ts
useEffect(() => {
  if (shouldShowAllCommunes && drillId !== null) {
    lastAutodrillRef.current = null;
    setDrillId(null);
    setDrillCode(null);
    setDrillName('');
  }
}, [shouldShowAllCommunes]);
```

### [2026-04-21] map_id_column bị xóa nhầm → filteredTopUnits không match được
**Vấn đề**: Khi xóa `map_id_column` và dùng `mapCodeColumn` làm cả UUID lẫn province code,
`map_code_column` trong dataset thực tế trỏ vào cột UUID — dẫn đến:
- `u.code = UUID` (e.g., `87bdd973-fba6-411b-8ded-119a4962408f`)
- `metricByCode` được key bởi province code (e.g., `"01"`, `"02"`)
- Step 1 `metricByCode[u.code]` = `metricByCode[UUID]` → không match → `filteredTopUnits` luôn trả về tất cả 34 tỉnh → không auto-drill.

**Fix**: Restore `map_id_column` với vai trò rõ ràng:
```
id   = row[mapIdColumn]   → UUID, dùng cho parent_id reference (drill link)
code = row[mapCodeColumn] → province code, dùng join với metricByCode từ data
```
Cần cấu hình đúng trong Superset:
- **Cột ID tỉnh (PK)**: `id` (hoặc tên cột UUID trong bảng `units`)
- **Cột mã tỉnh (join với data)**: `province_code` (hoặc tên cột mã tỉnh thực tế)

---

## 8. Superset formData — camelCase vs snake_case

> **Quan sát quan trọng**: Superset truyền `formData` vào `transformProps` ở dạng **camelCase**, không phải snake_case. Đây là nguồn gốc của nhiều bug âm thầm.

| snake_case (trong Superset DB / config) | camelCase (trong formData JS) |
|---|---|
| `extra_form_data` | `extraFormData` |
| `adhoc_filters` | `adhocFilters` |
| `extra_filters` | `extraFilters` |
| `time_range` | `timeRange` |
| `region_id_column` | `regionIdColumn` |

**Quy tắc**: Luôn check camelCase trước, snake_case làm fallback:
```ts
fd.extraFormData ?? fd.extra_form_data
fd.adhocFilters  ?? fd.adhoc_filters
```

**So sánh với ecds-html-widget**: HTML widget không cần detect filter thủ công vì nó chỉ render data trả về từ server — `buildQueryContext` đã tự merge toàn bộ filter vào SQL query. Region map cần detect filter client-side vì phải quyết định:
1. Tỉnh nào được vẽ trên bản đồ (`filteredTopUnits`)
2. Có auto-drill không (khi filter 1 tỉnh)
3. Tên tỉnh nào highlight khi data rỗng (filter theo tên tỉnh nhưng không có số liệu trong khoảng thời gian)

SQL data (`metricByCode`) luôn đúng vì `buildQueryContext` xử lý filter. `hasAnyValueFilter` chỉ để phân biệt "34 tỉnh đều có data tự nhiên" với "filter xuống còn N tỉnh".

---

## 9. Lưu ý khi phát triển thêm

- **Embedded dashboard**: Luôn dùng `SupersetClient` (không dùng `fetch` thẳng) để tự động đính kèm guest token.
- **GeoJSON join key**: `communeCodeToProvinceId` map cả `c.id` lẫn `c.code` → `regionDrillIdCol` phải khớp với một trong hai.
- **Date filter**: `hasAnyValueFilter` detect `IN`/`==` bất kỳ trong `extraFormData.filters`, `adhocFilters`, `extraFilters` → không nhầm với time filter (op `TEMPORAL_RANGE`/`>=`/`<=`).
- **Row limit**: Mặc định `10000` cho primary datasource; map dataset fetch tối đa `200000` rows.
- **Projection**: Dùng Mercator đơn giản tự viết (không dùng D3/Leaflet) để tránh dependency nặng.
- **Docker rebuild**: Khi thay đổi plugin source, chạy `docker compose build --no-cache superset` — không dùng `--build` thông thường vì layer cache sẽ giữ build cũ.
