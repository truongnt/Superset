import { EcdsPointMapChartProps, EcdsPointMapProps, MapPoint, PointSegment } from '../types';

// Đọc filter IN/== cho cột col từ native filter dashboard (camelCase-first).
function getNativeFilterValues(fd: any, col: string): string[] {
  if (!col) return [];
  // Superset truyền formData dạng camelCase — dùng camelCase trước, snake_case làm fallback
  const filters: any[] = (fd.extraFormData ?? fd.extra_form_data)?.filters ?? [];
  const values: string[] = [];
  for (const f of filters) {
    // So sánh exact hoặc suffix (bỏ qua prefix "table.") để tránh mismatch tên đầy đủ vs ngắn
    const colName = f.col?.includes('.') ? f.col.split('.').pop() : f.col;
    if (colName !== col && f.col !== col) continue;
    if (f.op === 'IN' && Array.isArray(f.val)) {
      f.val.forEach((v: any) => { const s = String(v ?? '').trim(); if (s) values.push(s); });
    } else if ((f.op === '==' || f.op === 'EQUALS') && f.val != null) {
      const s = String(f.val).trim();
      if (s) values.push(s);
    }
  }
  return values;
}


// ─── ColorPickerControl trả về {r,g,b,a} hoặc hex string ─────────────────────
function colorToStr(v: any, fallback: string): string {
  if (!v) return fallback;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && 'r' in v) {
    const a = v.a ?? 1;
    return a >= 1
      ? `rgb(${v.r},${v.g},${v.b})`
      : `rgba(${v.r},${v.g},${v.b},${a})`;
  }
  return fallback;
}

// ─── Palette màu cho categories ───────────────────────────────────────────────
const PALETTE = [
  '#5B8FF9', '#5AD8A6', '#F6BD16', '#E8684A', '#6DC8EC',
  '#9270CA', '#FF9D4D', '#269A99', '#FF99C3', '#FF6B3B',
  '#626681', '#78D3F8', '#9661BC', '#F6903D', '#008685',
];

function metricKey(m: any): string {
  if (!m) return '';
  if (typeof m === 'string') return m;
  if (m.label) return m.label;
  if (m.metric_name) return m.metric_name;
  return String(m);
}

