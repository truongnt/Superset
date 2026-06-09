import { EcdsRegionMapChartProps, EcdsRegionMapProps } from '../types';

function colorToRgb(v: any, fallback: string): string {
  if (!v) return fallback;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && 'r' in v) {
    const a = v.a ?? 1;
    return a >= 1 ? `rgb(${v.r},${v.g},${v.b})` : `rgba(${v.r},${v.g},${v.b},${a})`;
  }
  return fallback;
}

function metricToLabel(m: any): string {
  if (m == null) return 'metric';
  if (typeof m === 'string') return m;
  if (m.label) return m.label;
  if (m.metric_name) return m.metric_name;
  return String(m);
}

/**
 * Lấy giá trị IN/== từ native filter cho đúng cột col.
 * Dùng cho cả mã (code) lẫn tên (name).
 */
function getNativeFilterValues(fd: any, col: string): string[] {
  if (!col) return [];
  // Superset truyền formData dưới dạng camelCase (extraFormData), không phải snake_case
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

// Đọc từ adhoc chart filter + legacy extra filter — chỉ dùng để detect auto-drill,
// KHÔNG dùng để filter filteredTopUnits (tránh thu hẹp bản đồ khi dùng adhoc filter)
function getAdhocFilterValues(fd: any, col: string): string[] {
  if (!col) return [];
  const values: string[] = [];

  const adhocFilters: any[] = fd.adhocFilters ?? fd.adhoc_filters ?? [];
  for (const f of adhocFilters) {
    if (f.expressionType !== 'SIMPLE') continue;
    const subject = f.subject?.includes('.') ? f.subject.split('.').pop() : f.subject;
    if (subject !== col && f.subject !== col) continue;
    const op = (f.operator ?? f.op ?? '').toUpperCase();
    if (op === 'IN' && Array.isArray(f.comparator)) {
      f.comparator.forEach((v: any) => { const s = String(v ?? '').trim(); if (s) values.push(s); });
    } else if ((op === '==' || op === 'EQUALS') && f.comparator != null) {
      const s = String(f.comparator).trim();
      if (s) values.push(s);
    }
  }

  const extraFilters: any[] = fd.extraFilters ?? fd.extra_filters ?? [];
  for (const f of extraFilters) {
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


/**
 * Kiểm tra có value filter (IN/==) trên bất kỳ cột nào không.
 * Phân biệt với time filter dùng op TEMPORAL_RANGE / >= / <= — những op đó không nằm trong list.
 * Không cần biết filter đang trên cột nào, chỉ cần biết "có filter vùng đang active không"
 * để quyết định có populate queriedProvinceCodes từ data rows hay không.
 *
 * Lý do không check theo cột cụ thể: native filter tỉnh theo tên có thể trỏ tới cột
 * region_name_column mà user chưa cấu hình trong chart settings → bỏ sót filter.
 */
function hasAnyValueFilter(fd: any): boolean {
  // Superset truyền formData dạng camelCase — dùng camelCase trước, snake_case làm fallback

  // 1. Native dashboard filter (đi qua extraFormData.filters)
  const nativeFilters: any[] = (fd.extraFormData ?? fd.extra_form_data)?.filters ?? [];
  if (nativeFilters.some((f: any) =>
    f.op === 'IN' || f.op === '==' || f.op === 'EQUALS' || f.op === 'IN_FILTER',
  )) return true;

  // 2. Chart-level adhoc filter (SIMPLE expression, không phải time filter)
  const timeOps = new Set(['TEMPORAL_RANGE', '>=', '<=', '>', '<', 'BETWEEN', 'LATEST PARTITION', 'IS NULL', 'IS NOT NULL']);
  const adhocFilters: any[] = fd.adhocFilters ?? fd.adhoc_filters ?? [];
  if (adhocFilters.some((f: any) =>
    f.expressionType === 'SIMPLE' && !timeOps.has(f.operator ?? f.op),
  )) return true;

  // 3. extraFilters (legacy Superset filter bar — mảng {col, val, op})
  const extraFilters: any[] = fd.extraFilters ?? fd.extra_filters ?? [];
  if (extraFilters.some((f: any) =>
    f.op === 'IN' || f.op === '==' || f.op === 'EQUALS' || (f.val != null && f.val !== ''),
  )) return true;

  // 4. Adhoc filter trong extraFormData.overrideFormData (một số Superset version)
  const overrideAdhoc: any[] =
    (fd.extraFormData ?? fd.extra_form_data)?.overrideFormData?.adhocFilters ??
    (fd.extraFormData ?? fd.extra_form_data)?.override_form_data?.adhoc_filters ?? [];
  if (overrideAdhoc.some((f: any) =>
    f.expressionType === 'SIMPLE' && !timeOps.has(f.operator ?? f.op),
  )) return true;

  return false;
}


export default function transformProps(chartProps: EcdsRegionMapChartProps): EcdsRegionMapProps {
  const { width, height, formData, queriesData, theme } = chartProps;
  const data = (queriesData?.[0]?.data ?? []) as Array<Record<string, any>>;
  const fd = formData as any;

  const fdMetrics: any[] = fd.metrics ?? [];
  const metricName            = metricToLabel(fdMetrics[0]);
  const metricNames: string[] = fdMetrics.map(metricToLabel).filter(Boolean);
  const regionIdCol: string   = fd.region_id_column         ?? fd.regionIdColumn         ?? '';
  const regionNameCol: string = fd.region_name_column        ?? fd.regionNameColumn        ?? '';
  const regionDrillIdCol: string   = fd.region_drill_id_column   ?? fd.regionDrillIdColumn   ?? '';
  const regionDrillNameCol: string = fd.region_drill_name_column  ?? fd.regionDrillNameColumn  ?? '';

  // ── Timelapse config ─────────────────────────────────────────────────────────
  const timelapseEnabled: boolean = !!(fd.timelapse_enabled ?? fd.timelapseEnabled ?? false);
  const timeCol: string           = fd.timelapse_time_column ?? fd.timelapseTimeColumn ?? '';
  const timelapseSpeed: number    = Number(fd.timelapse_speed ?? fd.timelapseSpeed ?? 1000);

  // Build: mã tỉnh → tổng metric
  const metricByCode: Record<string, number> = {};
  // Build: mã xã → tổng metric
  const metricByDrillCode: Record<string, number> = {};
  // Build: mã tỉnh → tất cả metrics (cho tooltip)
  const allMetricsByCode: Record<string, Record<string, number>> = {};
  // Build: mã xã → tất cả metrics (cho tooltip)
  const allMetricsByDrillCode: Record<string, Record<string, number>> = {};
  // Mã tỉnh xuất hiện trong data rows (đã được SQL filter đúng)
  const queriedProvinceSet = new Set<string>();
  // Timelapse: metric grouped theo mốc thời gian
  const dataByTime: Record<string, { byCode: Record<string, number>; byDrillCode: Record<string, number> }> = {};

  for (const row of data) {
    const pCode = String(row[regionIdCol] ?? '').trim();
    if (pCode) queriedProvinceSet.add(pCode);

    const val = row[metricName];
    const num = val != null ? Number(val) : 0;
    if (pCode) metricByCode[pCode] = (metricByCode[pCode] ?? 0) + num;

    const cCode = String(row[regionDrillIdCol] ?? '').trim();
    if (cCode) metricByDrillCode[cCode] = (metricByDrillCode[cCode] ?? 0) + num;

    // Tích lũy tất cả metrics cho tooltip
    for (const mName of metricNames) {
      const mVal = row[mName];
      const mNum = mVal != null ? Number(mVal) : 0;
      if (pCode) {
        if (!allMetricsByCode[pCode]) allMetricsByCode[pCode] = {};
        allMetricsByCode[pCode][mName] = (allMetricsByCode[pCode][mName] ?? 0) + mNum;
      }
      if (cCode) {
        if (!allMetricsByDrillCode[cCode]) allMetricsByDrillCode[cCode] = {};
        allMetricsByDrillCode[cCode][mName] = (allMetricsByDrillCode[cCode][mName] ?? 0) + mNum;
      }
    }

    // Timelapse: group theo time column
    if (timelapseEnabled && timeCol) {
      const step = String(row[timeCol] ?? '').trim();
      if (step) {
        if (!dataByTime[step]) dataByTime[step] = { byCode: {}, byDrillCode: {} };
        if (pCode) dataByTime[step].byCode[pCode] = (dataByTime[step].byCode[pCode] ?? 0) + num;
        if (cCode) dataByTime[step].byDrillCode[cCode] = (dataByTime[step].byDrillCode[cCode] ?? 0) + num;
      }
    }
  }

  // Sắp xếp mốc thời gian — thử parse date, fallback numeric, fallback string
  const timeSteps: string[] = timelapseEnabled
    ? Object.keys(dataByTime).sort((a, b) => {
        const da = Date.parse(a), db = Date.parse(b);
        if (!isNaN(da) && !isNaN(db)) return da - db;
        const na = Number(a), nb = Number(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a < b ? -1 : a > b ? 1 : 0;
      })
    : [];

  // Global min/max xuyên suốt tất cả mốc — để color scale nhất quán khi animate
  let globalMetricMin = 0, globalMetricMax = 1;
  if (timelapseEnabled && timeSteps.length > 0) {
    const allVals = timeSteps.flatMap(s => Object.values(dataByTime[s].byCode)).filter(v => Number.isFinite(v));
    if (allVals.length > 0) {
      globalMetricMin = Math.min(...allVals);
      globalMetricMax = Math.max(...allVals);
    }
  }

  // Tổng metric mỗi mốc thời gian — dùng vẽ epi curve trong timelapse bar
  const stepTotals: number[] = timeSteps.map(s => {
    const step = dataByTime[s];
    if (!step) return 0;
    return Object.values(step.byCode).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
  });

  // Detect value filter (IN/==) bất kỳ — không phân biệt cột.
  // Time filter dùng op TEMPORAL_RANGE/>=/<= nên không bị nhận nhầm.
  // queriedProvinceCodes populate chỉ khi geo filter rõ ràng — xem hasExplicitGeoFilter bên dưới.
  // ── Phát hiện geo filter (tỉnh/xã) — tách biệt khỏi data filter (bệnh, ngày...) ──────────
  // Chỉ filter bản đồ nền khi native filter nhắm đúng cột địa lý.
  // Filter bệnh / loại ca... KHÔNG được thu nhỏ bản đồ nền.

  const queriedProvinceCodesFromFilter = getNativeFilterValues(fd, regionIdCol);
  const queriedProvinceNames           = getNativeFilterValues(fd, regionNameCol);
  const queriedCommuneCodes            = getNativeFilterValues(fd, regionDrillIdCol);
  const queriedCommuneNames            = getNativeFilterValues(fd, regionDrillNameCol);

  // Adhoc/extra filter values — chỉ dùng để detect auto-drill trong component,
  // không ảnh hưởng filteredTopUnits (tránh thu hẹp bản đồ khi dùng adhoc filter)
  const adhocProvinceCodes = getAdhocFilterValues(fd, regionIdCol);
  const adhocProvinceNames = getAdhocFilterValues(fd, regionNameCol);

  // hasExplicitGeoFilter = true chỉ khi có filter nhắm đúng cột tỉnh hoặc xã
  const hasExplicitGeoFilter = (
    queriedProvinceCodesFromFilter.length > 0 ||
    queriedProvinceNames.length > 0 ||
    queriedCommuneCodes.length > 0 ||
    queriedCommuneNames.length > 0
  );

  // Mã tỉnh từ data rows — chỉ dùng khi có geo filter rõ ràng
  // (data rows đã bị SQL filter bởi tất cả native filter, kể cả bệnh)
  const queriedProvinceCodesFromData = hasExplicitGeoFilter ? Array.from(queriedProvinceSet) : [];

  // isAnyRegionFilter giữ lại cho debug log
  const isAnyRegionFilter = hasAnyValueFilter(fd);

  // queriedProvinceCodes → filter bản đồ nền: chỉ populated khi có geo filter
  const queriedProvinceCodes = hasExplicitGeoFilter
    ? [...new Set([
        ...queriedProvinceCodesFromData,
        ...queriedProvinceCodesFromFilter,
      ])]
    : [];

  // ── DEBUG ─────────────────────────────────────────────────────────────────
  console.group('[ECDS Map] transformProps');
  console.log('=== FULL formData (tìm filter) ===', JSON.stringify(fd, null, 0));
  console.log('adhocFilters            :', JSON.stringify(fd.adhocFilters ?? fd.adhoc_filters ?? []));
  console.log('extraFilters            :', JSON.stringify(fd.extraFilters ?? fd.extra_filters ?? []));
  console.log('extraFormData (full)    :', JSON.stringify(fd.extraFormData ?? fd.extra_form_data ?? {}));
  console.log('extraFormData.filters   :', (fd.extraFormData ?? fd.extra_form_data)?.filters ?? []);
  console.log('isAnyRegionFilter       :', isAnyRegionFilter);
  console.log('queriedProvinceCodes (data)   :', queriedProvinceCodesFromData);
  console.log('queriedProvinceCodes (filter) :', queriedProvinceCodesFromFilter);
  console.log('queriedProvinceCodes (merged) :', queriedProvinceCodes);
  console.log('queriedProvinceNames    :', queriedProvinceNames);
  console.log('queriedCommuneCodes     :', queriedCommuneCodes);
  console.log('queriedCommuneNames     :', queriedCommuneNames);
  console.log('metricByCode keys       :', Object.keys(metricByCode));
  console.log('metricByDrillCode count :', Object.keys(metricByDrillCode).length);
  // ── Timelapse debug ──
  console.log('timelapseEnabled        :', timelapseEnabled);
  console.log('timeCol                 :', timeCol);
  console.log('data.length             :', data.length);
  console.log('timeSteps.length        :', timeSteps.length);
  console.log('timeSteps (sample)      :', timeSteps.slice(0, 10));
  if (timelapseEnabled && timeCol && data.length > 0) {
    const sampleRow = data[0];
    console.log('data[0][timeCol]        :', sampleRow[timeCol], '(key exists:', timeCol in sampleRow, ')');
    console.log('data[0] keys            :', Object.keys(sampleRow));
  }
  // ── dataMask: xem native filter đang deliver gì (quan trọng để debug filter tỉnh không có data)
  const dataMask: Record<string, any> = (fd as any).dataMask ?? {};
  const activeFilterSummary = Object.entries(dataMask)
    .filter(([, v]) => {
      const dm = v as any;
      return (dm?.extraFormData?.filters?.length > 0)
        || (dm?.filterState?.value !== undefined && dm?.filterState?.value !== null && dm?.filterState?.value !== '');
    })
    .map(([k, v]) => {
      const dm = v as any;
      return {
        id: k,
        extraFormData_filters: dm?.extraFormData?.filters ?? [],
        filterState_value: dm?.filterState?.value,
      };
    });
  console.log('dataMask (active filters):', JSON.stringify(activeFilterSummary, null, 0));
  console.groupEnd();
  // ──────────────────────────────────────────────────────────────────────────

  return {
    width,
    height,
    metricByCode,
    metricByDrillCode,
    queriedProvinceCodes,
    queriedProvinceNames,
    queriedCommuneCodes,
    queriedCommuneNames,
    metricName,
    metricNames,
    allMetricsByCode,
    adhocProvinceCodes,
    adhocProvinceNames,
    allMetricsByDrillCode,

    mapDatasetId: Number(fd.map_dataset_id ?? fd.mapDatasetId ?? 0),
    mapIdColumn:        fd.map_id_column         ?? fd.mapIdColumn        ?? 'id',
    mapCodeColumn:      fd.map_code_column       ?? fd.mapCodeColumn      ?? 'code',
    mapDrillCodeColumn: fd.map_drill_code_column ?? fd.mapDrillCodeColumn ?? 'code',
    mapNameColumn:      fd.map_name_column       ?? fd.mapNameColumn      ?? 'name',
    mapGeojsonColumn:   fd.map_geojson_column    ?? fd.mapGeojsonColumn   ?? 'boundary',
    mapLevelColumn:     fd.map_level_column      ?? fd.mapLevelColumn     ?? 'level',
    mapParentIdColumn:  fd.map_parent_id_column  ?? fd.mapParentIdColumn  ?? 'parent_id',
    mapTopLevel:   Number(fd.map_top_level  ?? fd.mapTopLevel  ?? 2),
    mapDrillLevel: Number(fd.map_drill_level ?? fd.mapDrillLevel ?? 3),

    colorScheme:       fd.linear_color_scheme ?? fd.linearColorScheme ?? 'sequential.Blues',
    noDataColor:       colorToRgb(fd.no_data_color ?? fd.noDataColor, '#e0e0e0'),
    mapBorderWidth:    Number(fd.map_border_width ?? fd.mapBorderWidth ?? 0.5),
    enableDrilldown:   fd.enable_drilldown    ?? fd.enableDrilldown   ?? true,
    startAtDrillLevel: fd.start_at_drill_level ?? fd.startAtDrillLevel ?? false,
    theme,

    // Timelapse
    timelapseEnabled,
    timeSteps,
    dataByTime,
    stepTotals,
    timelapseSpeed,
    globalMetricMin,
    globalMetricMax,
  };
}
