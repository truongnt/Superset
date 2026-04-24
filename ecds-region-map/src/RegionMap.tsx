import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SupersetClient } from '@superset-ui/core';
import { EcdsRegionMapProps, MapUnit } from './types';

// ─── Color helpers ────────────────────────────────────────────────────────────

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const makeInterp =
  (from: [number, number, number], to: [number, number, number]) =>
  (t: number) => {
    const c = Math.max(0, Math.min(1, t));
    return `rgb(${Math.round(lerp(from[0], to[0], c))},${Math.round(lerp(from[1], to[1], c))},${Math.round(lerp(from[2], to[2], c))})`;
  };

const INTERPOLATORS: Record<string, (t: number) => string> = {
  'sequential.Blues':   makeInterp([222, 235, 247], [8, 48, 107]),
  'sequential.Greens':  makeInterp([229, 245, 224], [0, 68, 27]),
  'sequential.Reds':    makeInterp([254, 229, 217], [103, 0, 13]),
  'sequential.Oranges': makeInterp([254, 237, 222], [127, 39, 4]),
  'sequential.Purples': makeInterp([242, 240, 247], [63, 0, 125]),
  'sequential.Viridis': makeInterp([68, 1, 84], [253, 231, 37]),
};

function makeColorScale(interp: (t: number) => string, min: number, max: number) {
  const range = max === min ? 1 : max - min;
  return (v: number) => interp((v - min) / range);
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

type Geometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: any };

function computeBounds(units: MapUnit[]) {
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  const visit = (coords: any, d: number) => {
    if (d === 0) {
      if (coords[0] < minLon) minLon = coords[0];
      if (coords[0] > maxLon) maxLon = coords[0];
      if (coords[1] < minLat) minLat = coords[1];
      if (coords[1] > maxLat) maxLat = coords[1];
      return;
    }
    for (const c of coords) visit(c, d - 1);
  };
  for (const u of units) {
    const g = u.geometry;
    if (g.type === 'Polygon') visit(g.coordinates, 2);
    else if (g.type === 'MultiPolygon') visit(g.coordinates, 3);
  }
  return { minLon, maxLon, minLat, maxLat };
}

function makeProjection(
  bounds: ReturnType<typeof computeBounds>,
  width: number,
  height: number,
  padding = 10,
) {
  const w = width - padding * 2;
  const h = height - padding * 2;
  const lonRange = bounds.maxLon - bounds.minLon || 1;
  const latRange = bounds.maxLat - bounds.minLat || 1;
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const scale = Math.min(w / (lonRange * cosLat), h / latRange);
  const mapW = lonRange * cosLat * scale;
  const mapH = latRange * scale;
  const offX = padding + (w - mapW) / 2;
  const offY = padding + (h - mapH) / 2;
  return (lon: number, lat: number): [number, number] => [
    offX + (lon - bounds.minLon) * cosLat * scale,
    offY + (bounds.maxLat - lat) * scale,
  ];
}