const safeNum = (v: any): number => {
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

export default function transformProps(chartProps: EcdsPointMapChartProps): EcdsPointMapProps {
  const { width, height, formData, queriesData } = chartProps;
  const fd = formData as any;

  const rows = (queriesData?.[0]?.data ?? []) as Array<Record<string, any>>;

  // ── Timelapse config ─────────────────────────────────────────────────────────
  const timelapseEnabled: boolean = !!(fd.timelapse_enabled ?? fd.timelapseEnabled ?? false);
  const timeCol: string           = fd.timelapse_time_column ?? fd.timelapseTimeColumn ?? '';
  const timelapseSpeed: number    = Number(fd.timelapse_speed ?? fd.timelapseSpeed ?? 1000);

  // ── Cột cấu hình ────────────────────────────────────────────────────────────
  const latCol: string = fd.lat_column  ?? fd.latColumn  ?? '';
  const lngCol: string = fd.lng_column  ?? fd.lngColumn  ?? '';
  const lblCol: string = fd.label_column ?? fd.labelColumn ?? '';

  const groupbyCols: string[] = (fd.groupby ?? []).map((c: any) =>
    typeof c === 'string' ? c : (c.column_name ?? String(c)),
  );
  const groupbyCol = groupbyCols[0] ?? '';

  const rawMetrics: any[] = fd.metrics ?? [];
  const metricLabel = rawMetrics.length > 0 ? metricKey(rawMetrics[0]) : '';
  const hasMetric  = !!metricLabel;
  const hasGroupby = !!groupbyCol;

  // ── Cột mã/tên tỉnh / mã xã trong primary dataset ──────────────────────────
  const regionIdCol: string      = fd.region_id_column       ?? fd.regionIdColumn       ?? '';
  const regionNameCol: string    = fd.region_name_column     ?? fd.regionNameColumn     ?? '';
  const regionDrillIdCol: string = fd.region_drill_id_column ?? fd.regionDrillIdColumn  ?? '';

  // ── Build: mã tỉnh xuất hiện trong data (để filter bản đồ nền) ──────────────
  const queriedProvinceSet = new Set<string>();
  for (const row of rows) {
    const pCode = regionIdCol ? String(row[regionIdCol] ?? '').trim() : '';
    if (pCode) queriedProvinceSet.add(pCode);
  }

  // ── Phát hiện geo filter (tỉnh/xã) — tách biệt khỏi data filter (bệnh, ngày...) ──────────
  // Chỉ filter bản đồ nền khi native filter nhắm đúng cột địa lý.
  // Filter bệnh / loại ca... KHÔNG được thu nhỏ bản đồ nền.

  const queriedProvinceCodesFromFilter = getNativeFilterValues(fd, regionIdCol);
  const queriedProvinceNames           = getNativeFilterValues(fd, regionNameCol);
  const queriedCommuneCodesVal         = getNativeFilterValues(fd, regionDrillIdCol);

  // hasExplicitGeoFilter = true chỉ khi có filter nhắm đúng cột tỉnh hoặc xã
  const hasExplicitGeoFilter = (
    queriedProvinceCodesFromFilter.length > 0 ||
    queriedProvinceNames.length > 0 ||
    queriedCommuneCodesVal.length > 0
  );

  // Mã tỉnh từ data rows — chỉ dùng khi có geo filter rõ ràng
  const queriedProvinceCodesFromData = hasExplicitGeoFilter ? Array.from(queriedProvinceSet) : [];

  // queriedProvinceCodes → filter bản đồ nền: chỉ populated khi có geo filter
  const queriedProvinceCodes = hasExplicitGeoFilter
    ? [...new Set([
        ...queriedProvinceCodesFromData,
        ...queriedProvinceCodesFromFilter,
      ])]
    : [];

  // ── Gom nhóm rows theo (lat, lng) ──────────────────────────────────────────
  const pointAccum = new Map<string, {
    lat: number;
    lng: number;
    label: string;
    provinceCode: string;
    segments: Map<string, number>;
  }>();

  for (const row of rows) {
    const lat = safeNum(row[latCol]);
    const lng = safeNum(row[lngCol]);
    // Bỏ qua row không có toạ độ hợp lệ
    if (lat === 0 && lng === 0) continue;

    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (!pointAccum.has(key)) {
      pointAccum.set(key, {
        lat,
        lng,
        label: lblCol ? String(row[lblCol] ?? '') : '',
        provinceCode: regionIdCol ? String(row[regionIdCol] ?? '').trim() : '',
        segments: new Map(),
      });
    }

    const pt = pointAccum.get(key)!;

    // Cập nhật label nếu chưa có
    if (!pt.label && lblCol && row[lblCol]) {
      pt.label = String(row[lblCol]);
    }

    // Xác định segment label
    const segLabel = hasGroupby
      ? String(row[groupbyCol] ?? '(trống)')
      : '_total';

    // Giá trị: metric nếu có, ngược lại đếm row
    const val = hasMetric ? safeNum(row[metricLabel]) : 1;
    pt.segments.set(segLabel, (pt.segments.get(segLabel) ?? 0) + val);
  }

  // ── Xây dựng bảng màu cho categories ───────────────────────────────────────
  const allLabels = Array.from(
    new Set(
      Array.from(pointAccum.values()).flatMap(p => Array.from(p.segments.keys())),
    ),
  ).filter(l => l !== '_total');

  const labelColorMap: Record<string, string> = {};
  allLabels.forEach((lbl, i) => {
    labelColorMap[lbl] = PALETTE[i % PALETTE.length];
  });

  // ── Chuyển sang MapPoint[] ──────────────────────────────────────────────────
  const ptColor = fd.point_color ?? fd.pointColor ?? '#1890ff';
  const toMapPoints = (
    accum: Map<string, { lat: number; lng: number; label: string; provinceCode: string; segments: Map<string, number> }>,
  ): MapPoint[] =>
    Array.from(accum.values()).map(p => {
      const segs: PointSegment[] = Array.from(p.segments.entries()).map(([lbl, val]) => ({
        label: lbl,
        value: val,
        color: lbl === '_total' ? ptColor : (labelColorMap[lbl] ?? '#ccc'),
      }));
      const total = segs.reduce((s, seg) => s + seg.value, 0);
      return { lat: p.lat, lng: p.lng, total, segments: segs, label: p.label, provinceCode: p.provinceCode };
    });

  const points: MapPoint[] = toMapPoints(pointAccum);

  // ── Timelapse: build points cho từng mốc thời gian ───────────────────────────
  const pointsByTime: Record<string, MapPoint[]> = {};
  const timeSteps: string[] = [];

  if (timelapseEnabled && timeCol) {
    const stepsSet = new Set<string>();
    for (const row of rows) {
      const s = String(row[timeCol] ?? '').trim();
      if (s) stepsSet.add(s);
    }

    const sortedSteps = [...stepsSet].sort((a, b) => {
      const da = Date.parse(a), db = Date.parse(b);
      if (!isNaN(da) && !isNaN(db)) return da - db;
      const na = Number(a), nb = Number(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    timeSteps.push(...sortedSteps);

    for (const step of sortedSteps) {
      const stepAccum = new Map<string, { lat: number; lng: number; label: string; provinceCode: string; segments: Map<string, number> }>();
      for (const row of rows) {
        if (String(row[timeCol] ?? '').trim() !== step) continue;
        const lat = safeNum(row[latCol]);
        const lng = safeNum(row[lngCol]);
        if (lat === 0 && lng === 0) continue;
        const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        if (!stepAccum.has(key)) {
          stepAccum.set(key, {
            lat, lng,
            label: lblCol ? String(row[lblCol] ?? '') : '',
            provinceCode: regionIdCol ? String(row[regionIdCol] ?? '').trim() : '',
            segments: new Map(),
          });
        }
        const pt = stepAccum.get(key)!;
        if (!pt.label && lblCol && row[lblCol]) pt.label = String(row[lblCol]);
        const segLabel = hasGroupby ? String(row[groupbyCol] ?? '(trống)') : '_total';
        const val = hasMetric ? safeNum(row[metricLabel]) : 1;
        pt.segments.set(segLabel, (pt.segments.get(segLabel) ?? 0) + val);
      }
      pointsByTime[step] = toMapPoints(stepAccum);
    }
  }

  // Global min/max xuyên suốt tất cả mốc — bubble scale nhất quán khi animate
  let globalPointMin = 0, globalPointMax = 1;
  if (timelapseEnabled && timeSteps.length > 0) {
    const allTotals = timeSteps.flatMap(s => pointsByTime[s].map(p => p.total));
    if (allTotals.length > 0) {
      globalPointMin = Math.min(...allTotals);
      globalPointMax = Math.max(...allTotals);
    }
  }

  // Tổng ca mỗi mốc thời gian — dùng vẽ epi curve trong timelapse bar
  const stepTotals: number[] = timeSteps.map(s =>
    (pointsByTime[s] ?? []).reduce((sum, p) => sum + p.total, 0),
  );

  return {
    width,
    height,

    // Bản đồ nền
    mapDatasetId: fd.map_dataset_id ? Number(fd.map_dataset_id) : (fd.mapDatasetId ? Number(fd.mapDatasetId) : null),
    mapIdColumn:        fd.map_id_column        ?? fd.mapIdColumn        ?? 'id',
    mapCodeColumn:      fd.map_code_column       ?? fd.mapCodeColumn      ?? 'province_code',
    mapNameColumn:      fd.map_name_column       ?? fd.mapNameColumn      ?? 'name',
    mapGeojsonColumn:   fd.map_geojson_column    ?? fd.mapGeojsonColumn   ?? 'boundary',
    mapLevelColumn:     fd.map_level_column      ?? fd.mapLevelColumn     ?? 'level',
    mapParentIdColumn:  fd.map_parent_id_column  ?? fd.mapParentIdColumn  ?? 'parent_id',
    mapTopLevel:        Number(fd.map_top_level  ?? fd.mapTopLevel  ?? 2),
    mapDrillLevel:      Number(fd.map_drill_level ?? fd.mapDrillLevel ?? 3),
    mapFillColor:       colorToStr(fd.map_fill_color   ?? fd.mapFillColor,   '#e8e8e8'),
    mapStrokeColor:     colorToStr(fd.map_stroke_color ?? fd.mapStrokeColor, '#aaaaaa'),
    mapBorderWidth:     Number(fd.map_border_width ?? fd.mapBorderWidth ?? 0.5),
    enableDrilldown:    fd.enable_drilldown     ?? fd.enableDrilldown    ?? true,
    startAtDrillLevel:  fd.start_at_drill_level ?? fd.startAtDrillLevel  ?? false,
    queriedProvinceCodes,
    queriedProvinceNames,
    // Chỉ đọc từ native filter — không fallback từ data rows
    // (data rows chứa tất cả xã → gây auto-drill sai)
    queriedCommuneCodes: queriedCommuneCodesVal,

    // Điểm
    points,
    hasMetric,
    hasGroupby,
    pointColor:   colorToStr(fd.point_color ?? fd.pointColor, '#1890ff'),
    pointSizeMin: Number(fd.point_size_min ?? fd.pointSizeMin ?? 6),
    pointSizeMax: Number(fd.point_size_max ?? fd.pointSizeMax ?? 30),
    metricName:   metricLabel || '',
    groupbyName:  groupbyCol  || '',
    labelColorMap: hasGroupby ? labelColorMap : {},

    // Timelapse
    timelapseEnabled,
    timeSteps,
    pointsByTime,
    stepTotals,
    timelapseSpeed,
    globalPointMin,
    globalPointMax,
  };
}