function geomToPath(
  geom: Geometry,
  project: (lon: number, lat: number) => [number, number],
): string {
  const rings2p = (rings: number[][][]) =>
    rings
      .map(ring =>
        ring
          .map(([lon, lat], i) => {
            const [x, y] = project(lon, lat);
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join('') + 'Z',
      )
      .join('');
  if (geom.type === 'Polygon') return rings2p(geom.coordinates);
  return geom.coordinates.map((poly: any) => rings2p(poly)).join('');
}

// ─── Error helper ────────────────────────────────────────────────────────────
// SupersetClient ném Response object khi request thất bại, không phải Error
function errMsg(err: any): string {
  if (err instanceof Response) return `HTTP ${err.status}`;
  if (err?.message)            return String(err.message);
  return String(err);
}

// ─── Superset API fetch (dùng SupersetClient để hỗ trợ embedded/guest token) ──

async function fetchMapUnits(
  datasetId: number,
  columns: string[],
): Promise<Array<Record<string, any>>> {
  const cols = Array.from(new Set(columns.filter(Boolean)));
  const { json } = await SupersetClient.post({
    endpoint: '/api/v1/chart/data',
    jsonPayload: {
      datasource: { id: datasetId, type: 'table' },
      force: false,
      queries: [{ columns: cols, row_limit: 200000, time_range: 'No filter' }],
    },
  });
  return (json as any)?.result?.[0]?.data ?? [];
}

// Parse Polygon/MultiPolygon từ giá trị cột
function parseGeom(raw: any): Geometry | null {
  if (!raw) return null;
  try {
    const g = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!g) return null;
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') return g;
    if (g.type === 'Feature' && g.geometry) return g.geometry;
  } catch (_) {}
  return null;
}

const fmtNum = (v: number | null | undefined) => {
  if (v == null || Number.isNaN(v)) return 'N/A';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(v);
};

// Format giá trị timeStep thành ngày dễ đọc
const fmtTimeStep = (s: string): string => {
  const isoDate = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (isoDate) { const [, y, m, d] = isoDate; return `${d}/${m}/${y}`; }
  const ym = s.match(/^(\d{4})-(\d{2})$/);
  if (ym) { const [, y, m] = ym; return `${parseInt(m, 10)}/${y}`; }
  if (/^\d{10,13}$/.test(s)) {
    const ms = s.length >= 13 ? parseInt(s, 10) : parseInt(s, 10) * 1000;
    const dt = new Date(ms);
    if (!isNaN(dt.getTime()))
      return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
  }
  return s;
};

// Style cho các nút timelapse
const tlBtnStyle: React.CSSProperties = {
  width: 28, height: 28, padding: 0, border: '1px solid #bbb',
  borderRadius: 4, background: 'rgba(255,255,255,0.88)',
  cursor: 'pointer', display: 'flex', alignItems: 'center',
  justifyContent: 'center', fontSize: 13, fontWeight: 700,
  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
};

// ─── Component ────────────────────────────────────────────────────────────────

const EcdsRegionMap: React.FC<EcdsRegionMapProps> = ({
  width,
  height,
  metricByCode,
  metricByDrillCode,
  queriedProvinceCodes,
  queriedProvinceNames,
  queriedCommuneCodes,
  queriedCommuneNames,
  metricName,
  mapDatasetId,
  mapIdColumn,
  mapCodeColumn,
  mapDrillCodeColumn,
  mapNameColumn,
  mapGeojsonColumn,
  mapLevelColumn,
  mapParentIdColumn,
  mapTopLevel,
  mapDrillLevel,
  colorScheme,
  noDataColor,
  mapBorderWidth,
  enableDrilldown,
  startAtDrillLevel,
  timelapseEnabled,
  timeSteps,
  dataByTime,
  stepTotals,
  timelapseSpeed,
  globalMetricMin,
  globalMetricMax,
}) => {
  // ── Timelapse state ────────────────────────────────────────────────────────
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying,      setIsPlaying]      = useState(false);
  const [hasPlayed,      setHasPlayed]      = useState(false);
  const [isChartHovered, setIsChartHovered] = useState(false);
  // ── Map units từ secondary datasource ─────────────────────────────────────
  // topUnits:  vùng cấp cao (tỉnh) — level = mapTopLevel
  // drillMap:  parentId → vùng cấp dưới (xã) — level = mapDrillLevel
  const [topUnits, setTopUnits] = useState<MapUnit[]>([]);
  const [drillMap, setDrillMap] = useState<Record<string, MapUnit[]>>({});
  const [loading, setLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // ── Drill state ────────────────────────────────────────────────────────────
  // drillId   = id (PK) của tỉnh đang xem; null = đang ở cấp tỉnh
  // drillCode = code của tỉnh đó (dùng để fallback metric khi xã không có data)
  const [drillId, setDrillId] = useState<string | null>(null);
  const [drillCode, setDrillCode] = useState<string | null>(null);
  const [drillName, setDrillName] = useState('');

  // ── UI ─────────────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; id: string; code: string; name: string; value: number | undefined;
  } | null>(null);
  const [zoom, setZoom] = useState({ k: 1, tx: 0, ty: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const panRef = useRef<{
    dragging: boolean; sx: number; sy: number; ox: number; oy: number;
  } | null>(null);
  // Track xem user có thực sự drag (di chuyển >4px) không — nếu có thì block click
  const wasDraggedRef = useRef(false);
  // Epi curve scrubber
  const epiRef    = useRef<HTMLDivElement>(null);
  const epiUidRef = useRef(`epi${Math.random().toString(36).slice(2, 7)}`);

  // ── Fetch map data ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDatasetId) {
      setMapError('Chưa cấu hình Map Dataset ID');
      return;
    }
    // Các cột bắt buộc — nếu chưa cấu hình thì dừng, tránh lỗi "Columns missing"
    const requiredCols = { mapIdColumn, mapCodeColumn, mapNameColumn, mapGeojsonColumn, mapLevelColumn, mapParentIdColumn };
    const missingCols = Object.entries(requiredCols).filter(([, v]) => !v).map(([k]) => k);
    if (missingCols.length) {
      setTopUnits([]);
      setDrillMap({});
      setMapError(null); // im lặng — user đang điền form
      return;
    }
    let cancelled = false;
    setLoading(true);
    setMapError(null);

    // Fetch tất cả cột cần thiết; thêm mapDrillCodeColumn nếu khác mapCodeColumn
    const drillCodeCol = mapDrillCodeColumn || mapCodeColumn;
    const cols = Array.from(new Set([
      mapIdColumn, mapCodeColumn, drillCodeCol,
      mapNameColumn, mapGeojsonColumn, mapLevelColumn, mapParentIdColumn,
    ]));

    fetchMapUnits(mapDatasetId, cols)
      .then(rows => {
        if (cancelled) return;

        const top: MapUnit[] = [];
        const drill: Record<string, MapUnit[]> = {};

        for (const row of rows) {
          const lvl = Number(row[mapLevelColumn]);
          const geom = parseGeom(row[mapGeojsonColumn]);
          if (!geom) continue;

          if (lvl === mapTopLevel) {
            // Tỉnh:
            //   id   = mapIdColumn (UUID/PK) — dùng để xã reference qua parent_id
            //   code = mapCodeColumn (mã tỉnh) — dùng để join với metricByCode
            const id   = String(row[mapIdColumn]   ?? '').trim();
            const code = String(row[mapCodeColumn] ?? '').trim();
            top.push({
              id,
              code,
              name:     String(row[mapNameColumn]  ?? '').trim(),
              level:    lvl,
              parentId: row[mapParentIdColumn] ? String(row[mapParentIdColumn]).trim() : null,
              geometry: geom,
              props:    row,
            });
          } else if (lvl === mapDrillLevel) {
            // parentId = UUID của tỉnh cha (từ mapParentIdColumn) — khớp với province.id
            const parentId = row[mapParentIdColumn] ? String(row[mapParentIdColumn]).trim() : null;
            if (!parentId) continue;
            // Xã:
            //   id   = mapIdColumn (UUID/PK)
            //   code = drillCodeCol (mã xã) — join với metricByDrillCode
            const id   = String(row[mapIdColumn]  ?? '').trim();
            const code = String(row[drillCodeCol] ?? '').trim();
            const unit: MapUnit = {
              id,
              code,
              name:     String(row[mapNameColumn] ?? '').trim(),
              level:    lvl,
              parentId,
              geometry: geom,
              props:    row,
            };
            if (!drill[parentId]) drill[parentId] = [];
            drill[parentId].push(unit);
          }
        }

        setTopUnits(top);
        setDrillMap(drill);
        setLoading(false);
      })
      .catch(err => {
        if (!cancelled) { setMapError(errMsg(err)); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [
    mapDatasetId, mapIdColumn, mapCodeColumn, mapDrillCodeColumn, mapNameColumn,
    mapGeojsonColumn, mapLevelColumn, mapParentIdColumn,
    mapTopLevel, mapDrillLevel,
  ]);

  // Reset zoom khi đổi level
  useEffect(() => {
    setZoom({ k: 1, tx: 0, ty: 0 });
  }, [drillId]);

  // ── Province id → code (dùng để fallback metric khi hiện xã không drill) ──
  const idToProvinceCode = useMemo(() => {
    const m: Record<string, string> = {};
    topUnits.forEach(u => { m[u.id] = u.code; });
    return m;
  }, [topUnits]);

  // ── Lookup: commune code/id → province id (để auto-drill khi filter xã theo mã) ──
  const communeCodeToProvinceId = useMemo(() => {
    const m: Record<string, string> = {};
    Object.entries(drillMap).forEach(([provinceId, communes]) => {
      communes.forEach(c => {
        if (c.id)   m[c.id]   = provinceId;
        if (c.code) m[c.code] = provinceId;
      });
    });
    return m;
  }, [drillMap]);

  // ── Lookup: tên xã (lowercase) → province id (để auto-drill khi filter xã theo tên) ──
  const communeNameToProvinceId = useMemo(() => {
    const m: Record<string, string> = {};
    Object.entries(drillMap).forEach(([provinceId, communes]) => {
      communes.forEach(c => {
        if (c.name) m[c.name.toLowerCase()] = provinceId;
      });
    });
    return m;
  }, [drillMap]);

  // ── Gộp tất cả province IDs tìm được từ commune filter (cả mã lẫn tên) ──
  const resolvedCommuneProvinceIds = useMemo(() => {
    const ids = new Set<string>();
    queriedCommuneCodes.forEach(c => {
      const pid = communeCodeToProvinceId[c];
      if (pid) ids.add(pid);
    });
    queriedCommuneNames.forEach(n => {
      const pid = communeNameToProvinceId[n.toLowerCase()];
      if (pid) ids.add(pid);
    });
    return ids;
  }, [queriedCommuneCodes, queriedCommuneNames, communeCodeToProvinceId, communeNameToProvinceId]);

  // ── Nếu filter xã thuộc nhiều tỉnh → không auto-drill, hiển thị filteredDrillUnits ──
  const shouldShowAllCommunes = useMemo(() => {
    const hasAnyCommuneFilter = queriedCommuneCodes.length > 0 || queriedCommuneNames.length > 0;
    if (!hasAnyCommuneFilter || !resolvedCommuneProvinceIds.size) return false;
    return resolvedCommuneProvinceIds.size > 1;
  }, [queriedCommuneCodes, queriedCommuneNames, resolvedCommuneProvinceIds]);

  // Khai báo trước để commune auto-drill dùng được (province auto-drill dùng cùng ref)
  const lastAutodrillRef = useRef<string | null>(null);

  // ── Reset drillId khi chuyển sang chế độ hiện xã nhiều tỉnh (kịch bản 6/7) ──
  // Nếu đang drill vào 1 tỉnh (drillId ≠ null) mà filter xã bắt đầu span nhiều tỉnh,
  // cả province-auto-drill lẫn commune-auto-drill đều bail sớm → drillId không được reset.
  // Effect này đảm bảo drillId luôn được xóa khi shouldShowAllCommunes = true.
  useEffect(() => {
    if (shouldShowAllCommunes && drillId !== null) {
      lastAutodrillRef.current = null;
      setDrillId(null);
      setDrillCode(null);
      setDrillName('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShowAllCommunes]);

  // ── Auto-drill khi native filter chọn xã (chỉ khi xã thuộc đúng 1 tỉnh) ───
  // Hỗ trợ cả filter theo mã xã (queriedCommuneCodes) lẫn tên xã (queriedCommuneNames).
  // resolvedCommuneProvinceIds đã gộp cả hai nguồn → dùng trực tiếp.
  useEffect(() => {
    if (!enableDrilldown || startAtDrillLevel || drillId) return;
    const hasAnyCommuneFilter = queriedCommuneCodes.length > 0 || queriedCommuneNames.length > 0;
    if (!hasAnyCommuneFilter || !resolvedCommuneProvinceIds.size) return;
    // Nhiều tỉnh → dùng shouldShowAllCommunes + filteredDrillUnits, không auto-drill
    if (resolvedCommuneProvinceIds.size !== 1) return;
    const provinceId = Array.from(resolvedCommuneProvinceIds)[0];
    if (!provinceId || !drillMap[provinceId]?.length) return;
    // Guard: nếu đã auto-drill đây rồi (hoặc user vừa nhấn Back) → không re-drill
    if (lastAutodrillRef.current === provinceId) return;
    const province = topUnits.find(u => u.id === provinceId);
    lastAutodrillRef.current = provinceId;
    setDrillId(provinceId);
    setDrillCode(province?.code ?? null);
    setDrillName(province?.name ?? provinceId);
  }, [queriedCommuneCodes, queriedCommuneNames, resolvedCommuneProvinceIds, drillMap, topUnits, enableDrilldown, startAtDrillLevel, drillId]);

  // ── Active units theo drill state ──────────────────────────────────────────
  const filteredTopUnits = useMemo(() => {
    const hasAnyProvinceHint = queriedProvinceCodes.length > 0 || queriedProvinceNames.length > 0;
    // Tỉnh chứa các xã được filter — dùng khi chỉ có commune filter (không có province filter)
    const hasAnyCommuneHint = resolvedCommuneProvinceIds.size > 0;

    console.group('[ECDS Map] filteredTopUnits');
    console.log('topUnits count          :', topUnits.length);
    console.log('queriedProvinceCodes    :', queriedProvinceCodes);
    console.log('queriedProvinceNames    :', queriedProvinceNames);
    console.log('resolvedCommuneProvinceIds:', [...resolvedCommuneProvinceIds]);
    console.log('metricByCode keys       :', Object.keys(metricByCode));
    console.log('hasAnyProvinceHint      :', hasAnyProvinceHint);
    console.log('hasAnyCommuneHint       :', hasAnyCommuneHint);

    // Không có filter vùng nào → show tất cả tỉnh
    if (!hasAnyProvinceHint && !hasAnyCommuneHint) {
      console.log('→ no filter → show all provinces');
      console.groupEnd();
      return topUnits;
    }

    // Union tất cả bước — cover mọi trường hợp:
    //   - Nhiều tỉnh filter, chỉ một số có data → union bước 1+2+3
    //   - Chỉ có commune filter (không có province filter riêng) → bước 4
    //   - Không có data gì → bước 2/3/4 giữ nguyên bản đồ nền
    const matchedIds = new Set<string>();

    // Bước 1: tỉnh có metric data (SQL đã filter đúng)
    topUnits.forEach(u => {
      if (
        Object.prototype.hasOwnProperty.call(metricByCode, u.code) ||
        Object.prototype.hasOwnProperty.call(metricByCode, u.id)
      ) matchedIds.add(u.id);
    });

    // Bước 2: tỉnh khớp trực tiếp với queriedProvinceCodes (cover tỉnh không có data)
    // Dùng cả case-insensitive name matching để cover filter theo tên tỉnh format khác nhau
    if (queriedProvinceCodes.length) {
      const codeSet = new Set(queriedProvinceCodes);
      const lowerSet = new Set(queriedProvinceCodes.map(v => v.toLowerCase()));
      topUnits.forEach(u => {
        if (
          codeSet.has(u.code) || codeSet.has(u.id) || codeSet.has(u.name) ||
          lowerSet.has(u.name.toLowerCase())
        ) matchedIds.add(u.id);
      });
    }

    // Bước 3: tỉnh khớp theo tên (cover filter theo tên tỉnh, kể cả không có data)
    if (queriedProvinceNames.length) {
      const nameSet = new Set(queriedProvinceNames.map(n => n.toLowerCase()));
      topUnits.forEach(u => {
        if (nameSet.has(u.name.toLowerCase())) matchedIds.add(u.id);
      });
    }

    // Bước 4: tỉnh chứa xã được filter — dùng khi chỉ có commune filter và không có data
    // Ví dụ: filter 3 xã thuộc 3 tỉnh khác nhau, không có data → vẫn hiện bản đồ nền 3 tỉnh đó
    resolvedCommuneProvinceIds.forEach(pid => matchedIds.add(pid));

    console.log('matched ids (union)     :', matchedIds.size);

    if (matchedIds.size > 0) {
      const result = topUnits.filter(u => matchedIds.has(u.id));
      if (result.length > 0) {
        console.log('→ matched:', result.map(u => `${u.name}(${u.code})`));
        console.groupEnd();
        return result;
      }
      // matchedIds non-empty nhưng không có topUnit nào khớp
      // (có thể resolvedCommuneProvinceIds chứa drillMap key không khớp với topUnit.id)
      // → fallback show all để không bị blank map
      console.warn('→ matchedIds non-empty nhưng không topUnit match → fallback show all (kiểm tra mapIdColumn vs mapParentIdColumn)');
    } else {
      console.warn('→ không match bước nào → fallback show all (kiểm tra cấu hình cột!)');
    }

    console.groupEnd();
    return topUnits;
  }, [topUnits, queriedProvinceCodes, queriedProvinceNames, metricByCode, resolvedCommuneProvinceIds]);

  // Tất cả xã gộp lại (dùng khi startAtDrillLevel)
  const allDrillUnits = useMemo(
    () => Object.values(drillMap).flat(),
    [drillMap],
  );

  // Xã đã lọc theo tỉnh được filter (dùng khi startAtDrillLevel / shouldShowAllCommunes)
  // Dùng lại filteredTopUnits (đã được xác định chính xác) thay vì match lại
  const filteredDrillUnits = useMemo(() => {
    const allowedParents = new Set(filteredTopUnits.map(u => u.id));
    return allDrillUnits.filter(u => u.parentId && allowedParents.has(u.parentId));
  }, [allDrillUnits, filteredTopUnits]);

  // Khi startAtDrillLevel/shouldShowAllCommunes mà filteredDrillUnits rỗng
  // (vd: tỉnh filter không có xã trong map dataset hoặc drillMap key mismatch)
  // → fallback về filteredTopUnits (tỉnh cấp trên) để không bị blank map
  const activeUnits: MapUnit[] = drillId
    ? (drillMap[drillId] ?? [])
    : (startAtDrillLevel || shouldShowAllCommunes)
      ? (filteredDrillUnits.length > 0 ? filteredDrillUnits : filteredTopUnits)
      : filteredTopUnits;

  // ── DEBUG activeUnits ──────────────────────────────────────────────────────
  console.log(
    '[ECDS Map] activeUnits →',
    drillId          ? `drill(${drillId}) → ${activeUnits.length} xã`
    : startAtDrillLevel    ? `startAtDrillLevel → ${activeUnits.length} xã`
    : shouldShowAllCommunes ? `shouldShowAllCommunes → ${activeUnits.length} xã`
    : `tỉnh → ${activeUnits.length} tỉnh`,
    '| drillId:', drillId,
    '| shouldShowAllCommunes:', shouldShowAllCommunes,
  );
  // ──────────────────────────────────────────────────────────────────────────

  // ── Auto-drill khi filter chỉ còn 1 tỉnh (chỉ khi không startAtDrillLevel / shouldShowAllCommunes) ─
  useEffect(() => {
    console.group('[ECDS Map] province auto-drill check');
    console.log('filteredTopUnits.length :', filteredTopUnits.length,
      filteredTopUnits.map(u => `${u.name}(${u.code})`));
    console.log('enableDrilldown         :', enableDrilldown);
    console.log('startAtDrillLevel       :', startAtDrillLevel);
    console.log('shouldShowAllCommunes   :', shouldShowAllCommunes);
    console.log('drillMap keys           :', Object.keys(drillMap).length);
    console.log('lastAutodrillRef        :', lastAutodrillRef.current);

    if (!enableDrilldown || startAtDrillLevel || shouldShowAllCommunes) {
      console.log('→ bailed (drilldown disabled hoặc đang ở chế độ xã)');
      console.groupEnd();
      return;
    }
    if (filteredTopUnits.length === 1 && Object.keys(drillMap).length > 0) {
      const province = filteredTopUnits[0];
      if (province.id !== lastAutodrillRef.current && drillMap[province.id]?.length) {
        console.log('→ auto-drill vào:', province.name, province.id);
        lastAutodrillRef.current = province.id;
        setDrillId(province.id);
        setDrillCode(province.code);
        setDrillName(province.name);
      } else {
        console.log('→ skip: đã drill hoặc drillMap chưa có xã');
      }
    } else if (filteredTopUnits.length !== 1) {
      if (lastAutodrillRef.current !== null) {
        console.log('→ reset drill về cấp tỉnh');
        lastAutodrillRef.current = null;
        setDrillId(null);
        setDrillCode(null);
        setDrillName('');
      } else {
        console.log('→ không drill (nhiều tỉnh hoặc drillMap chưa load)');
      }
    }
    console.groupEnd();
  }, [filteredTopUnits, enableDrilldown, startAtDrillLevel, shouldShowAllCommunes, drillMap]);

  // ── Timelapse: auto-advance khi đang play ─────────────────────────────────
  useEffect(() => {
    if (!isPlaying || !timelapseEnabled || timeSteps.length < 2) return;
    const id = setInterval(() => {
      setCurrentStepIdx(i => {
        if (i >= timeSteps.length - 1) { setIsPlaying(false); return i; }
        return i + 1;
      });
    }, timelapseSpeed);
    return () => clearInterval(id);
  }, [isPlaying, timelapseEnabled, timeSteps.length, timelapseSpeed]);

  // Reset về step 0 khi timeSteps thay đổi (data load mới).
  // Dùng join('|') làm stable key để tránh re-render spam khi transformProps
  // trả về array reference mới nhưng nội dung như cũ (vd: kéo speed slider).
  const timeStepsKey = timeSteps.join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setCurrentStepIdx(0); setIsPlaying(false); setHasPlayed(false); }, [timeStepsKey]);

  // ── Timelapse: override metric theo bước hiện tại ─────────────────────────
  // Khi chưa bấm play (hasPlayed=false): dùng toàn bộ metric (như khi tắt timelapse)
  // Khi đã play (hasPlayed=true): luôn dùng metric của step hiện tại (kể cả khi pause)
  const tlByCode = useMemo(() => {
    if (!timelapseEnabled || timeSteps.length === 0 || !hasPlayed) return metricByCode;
    return dataByTime[timeSteps[currentStepIdx]]?.byCode ?? {};
  }, [timelapseEnabled, timeSteps, currentStepIdx, dataByTime, metricByCode, hasPlayed]);

  const tlByDrillCode = useMemo(() => {
    if (!timelapseEnabled || timeSteps.length === 0 || !hasPlayed) return metricByDrillCode;
    return dataByTime[timeSteps[currentStepIdx]]?.byDrillCode ?? {};
  }, [timelapseEnabled, timeSteps, currentStepIdx, dataByTime, metricByDrillCode, hasPlayed]);

  // ── Chọn bảng mapping theo cấp đang hiển thị ──────────────────────────────
  const activeMetric = (drillId || startAtDrillLevel || shouldShowAllCommunes) ? tlByDrillCode : tlByCode;

  // ── Projection ─────────────────────────────────────────────────────────────
  const rendered = useMemo(() => {
    if (!activeUnits.length) return null;
    const bounds = computeBounds(activeUnits);
    if (!isFinite(bounds.minLon)) return null;
    const project = makeProjection(bounds, width, height);
    return activeUnits.map(u => {
      const b = computeBounds([u]);
      const [cx, cy] = project((b.minLon + b.maxLon) / 2, (b.minLat + b.maxLat) / 2);
      return { ...u, d: geomToPath(u.geometry, project), cx, cy };
    });
  }, [activeUnits, width, height]);

  // hasDrillData = true khi dataset có cột mã xã (metricByDrillCode có data)
  const hasDrillData = useMemo(
    () => Object.keys(metricByDrillCode).length > 0,
    [metricByDrillCode],
  );

  // ── Color scale — tính theo activeMetric để range đúng khi drill ────────────
  // Timelapse: dùng globalMetricMin/Max để color scale nhất quán xuyên suốt animation
  // Không timelapse: tính per-step như bình thường
  const effectiveMetric = useMemo(() => {
    if (drillId || startAtDrillLevel || shouldShowAllCommunes) {
      return hasDrillData ? tlByDrillCode : tlByCode;
    }
    return tlByCode;
  }, [drillId, startAtDrillLevel, shouldShowAllCommunes, hasDrillData, tlByDrillCode, tlByCode]);

  const colorScale = useMemo(() => {
    const interp = INTERPOLATORS[colorScheme] ?? INTERPOLATORS['sequential.Blues'];
    if (timelapseEnabled && hasPlayed && globalMetricMax > globalMetricMin) {
      return makeColorScale(interp, globalMetricMin, globalMetricMax);
    }
    const vals = Object.values(effectiveMetric).filter(Number.isFinite);
    if (!vals.length) return makeColorScale(interp, 0, 1);
    return makeColorScale(interp, Math.min(...vals), Math.max(...vals));
  }, [effectiveMetric, colorScheme, timelapseEnabled, hasPlayed, globalMetricMin, globalMetricMax]);

  // Legend dùng global range khi timelapse để consistent
  const legend = useMemo(() => {
    let min: number, max: number;
    if (timelapseEnabled && hasPlayed && globalMetricMax > globalMetricMin) {
      min = globalMetricMin; max = globalMetricMax;
    } else {
      const vals = Object.values(effectiveMetric).filter(Number.isFinite);
      if (!vals.length) return null;
      min = Math.min(...vals); max = Math.max(...vals);
    }
    const steps = Array.from({ length: 6 }, (_, i) => min + ((max - min) * i) / 5);
    return { min, max, steps };
  }, [effectiveMetric, timelapseEnabled, hasPlayed, globalMetricMin, globalMetricMax]);

  // ── Zoom / pan ────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    setZoom(z => {
      const k = Math.max(1, Math.min(20, z.k * factor));
      if (k === z.k) return z;
      const r = k / z.k;
      return { k, tx: cx - (cx - z.tx) * r, ty: cy - (cy - z.ty) * r };
    });
  }, []);

  // Dùng global document listeners để drag hoạt động kể cả khi chuột ra ngoài SVG
  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    wasDraggedRef.current = false;
    const ox = zoom.tx, oy = zoom.ty, sx = e.clientX, sy = e.clientY;
    panRef.current = { dragging: true, sx, sy, ox, oy };
    setIsDragging(true);
    const onMove = (ev: PointerEvent) => {
      if (!panRef.current?.dragging) return;
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) wasDraggedRef.current = true;
      setZoom(z => ({ ...z, tx: ox + dx, ty: oy + dy }));
    };
    const onUp = () => {
      if (panRef.current) panRef.current.dragging = false;
      setIsDragging(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [zoom.tx, zoom.ty]);

  // ── Zoom button callbacks ─────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => {
    setZoom(z => {
      const k = Math.min(20, z.k * 1.4);
      const cx = width / 2;
      const cy = height / 2;
      const r = k / z.k;
      return { k, tx: cx - (cx - z.tx) * r, ty: cy - (cy - z.ty) * r };
    });
  }, [width, height]);

  const handleZoomOut = useCallback(() => {
    setZoom(z => {
      const k = Math.max(1, z.k / 1.4);
      const cx = width / 2;
      const cy = height / 2;
      const r = k / z.k;
      return { k, tx: cx - (cx - z.tx) * r, ty: cy - (cy - z.ty) * r };
    });
  }, [width, height]);

  const handleZoomReset = useCallback(() => {
    setZoom({ k: 1, tx: 0, ty: 0 });
  }, []);

  // ── Epi curve scrubber — click + drag để scrub timeline ─────────────────────
  const handleEpiPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsPlaying(false);
    setHasPlayed(true);
    const rect = epiRef.current?.getBoundingClientRect();
    const N = timeSteps.length;
    if (!rect || N === 0) return;
    const toStep = (cx: number) =>
      Math.max(0, Math.min(N - 1, Math.floor((cx - rect.left) / rect.width * N)));
    setCurrentStepIdx(toStep(e.clientX));
    const onMove = (ev: PointerEvent) => setCurrentStepIdx(toStep(ev.clientX));
    const onUp   = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup',   onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp);
  }, [timeSteps.length]);

  // ── Feature events ─────────────────────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.PointerEvent, u: MapUnit) => {
      const rect = containerRef.current?.getBoundingClientRect();
      setHovered(`${u.level}_${u.code || u.id}_${u.parentId || ''}`);
      setTooltip({
        x: e.clientX - (rect?.left ?? 0),
        y: e.clientY - (rect?.top ?? 0),
        id: u.id,
        code: u.code,
        name: u.name,
        value: (activeMetric[u.code] ?? activeMetric[u.id])
          ?? (drillId
              ? (tlByCode[drillCode ?? ''] ?? tlByCode[drillId])
              : startAtDrillLevel && u.parentId
                ? (tlByCode[idToProvinceCode[u.parentId] ?? ''] ?? tlByCode[u.parentId])
                : undefined),
      });
    },
    [activeMetric, drillId, drillCode, startAtDrillLevel, idToProvinceCode, tlByCode],
  );

  const handleMouseLeave = useCallback(() => {
    setHovered(null);
    setTooltip(null);
  }, []);

  const handleClick = useCallback(
    (u: MapUnit) => {
      if (wasDraggedRef.current) return;    // bỏ qua nếu user vừa drag bản đồ
      // startAtDrillLevel / shouldShowAllCommunes: đang ở cấp xã, không drill thêm
      if (!enableDrilldown || drillId || startAtDrillLevel || shouldShowAllCommunes) return;
      if (drillMap[u.id]?.length) {
        setDrillId(u.id);
        setDrillCode(u.code);
        setDrillName(u.name);
      }
    },
    [enableDrilldown, drillId, startAtDrillLevel, shouldShowAllCommunes, drillMap],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  if (mapError) {
    return (
      <div style={{ padding: 16, color: '#c00', fontSize: 13 }}>
        <b>Lỗi tải bản đồ:</b> {mapError}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsChartHovered(true)}
      onMouseLeave={() => setIsChartHovered(false)}
      style={{ position: 'relative', width, height, fontFamily: 'inherit', userSelect: 'none', overflow: 'hidden' }}
    >
      {/* ── SVG map — chiếm toàn bộ không gian ── */}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ display: 'block', cursor: isDragging ? 'grabbing' : zoom.k > 1 ? 'grab' : 'inherit' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
      >
        <g transform={`translate(${zoom.tx},${zoom.ty}) scale(${zoom.k})`}>
          {rendered?.map(item => {
            // Ưu tiên activeMetric[item.code] rồi activeMetric[item.id]
            // (id = code = mapCodeColumn; fallback item.id phòng trường hợp cấu hình khác)
            // Fallback về metric tỉnh cha chỉ khi dataset KHÔNG có data cấp xã
            // (tránh tô đều màu tỉnh cho tất cả xã khi chỉ 1 xã có data)
            const val = (activeMetric[item.code] ?? activeMetric[item.id])
              ?? (!hasDrillData
                  ? (drillId
                      // fallback: thử drillCode (province.code) rồi drillId (province UUID)
                      ? (tlByCode[drillCode ?? ''] ?? tlByCode[drillId])
                      : startAtDrillLevel && item.parentId
                        // fallback: thử province.code rồi thẳng parentId (UUID)
                        ? (tlByCode[idToProvinceCode[item.parentId] ?? ''] ?? tlByCode[item.parentId])
                        : undefined)
                  : undefined);
            const fill = val != null ? colorScale(val) : noDataColor;
            // Composite key: dùng code trước (commune_id duy nhất mỗi xã),
            // tránh trường hợp id = province_uuid bị dùng chung cho tất cả xã trong tỉnh.
            const reactKey = `${item.level}_${item.code || item.id}_${item.parentId || ''}`;
            const isHover = hovered === reactKey;
            const canDrill = enableDrilldown && !drillId && !startAtDrillLevel && !shouldShowAllCommunes && !!drillMap[item.id]?.length;
            return (
              <path
                key={reactKey}
                d={item.d}
                fill={fill}
                stroke={isHover ? '#222' : '#999'}
                strokeWidth={(isHover ? mapBorderWidth * 3 : (drillId || startAtDrillLevel || shouldShowAllCommunes) ? mapBorderWidth / 3 : mapBorderWidth) / zoom.k}
                style={{ cursor: canDrill ? 'pointer' : 'inherit', transition: 'stroke 80ms' }}
                onPointerMove={e => handleMouseMove(e, item)}
                onPointerLeave={handleMouseLeave}
                onPointerUp={() => handleClick(item)}
              />
            );
          })}

        </g>
      </svg>

      {/* ── Legend ── */}
      {legend && (
        <div
          style={{
            position: 'absolute', bottom: 12, right: 12,
            background: 'rgba(255,255,255,0.94)', padding: '6px 10px',
            border: '1px solid #ddd', borderRadius: 4, fontSize: 11,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{metricName}</div>
          <div
            style={{
              width: 120, height: 10,
              background: `linear-gradient(to right, ${legend.steps.map(s => colorScale(s)).join(',')})`,
              border: '1px solid #ccc',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 120, marginTop: 2 }}>
            <span>{fmtNum(legend.min)}</span>
            <span>{fmtNum(legend.max)}</span>
          </div>
        </div>
      )}

      {/* ── Tooltip ── */}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(tooltip.x + 14, width - 180),
            top: Math.min(tooltip.y + 14, height - 70),
            background: 'rgba(0,0,0,0.82)', color: '#fff',
            padding: '7px 10px', borderRadius: 4, fontSize: 12,
            maxWidth: 200, pointerEvents: 'none', zIndex: 20,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 3 }}>
            {tooltip.name}
            <span style={{ opacity: 0.55, fontWeight: 400, fontSize: 11 }}> ({tooltip.code})</span>
          </div>
          <div>{metricName}: <b>{fmtNum(tooltip.value)}</b></div>
          {enableDrilldown && !drillId && !startAtDrillLevel && !shouldShowAllCommunes && tooltip && (drillMap[tooltip.code]?.length || drillMap[tooltip.id ?? '']?.length) && (
            <div style={{ marginTop: 4, opacity: 0.6, fontStyle: 'italic', fontSize: 11 }}>
              Click để xem xã / phường
            </div>
          )}
        </div>
      )}

      {/* ── Floating back button (drill mode) ── */}
      {drillId && (
        <button
          onClick={() => {
        // Lưu drillId hiện tại vào ref để commune auto-drill biết không cần re-drill
        lastAutodrillRef.current = drillId;
        setDrillId(null); setDrillCode(null); setDrillName('');
      }}
          style={{
            position: 'absolute', top: 8, left: 8,
            background: 'rgba(255,255,255,0.92)', border: '1px solid #bbb',
            borderRadius: 4, padding: '4px 10px', fontSize: 12,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)', zIndex: 30,
          }}
        >
          ← {drillName}
        </button>
      )}

      {/* ── Floating zoom controls (right side, vertical) ── */}
      <div
        style={{
          position: 'absolute', right: 8, top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex', flexDirection: 'column', gap: 4,
          zIndex: 30,
        }}
      >
        {[
          { label: '+', title: 'Phóng to', fn: handleZoomIn },
          { label: '−', title: 'Thu nhỏ', fn: handleZoomOut },
          { label: '⊙', title: 'Về mặc định', fn: handleZoomReset },
        ].map(({ label, title, fn }) => (
          <button
            key={label}
            title={title}
            onClick={fn}
            style={{
              width: 28, height: 28, lineHeight: '28px',
              textAlign: 'center', padding: 0,
              background: 'rgba(255,255,255,0.88)',
              border: '1px solid #bbb', borderRadius: 4,
              fontSize: label === '⊙' ? 14 : 18, fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Loading indicator ── */}
      {loading && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,0.9)', padding: '4px 12px',
          borderRadius: 4, fontSize: 12, color: '#555',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)', zIndex: 30,
        }}>
          Đang tải bản đồ…
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !mapError && !rendered?.length && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: '#888',
        }}>
          {mapDatasetId
            ? drillId
              ? 'Không có dữ liệu xã cho tỉnh này.'
              : 'Không có dữ liệu tỉnh. Kiểm tra cấu hình cột và level.'
            : 'Chưa nhập Map Dataset ID.'}
        </div>
      )}

      {/* ── Timelapse timeline bar — chỉ hiện khi hover chart hoặc đang play ── */}
      {timelapseEnabled && timeSteps.length > 1 && (isChartHovered || isPlaying) && (() => {
        const N      = timeSteps.length;
        const maxVal = Math.max(...stepTotals, 1);
        const uid    = epiUidRef.current;
        const VW     = N * 10;
        const barColor = (total: number) => {
          if (total === 0) return 'transparent';
          const t = total / maxVal;
          return `hsl(0,85%,${Math.round(95 - 70 * t)}%)`;
        };
        return (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
            background: 'rgba(255,255,255,0.94)',
            borderTop: '1px solid #e0e0e0',
            padding: '6px 10px',
            display: 'flex', alignItems: 'center', gap: 7,
            boxShadow: '0 -2px 6px rgba(0,0,0,0.08)',
          }}>
            {/* Về tổng */}
            <button onClick={() => { setIsPlaying(false); setCurrentStepIdx(0); setHasPlayed(false); }}
              disabled={!hasPlayed} title="Về tổng" style={tlBtnStyle}>⟳</button>

            {/* Prev */}
            <button onClick={() => { setIsPlaying(false); setHasPlayed(true); setCurrentStepIdx(i => Math.max(0, i - 1)); }}
              disabled={currentStepIdx === 0} title="Bước trước" style={tlBtnStyle}>◀</button>

            {/* Play/Pause */}
            <button
              onClick={() => {
                if (currentStepIdx >= timeSteps.length - 1) setCurrentStepIdx(0);
                setHasPlayed(true); setIsPlaying(p => !p);
              }}
              title={isPlaying ? 'Tạm dừng' : 'Phát'}
              style={{ ...tlBtnStyle, minWidth: 32 }}
            >{isPlaying ? '⏸' : '▶'}</button>

            {/* Next */}
            <button onClick={() => { setIsPlaying(false); setHasPlayed(true); setCurrentStepIdx(i => Math.min(timeSteps.length - 1, i + 1)); }}
              disabled={currentStepIdx === timeSteps.length - 1} title="Bước tiếp" style={tlBtnStyle}>▶</button>

            {/* ── Epi curve scrubber ── */}
            <div
              ref={epiRef}
              onPointerDown={handleEpiPointerDown}
              style={{
                flex: 1, height: 36, position: 'relative',
                cursor: 'crosshair', borderRadius: 3, overflow: 'hidden',
                background: 'rgba(0,0,0,0.04)',
              }}
            >
              <svg
                width="100%" height={36}
                viewBox={`0 0 ${VW} 36`}
                preserveAspectRatio="none"
                style={{ display: 'block', pointerEvents: 'none' }}
              >
                <defs>
                  <filter id={`${uid}-hb`} x="-2%" width="104%" y="0%" height="100%">
                    <feGaussianBlur stdDeviation="1.2 0" />
                  </filter>
                  <linearGradient id={`${uid}-sh`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="white" stopOpacity="0.45" />
                    <stop offset="65%"  stopColor="white" stopOpacity="0" />
                  </linearGradient>
                </defs>

                <g filter={`url(#${uid}-hb)`}>
                  {stepTotals.map((total, i) => {
                    if (total === 0) return null;
                    const barH = Math.max(3, Math.round((total / maxVal) * 33));
                    return (
                      <rect key={i}
                        x={i * 10} y={36 - barH} width={10} height={barH}
                        fill={barColor(total)}
                      />
                    );
                  })}
                </g>

                <rect x={0} y={0} width={VW} height={36}
                  fill={`url(#${uid}-sh)`} pointerEvents="none" />

                {/* Current step indicator */}
                <rect x={currentStepIdx * 10} y={0} width={10} height={36}
                  fill="rgba(255,255,255,0.38)" pointerEvents="none" />
                <line
                  x1={currentStepIdx * 10 + 5} y1={1}
                  x2={currentStepIdx * 10 + 5} y2={35}
                  stroke="rgba(0,0,0,0.55)" strokeWidth={1.5}
                  pointerEvents="none"
                />

                {stepTotals.map((total, i) => (
                  <rect key={`t${i}`} x={i*10} y={0} width={10} height={36}
                    fill="transparent" pointerEvents="none">
                    <title>{fmtTimeStep(timeSteps[i])}: {fmtNum(total)}</title>
                  </rect>
                ))}
              </svg>
            </div>

            <span style={{ fontSize: 12, color: '#444', whiteSpace: 'nowrap', minWidth: 80, textAlign: 'right' }}>
              {hasPlayed ? fmtTimeStep(timeSteps[currentStepIdx]) : 'Tổng'}
            </span>
          </div>
        );
      })()}
    </div>
  );
};

export default EcdsRegionMap;
