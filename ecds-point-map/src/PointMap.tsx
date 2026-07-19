import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SupersetClient } from '@superset-ui/core';
import { EcdsPointMapProps, MapPoint } from './types';

// ─── Geometry helpers ─────────────────────────────────────────────────────────

type Geometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: any };

interface BgUnit {
  id: string;
  code: string;
  name: string;
  level: number;
  parentId: string | null;
  geometry: Geometry;
}

interface Bounds {
  minLon: number; maxLon: number;
  minLat: number; maxLat: number;
}

function computeBoundsFromUnits(units: BgUnit[]): Bounds {
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
    if (g.type === 'Polygon')           visit(g.coordinates, 2);
    else if (g.type === 'MultiPolygon') visit(g.coordinates, 3);
  }
  return { minLon, maxLon, minLat, maxLat };
}

function computeBoundsFromPoints(points: MapPoint[]): Bounds {
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  for (const p of points) {
    if (p.lng < minLon) minLon = p.lng;
    if (p.lng > maxLon) maxLon = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  const padLon = Math.max((maxLon - minLon) * 0.1, 0.5);
  const padLat = Math.max((maxLat - minLat) * 0.1, 0.5);
  return {
    minLon: minLon - padLon, maxLon: maxLon + padLon,
    minLat: minLat - padLat, maxLat: maxLat + padLat,
  };
}

function makeProjection(bounds: Bounds, width: number, height: number, padding = 12) {
  const w = width  - padding * 2;
  const h = height - padding * 2;
  const lonRange = bounds.maxLon - bounds.minLon || 1;
  const latRange = bounds.maxLat - bounds.minLat || 1;
  const midLat   = (bounds.minLat + bounds.maxLat) / 2;
  const cosLat   = Math.cos((midLat * Math.PI) / 180);
  const scale    = Math.min(w / (lonRange * cosLat), h / latRange);
  const mapW     = lonRange * cosLat * scale;
  const mapH     = latRange * scale;
  const offX     = padding + (w - mapW) / 2;
  const offY     = padding + (h - mapH) / 2;
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

// ─── Pie helper ───────────────────────────────────────────────────────────────

function pieSlicePath(
  cx: number, cy: number, r: number,
  a0: number, a1: number,
): string {
  const x1 = cx + r * Math.cos(a0);
  const y1 = cy + r * Math.sin(a0);
  const x2 = cx + r * Math.cos(a1);
  const y2 = cy + r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${cx},${cy} L${x1},${y1} A${r},${r},0,${large},1,${x2},${y2} Z`;
}

// ─── Bubble size ──────────────────────────────────────────────────────────────

function bubbleRadius(
  total: number, minVal: number, maxVal: number,
  rMin: number, rMax: number,
): number {
  if (maxVal <= minVal) return (rMin + rMax) / 2;
  return rMin + (rMax - rMin) * Math.sqrt(Math.max(0, (total - minVal) / (maxVal - minVal)));
}

// ─── Error helper ────────────────────────────────────────────────────────────
function errMsg(err: any): string {
  if (err instanceof Response) return `HTTP ${err.status}`;
  if (err?.message)            return String(err.message);
  return String(err);
}

// ─── Superset API (dùng SupersetClient để hỗ trợ embedded/guest token) ────────

async function fetchRawMapRows(datasetId: number, cols: string[]): Promise<Array<Record<string, any>>> {
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

async function fetchBgUnits(
  datasetId: number,
  idCol: string,
  codeCol: string,
  nameCol: string,
  geojsonCol: string,
  levelCol: string,
  parentIdCol: string,
): Promise<BgUnit[]> {
  const cols = Array.from(new Set([idCol, codeCol, nameCol, geojsonCol, levelCol, parentIdCol].filter(Boolean)));
  const rows: Array<Record<string, any>> = await fetchRawMapRows(datasetId, cols);
  const uniqueLevels = [...new Set(rows.map(r => r[levelCol]))].sort();
  console.log('[PointMap] fetchBgUnits RAW rows from API:', rows.length, '| unique levels:', uniqueLevels, '| cols requested:', cols);

  const units: BgUnit[] = [];
  for (const row of rows) {
    const raw = row[geojsonCol];
    if (!raw) continue;
    try {
      const g = typeof raw === 'string' ? JSON.parse(raw) : raw;
      let geom: Geometry | null = null;
      if (g?.type === 'Polygon' || g?.type === 'MultiPolygon') geom = g;
      else if (g?.type === 'Feature' && g.geometry) geom = g.geometry;
      if (!geom) continue;
      units.push({
        id:       String(row[idCol]       ?? '').trim(),
        code:     String(row[codeCol || idCol] ?? '').trim(),
        name:     String(row[nameCol]     ?? '').trim(),
        level:    Number(row[levelCol]),
        parentId: row[parentIdCol] ? String(row[parentIdCol]).trim() : null,
        geometry: geom,
      });
    } catch (_) {}
  }
  return units;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtNum = (v: number) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(v);

// Format giá trị timeStep thành ngày dễ đọc
const fmtTimeStep = (s: string): string => {
  // ISO date/datetime: 2024-01-15  |  2024-01-15T00:00:00  |  2024-01-15T00:00:00.000000
  const isoDate = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (isoDate) {
    const [, y, m, d] = isoDate;
    return `${d}/${m}/${y}`;
  }
  // Tháng: 2024-01
  const ym = s.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    const [, y, m] = ym;
    return `${parseInt(m, 10)}/${y}`;
  }
  // Unix timestamp (mili/giây)
  if (/^\d{10,13}$/.test(s)) {
    const ms = s.length >= 13 ? parseInt(s, 10) : parseInt(s, 10) * 1000;
    const dt = new Date(ms);
    if (!isNaN(dt.getTime()))
      return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
  }
  return s;
};

// ─── Component ────────────────────────────────────────────────────────────────

// Style cho các nút timelapse
const tlBtnStyle: React.CSSProperties = {
  width: 28, height: 28, padding: 0, border: '1px solid #bbb',
  borderRadius: 4, background: 'rgba(255,255,255,0.88)',
  cursor: 'pointer', display: 'flex', alignItems: 'center',
  justifyContent: 'center', fontSize: 13, fontWeight: 700,
  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
};

const EcdsPointMap: React.FC<EcdsPointMapProps> = ({
  width,
  height,
  mapDatasetId,
  mapIdColumn,
  mapCodeColumn,
  mapNameColumn,
  mapGeojsonColumn,
  mapLevelColumn,
  mapParentIdColumn,
  mapTopLevel,
  mapDrillLevel,
  mapFillColor,
  mapStrokeColor,
  mapBorderWidth,
  enableDrilldown,
  startAtDrillLevel,
  queriedProvinceCodes,
  queriedProvinceNames,
  queriedCommuneCodes,
  points,
  hasMetric,
  hasGroupby,
  pointColor,
  pointSizeMin,
  pointSizeMax,
  metricName,
  groupbyName,
  labelColorMap,
  timelapseEnabled,
  timeSteps,
  pointsByTime,
  stepTotals,
  timelapseSpeed,
  globalPointMin,
  globalPointMax,
}) => {
  // ── Timelapse state ────────────────────────────────────────────────────────
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying,      setIsPlaying]      = useState(false);
  const [hasPlayed,      setHasPlayed]      = useState(false); // true sau khi bấm play lần đầu
  const [isChartHovered, setIsChartHovered] = useState(false);
  // ── Bản đồ nền ───────────────────────────────────────────────────────────
  const [topBgUnits,  setTopBgUnits]  = useState<BgUnit[]>([]);
  const [drillBgMap,  setDrillBgMap]  = useState<Record<string, BgUnit[]>>({});
  const [loadingBg,   setLoadingBg]   = useState(false);
  const [bgError,     setBgError]     = useState<string | null>(null);

  // ── Drill state ───────────────────────────────────────────────────────────
  const [drillId,   setDrillId]   = useState<string | null>(null);
  const [drillName, setDrillName] = useState('');

  // ── Fetch background ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDatasetId) { setTopBgUnits([]); setDrillBgMap({}); return; }
    let cancelled = false;
    setLoadingBg(true);
    setBgError(null);

    fetchBgUnits(mapDatasetId, mapIdColumn, mapCodeColumn, mapNameColumn, mapGeojsonColumn, mapLevelColumn, mapParentIdColumn)
      .then(units => {
        if (cancelled) return;
        const top: BgUnit[]                       = [];
        const drill: Record<string, BgUnit[]>     = {};

        for (const u of units) {
          if (u.level === mapTopLevel) {
            top.push(u);
          } else if (u.level === mapDrillLevel && u.parentId) {
            if (!drill[u.parentId]) drill[u.parentId] = [];
            drill[u.parentId].push(u);
          }
        }
        console.log('[PointMap] bgUnits loaded | top:', top.length, '| drillMap keys:', Object.keys(drill).length, '| mapTopLevel:', mapTopLevel, '| mapDrillLevel:', mapDrillLevel);
        setTopBgUnits(top);
        setDrillBgMap(drill);
        setLoadingBg(false);
      })
      .catch(err => {
        if (!cancelled) { setBgError(errMsg(err)); setLoadingBg(false); }
      });

    return () => { cancelled = true; };
  }, [mapDatasetId, mapIdColumn, mapCodeColumn, mapNameColumn, mapGeojsonColumn, mapLevelColumn, mapParentIdColumn, mapTopLevel, mapDrillLevel]);

  // Reset zoom khi đổi drill level
  useEffect(() => { setZoom({ k: 1, tx: 0, ty: 0 }); }, [drillId]);

  // ── Active background units ───────────────────────────────────────────────
  const allDrillBgUnits = useMemo(
    () => Object.values(drillBgMap).flat(),
    [drillBgMap],
  );

  // Lookup commune code/id → province id (dùng sớm để build filteredTopBgUnits)
  const communeCodeToProvinceId = useMemo(() => {
    const m: Record<string, string> = {};
    Object.entries(drillBgMap).forEach(([provinceId, communes]) => {
      communes.forEach(c => {
        if (c.id)   m[c.id]   = provinceId;
        if (c.code) m[c.code] = provinceId;
      });
    });
    return m;
  }, [drillBgMap]);

  // Province IDs chứa các xã được filter — dùng cho Step 4 của filteredTopBgUnits
  const resolvedCommuneProvinceIds = useMemo(() => {
    const ids = new Set<string>();
    queriedCommuneCodes.forEach(c => {
      const pid = communeCodeToProvinceId[c];
      if (pid) ids.add(pid);
    });
    return ids;
  }, [queriedCommuneCodes, communeCodeToProvinceId]);

  // Lọc tỉnh theo native filter — union approach để cover mọi trường hợp không có data
  const filteredTopBgUnits = useMemo(() => {
    const hasAnyProvinceHint = queriedProvinceCodes.length > 0 || queriedProvinceNames.length > 0;
    const hasAnyCommuneHint  = resolvedCommuneProvinceIds.size > 0;
    if (!hasAnyProvinceHint && !hasAnyCommuneHint) return topBgUnits;

    const matchedIds = new Set<string>();

    // Bước 1: tỉnh có điểm trong data (provinceCode của points khớp với u.code)
    const ptCodes = new Set(points.map(p => p.provinceCode).filter(Boolean));
    topBgUnits.forEach(u => { if (ptCodes.has(u.code)) matchedIds.add(u.id); });

    // Bước 2: tỉnh từ queriedProvinceCodes (cover tỉnh được filter nhưng không có điểm)
    if (queriedProvinceCodes.length) {
      const codeSet = new Set(queriedProvinceCodes);
      topBgUnits.forEach(u => {
        if (codeSet.has(u.code) || codeSet.has(u.id) || codeSet.has(u.name))
          matchedIds.add(u.id);
      });
    }

    // Bước 3: tỉnh từ queriedProvinceNames (native filter theo tên tỉnh)
    if (queriedProvinceNames.length) {
      const nameSet = new Set(queriedProvinceNames.map(n => n.toLowerCase()));
      topBgUnits.forEach(u => { if (nameSet.has(u.name.toLowerCase())) matchedIds.add(u.id); });
    }

    // Bước 4: tỉnh chứa xã được filter (khi filter xã mà không có điểm nào)
    resolvedCommuneProvinceIds.forEach(pid => matchedIds.add(pid));

    if (matchedIds.size > 0) {
      const result = topBgUnits.filter(u => matchedIds.has(u.id));
      // Nếu matchedIds non-empty nhưng không có topBgUnit nào khớp
      // (có thể resolvedCommuneProvinceIds chứa drillMap key không khớp topUnit.id)
      // → fallback show all để không bị blank map
      if (result.length > 0) return result;
    }
    return topBgUnits;
  }, [topBgUnits, queriedProvinceCodes, queriedProvinceNames, points, resolvedCommuneProvinceIds]);

  // Auto-drill khi native filter chọn đúng 1 tỉnh
  const lastAutodrillRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enableDrilldown || startAtDrillLevel) return;
    if (filteredTopBgUnits.length === 1 && Object.keys(drillBgMap).length > 0) {
      const province = filteredTopBgUnits[0];
      if (province.id !== lastAutodrillRef.current && drillBgMap[province.id]?.length) {
        lastAutodrillRef.current = province.id;
        setDrillId(province.id);
        setDrillName(province.name);
      }
    } else if (filteredTopBgUnits.length !== 1) {
      if (lastAutodrillRef.current !== null) {
        lastAutodrillRef.current = null;
        setDrillId(null);
        setDrillName('');
      }
    }
  }, [filteredTopBgUnits, enableDrilldown, startAtDrillLevel, drillBgMap]);

  // Background: khi filter tỉnh → hiện filteredTopBgUnits; khi drill → hiện xã
  // Fallback: khi drillId set nhưng drillBgMap[drillId] rỗng → show filteredTopBgUnits (tránh blank)
  // startAtDrillLevel: lọc communes theo filteredTopBgUnits nếu có, nếu không fallback về tỉnh
  const filteredDrillBgUnits = useMemo(() => {
    const allowedParents = new Set(filteredTopBgUnits.map(u => u.id));
    return allDrillBgUnits.filter(u => u.parentId && allowedParents.has(u.parentId));
  }, [allDrillBgUnits, filteredTopBgUnits]);

  // Cấp tỉnh (không drill, không startAtDrillLevel): 2+ tỉnh khớp data → hiện ranh giới
  // toàn quốc thay vì chỉ N tỉnh đó (dễ nhận biết vị trí tương đối, tránh bản đồ "vỡ" khi
  // filter/RLS thu hẹp còn vài tỉnh rải rác). 0 hoặc 1 tỉnh khớp thì giữ nguyên logic cũ.
  const topLevelBgUnits = useMemo(
    () => (filteredTopBgUnits.length > 1 ? topBgUnits : filteredTopBgUnits),
    [filteredTopBgUnits, topBgUnits],
  );

  const activeBgUnits: BgUnit[] = drillId
    ? (drillBgMap[drillId]?.length ? drillBgMap[drillId] : filteredTopBgUnits)
    : startAtDrillLevel
      ? (filteredDrillBgUnits.length > 0 ? filteredDrillBgUnits : filteredTopBgUnits)
      : topLevelBgUnits;

  // Vùng để "fit" camera — LUÔN theo đúng vùng có dữ liệu (không theo activeBgUnits),
  // vì activeBgUnits ở cấp tỉnh có thể là toàn quốc (khi 2+ tỉnh khớp data, xem
  // topLevelBgUnits ở trên) chỉ để vẽ ranh giới làm ngữ cảnh — không nên dùng để zoom,
  // nếu không bubble sẽ bị lọt thỏm/to bất thường so với tỷ lệ bản đồ.
  const fitBgUnits: BgUnit[] = drillId
    ? (drillBgMap[drillId]?.length ? drillBgMap[drillId] : filteredTopBgUnits)
    : startAtDrillLevel
      ? (filteredDrillBgUnits.length > 0 ? filteredDrillBgUnits : filteredTopBgUnits)
      : filteredTopBgUnits;

  // ── Projection ────────────────────────────────────────────────────────────
  const project = useMemo(() => {
    if (fitBgUnits.length > 0) {
      const b = computeBoundsFromUnits(fitBgUnits);
      if (isFinite(b.minLon)) return makeProjection(b, width, height);
    }
    if (points.length > 0) {
      const b = computeBoundsFromPoints(points);
      if (isFinite(b.minLon)) return makeProjection(b, width, height);
    }
    return null;
  }, [fitBgUnits, points, width, height]);

  // Mức zoom out tối thiểu — mặc định (k=1) fit khít vùng dữ liệu (fitBgUnits) để bubble
  // hiển thị đúng tỉ lệ; nới k xuống dưới 1 để user chủ động zoom out/scroll xem hết
  // ranh giới cả nước (topBgUnits) khi cần, thay vì ép hiện toàn quốc ngay từ đầu.
  const minZoomK = useMemo(() => {
    if (!project) return 1;
    const countryBounds = computeBoundsFromUnits(topBgUnits);
    if (!isFinite(countryBounds.minLon)) return 1;
    const corners: Array<[number, number]> = [
      project(countryBounds.minLon, countryBounds.minLat),
      project(countryBounds.minLon, countryBounds.maxLat),
      project(countryBounds.maxLon, countryBounds.minLat),
      project(countryBounds.maxLon, countryBounds.maxLat),
    ];
    const xs = corners.map(c => c[0]);
    const ys = corners.map(c => c[1]);
    const pxW = Math.max(...xs) - Math.min(...xs);
    const pxH = Math.max(...ys) - Math.min(...ys);
    if (pxW <= 0 || pxH <= 0) return 1;
    return Math.min(1, width / pxW, height / pxH);
  }, [project, topBgUnits, width, height]);

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

  // Reset về step 0 khi timeSteps thay đổi (data load mới)
  // Dùng join('|') làm stable key để tránh re-render spam khi transformProps
  // trả về array reference mới nhưng nội dung như cũ (vd: kéo speed slider).
  const timeStepsKey = timeSteps.join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setCurrentStepIdx(0); setIsPlaying(false); setHasPlayed(false); }, [timeStepsKey]);

  // Điểm hiển thị theo bước timelapse:
  // - Khi chưa bấm play lần nào (hasPlayed=false): trả về toàn bộ data như khi tắt timelapse
  // - Khi đã play (hasPlayed=true): luôn hiện data của step hiện tại (kể cả khi pause)
  //   → tránh jump về "cộng dồn" sau khi timelapse kết thúc
  const activePoints = useMemo(() => {
    if (!timelapseEnabled || timeSteps.length === 0 || !hasPlayed) return points;
    return pointsByTime[timeSteps[currentStepIdx]] ?? [];
  }, [timelapseEnabled, timeSteps, currentStepIdx, pointsByTime, points, hasPlayed]);

  // Bubble scale: dùng global min/max khi đã từng play để scale nhất quán trong suốt session
  const { minTotal, maxTotal } = useMemo(() => {
    if (timelapseEnabled && hasPlayed && timeSteps.length > 0) {
      return { minTotal: globalPointMin, maxTotal: globalPointMax };
    }
    if (!points.length) return { minTotal: 0, maxTotal: 1 };
    const vals = points.map(p => p.total);
    return { minTotal: Math.min(...vals), maxTotal: Math.max(...vals) };
  }, [points, timelapseEnabled, timeSteps.length, globalPointMin, globalPointMax]);

  // ── Zoom / pan ────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const [zoom,       setZoom]       = useState({ k: 1, tx: 0, ty: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const panRef        = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  // Track xem user có thực sự drag (di chuyển >4px) không — nếu có thì block click
  const wasDraggedRef = useRef(false);
  // Epi curve scrubber
  const epiRef    = useRef<HTMLDivElement>(null);
  const epiUidRef = useRef(`epi${Math.random().toString(36).slice(2, 7)}`);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    setZoom(z => {
      const k = Math.max(minZoomK, Math.min(20, z.k * factor));
      if (k === z.k) return z;
      const r = k / z.k;
      return { k, tx: cx - (cx - z.tx) * r, ty: cy - (cy - z.ty) * r };
    });
  }, [minZoomK]);

  // Dùng Pointer Events API thay vì Mouse Events:
  // - onPointerDown/pointermove/pointerup hoạt động tốt trong cả embedded iframe lẫn direct
  // - Không cần e.preventDefault() — tránh block click synthesis trong Chromium iframe
  // - Drilldown dùng onPointerUp thay vì onClick để đảm bảo hoạt động trong mọi context
  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    console.log('[PointMap] pointerdown on SVG — pointerType:', e.pointerType, 'button:', e.button);
    wasDraggedRef.current = false;
    const ox = zoom.tx, oy = zoom.ty, sx = e.clientX, sy = e.clientY;
    panRef.current = { sx, sy, ox, oy };
    setIsDragging(true);
    const onMove = (ev: PointerEvent) => {
      if (!panRef.current) return;
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) wasDraggedRef.current = true;
      setZoom(z => ({ ...z, tx: ox + dx, ty: oy + dy }));
    };
    const onUp = () => {
      panRef.current = null;
      setIsDragging(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [zoom.tx, zoom.ty]);

  const handleZoomIn    = useCallback(() => setZoom(z => { const k = Math.min(20, z.k * 1.4); const cx = width/2, cy = height/2, r = k/z.k; return { k, tx: cx-(cx-z.tx)*r, ty: cy-(cy-z.ty)*r }; }), [width, height]);
  const handleZoomOut   = useCallback(() => setZoom(z => { const k = Math.max(minZoomK, z.k / 1.4); const cx = width/2, cy = height/2, r = k/z.k; return { k, tx: cx-(cx-z.tx)*r, ty: cy-(cy-z.ty)*r }; }), [width, height, minZoomK]);
  const handleZoomReset = useCallback(() => setZoom({ k: 1, tx: 0, ty: 0 }), []);

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

  // ── Tooltip ───────────────────────────────────────────────────────────────
  const [tooltip, setTooltip] = useState<{ x: number; y: number; point: MapPoint } | null>(null);
  const handlePtEnter = useCallback((e: React.PointerEvent, pt: MapPoint) => {
    const rect = containerRef.current?.getBoundingClientRect();
    setTooltip({ x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0), point: pt });
  }, []);
  const handlePtLeave = useCallback(() => setTooltip(null), []);

  // ── Background paths ──────────────────────────────────────────────────────
  const bgPaths = useMemo(() => {
    if (!project || !activeBgUnits.length) return [];
    return activeBgUnits.map(u => ({
      id:       u.id,
      name:     u.name,
      d:        geomToPath(u.geometry, project),
      hasDrill: enableDrilldown && !drillId && !startAtDrillLevel && !!(drillBgMap[u.id]?.length),
    }));
  }, [activeBgUnits, project, enableDrilldown, drillId, startAtDrillLevel, drillBgMap]);

  // ── Province code của tỉnh đang drill (để filter points) ────────────────────
  const drillProvinceCode = useMemo(() => {
    if (!drillId) return null;
    return topBgUnits.find(u => u.id === drillId)?.code ?? null;
  }, [drillId, topBgUnits]);

  // ── Lookup: province code → province id (để drill từ point) ─────────────────
  const codeToProvinceId = useMemo(() => {
    const m: Record<string, string> = {};
    topBgUnits.forEach(u => { if (u.code) m[u.code] = u.id; });
    return m;
  }, [topBgUnits]);

  // ── Auto-drill khi native filter chọn xã (chỉ khi xã thuộc đúng 1 tỉnh) ────
  useEffect(() => {
    if (!enableDrilldown || startAtDrillLevel || drillId) return;
    if (!queriedCommuneCodes.length || !Object.keys(communeCodeToProvinceId).length) return;
    // Nhiều tỉnh → không auto-drill (background tỉnh vẫn hiện, points đã SQL-filter)
    const provinceIds = new Set(
      queriedCommuneCodes.map(c => communeCodeToProvinceId[c]).filter(Boolean),
    );
    if (provinceIds.size !== 1) return;
    const provinceId = communeCodeToProvinceId[queriedCommuneCodes[0]];
    if (!provinceId || !drillBgMap[provinceId]?.length) return;
    // Không re-drill sau khi user bấm nút Back
    if (lastAutodrillRef.current === provinceId) return;
    const province = topBgUnits.find(u => u.id === provinceId);
    lastAutodrillRef.current = provinceId;
    setDrillId(provinceId);
    setDrillName(province?.name ?? provinceId);
  }, [queriedCommuneCodes, communeCodeToProvinceId, drillBgMap, topBgUnits, enableDrilldown, startAtDrillLevel, drillId]);

  // ── Click vào point → drill vào tỉnh đó ─────────────────────────────────────
  const handlePointClick = useCallback((pt: MapPoint) => {
    console.log('[PointMap] pointerup on point | wasDragged:', wasDraggedRef.current, '| enableDrilldown:', enableDrilldown, '| drillId:', drillId, '| provinceCode:', pt.provinceCode);
    if (wasDraggedRef.current) return;
    if (!enableDrilldown || drillId || startAtDrillLevel) return;
    if (!pt.provinceCode) return;
    const pid = codeToProvinceId[pt.provinceCode];
    console.log('[PointMap] resolved provinceId:', pid, '| drillBgMap[pid]?.length:', drillBgMap[pid]?.length);
    if (!pid || !drillBgMap[pid]?.length) return;
    const province = topBgUnits.find(u => u.id === pid);
    setDrillId(pid);
    setDrillName(province?.name ?? pt.provinceCode);
  }, [enableDrilldown, drillId, startAtDrillLevel, codeToProvinceId, drillBgMap, topBgUnits]);

  // ── Points projected — filter theo tỉnh khi đang drill, theo bước timelapse ─
  const projectedPoints = useMemo(() => {
    if (!project || !activePoints.length) return [];
    const filtered = drillProvinceCode
      ? activePoints.filter(pt => !pt.provinceCode || pt.provinceCode === drillProvinceCode)
      : activePoints;
    return filtered
      .map(pt => {
        const [x, y] = project(pt.lng, pt.lat);
        return { ...pt, x, y };
      })
      // Chỉ giữ điểm nằm trong viewport (±50px buffer)
      .filter(pt => pt.x > -50 && pt.x < width + 50 && pt.y > -50 && pt.y < height + 50);
  }, [activePoints, project, width, height, drillProvinceCode]);

  const getRadius = useCallback(
    (total: number) =>
      hasMetric ? bubbleRadius(total, minTotal, maxTotal, pointSizeMin, pointSizeMax) : pointSizeMin,
    [hasMetric, minTotal, maxTotal, pointSizeMin, pointSizeMax],
  );

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderPoint = (
    pt: MapPoint & { x: number; y: number },
    r: number,
  ) => {
    if (hasGroupby && pt.segments.length > 1) {
      const total = pt.total || 1;
      let angle = -Math.PI / 2;
      const slices = pt.segments.map(seg => {
        const sweep = (seg.value / total) * 2 * Math.PI;
        const path = (
          <path
            key={seg.label}
            d={pieSlicePath(pt.x, pt.y, r, angle, angle + sweep)}
            fill={seg.color}
            stroke="#fff"
            strokeWidth={0.5 / zoom.k}
          />
        );
        angle += sweep;
        return path;
      });
      slices.push(
        <circle key="b" cx={pt.x} cy={pt.y} r={r}
          fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth={0.8 / zoom.k} />,
      );
      return slices;
    }
    const fill = hasGroupby && pt.segments[0] ? pt.segments[0].color : pointColor;
    return (
      <circle cx={pt.x} cy={pt.y} r={r}
        fill={fill} fillOpacity={0.85}
        stroke="rgba(0,0,0,0.2)" strokeWidth={0.8 / zoom.k} />
    );
  };

  // DEBUG — log mỗi khi bgPaths thay đổi để kiểm tra hasDrill
  const drillablePaths = bgPaths.filter(bp => bp.hasDrill).length;
  if (bgPaths.length > 0) {
    console.log('[PointMap] bgPaths:', bgPaths.length, '| drillable:', drillablePaths, '| enableDrilldown:', enableDrilldown, '| startAtDrillLevel:', startAtDrillLevel);
  }

  const categoryLegend = hasGroupby && Object.keys(labelColorMap).length > 0
    ? Object.entries(labelColorMap) : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width, height, userSelect: 'none', overflow: 'hidden' }}
      onMouseEnter={() => setIsChartHovered(true)}
      onMouseLeave={() => setIsChartHovered(false)}
    >
      <svg
        ref={svgRef}
        width={width} height={height}
        style={{ display: 'block', cursor: isDragging ? 'grabbing' : zoom.k > 1 ? 'grab' : 'inherit' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
      >
        <g transform={`translate(${zoom.tx},${zoom.ty}) scale(${zoom.k})`}>
          {/* ── Background polygons — click để drill (fallback khi không có point) ── */}
          {bgPaths.map(bp => (
            <path
              key={bp.id}
              d={bp.d}
              fill={mapFillColor}
              stroke={mapStrokeColor}
              strokeWidth={(drillId || startAtDrillLevel ? mapBorderWidth / 3 : mapBorderWidth) / zoom.k}
              style={{ cursor: bp.hasDrill ? 'pointer' : 'inherit' }}
              onPointerEnter={() => console.log('[PointMap] pointerenter path', bp.id, 'hasDrill:', bp.hasDrill)}
              onPointerLeave={() => {}}
              onPointerUp={() => {
                console.log('[PointMap] pointerup on path', bp.id, '| hasDrill:', bp.hasDrill, '| wasDragged:', wasDraggedRef.current, '| enableDrilldown:', enableDrilldown, '| drillBgMap keys:', Object.keys(drillBgMap).length);
                if (wasDraggedRef.current) return;
                if (bp.hasDrill) { setDrillId(bp.id); setDrillName(bp.name); }
              }}
            />
          ))}

          {/* ── Points — hover tooltip + click để drill vào tỉnh ── */}
          {projectedPoints.map((pt, i) => {
            const r = getRadius(pt.total);
            const canDrill = enableDrilldown && !drillId && !startAtDrillLevel && !!pt.provinceCode && !!codeToProvinceId[pt.provinceCode];
            return (
              <g key={i}
                onPointerEnter={e => handlePtEnter(e, pt)}
                onPointerLeave={handlePtLeave}
                onPointerUp={() => handlePointClick(pt)}
                style={{ cursor: canDrill ? 'pointer' : 'inherit' }}
              >
                {renderPoint(pt, r)}
              </g>
            );
          })}
        </g>
      </svg>

      {/* ── Floating back button ── */}
      {drillId && (
        <button
          onClick={() => { lastAutodrillRef.current = drillId; setDrillId(null); setDrillName(''); }}
          style={{
            position: 'absolute', top: 8, left: 8, zIndex: 30,
            background: 'rgba(255,255,255,0.92)', border: '1px solid #bbb',
            borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }}
        >
          ← {drillName}
        </button>
      )}

      {/* ── Floating zoom controls ── */}
      <div style={{
        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: 4, zIndex: 30,
      }}>
        {[
          { label: '+', title: 'Phóng to',   fn: handleZoomIn },
          { label: '−', title: 'Thu nhỏ',     fn: handleZoomOut },
          { label: '⊙', title: 'Mặc định',    fn: handleZoomReset },
        ].map(({ label, title, fn }) => (
          <button key={label} title={title} onClick={fn}
            style={{
              width: 28, height: 28, padding: 0, border: '1px solid #bbb',
              borderRadius: 4, background: 'rgba(255,255,255,0.88)',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: label === '⊙' ? 14 : 18,
              fontWeight: 700, boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Loading ── */}
      {loadingBg && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,0.9)', padding: '4px 12px',
          borderRadius: 4, fontSize: 12, color: '#555',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)', zIndex: 30,
        }}>
          Đang tải bản đồ nền…
        </div>
      )}

      {bgError && (
        <div style={{
          position: 'absolute', top: 8, left: 8, right: 44, zIndex: 30,
          background: 'rgba(255,240,240,0.95)', border: '1px solid #fca5a5',
          borderRadius: 4, padding: '4px 10px', fontSize: 12, color: '#b91c1c',
        }}>
          Lỗi tải bản đồ: {bgError}
        </div>
      )}

      {/* ── Category legend (bottom-left) ── */}
      {categoryLegend && (
        <div style={{
          position: 'absolute', bottom: 12, left: 12, zIndex: 20,
          background: 'rgba(255,255,255,0.94)', border: '1px solid #ddd',
          borderRadius: 4, padding: '6px 10px', fontSize: 11, maxWidth: 180,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{groupbyName || 'Phân loại'}</div>
          {categoryLegend.map(([label, color]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%', background: color,
                flexShrink: 0, display: 'inline-block',
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Bubble size legend ── */}
      {hasMetric && !hasGroupby && (
        <div style={{
          position: 'absolute', bottom: 12, left: 12, zIndex: 20,
          background: 'rgba(255,255,255,0.94)', border: '1px solid #ddd',
          borderRadius: 4, padding: '6px 10px', fontSize: 11,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{metricName}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            {[minTotal, (minTotal + maxTotal) / 2, maxTotal].map((v, i) => {
              const r = getRadius(v);
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <svg width={r*2+2} height={r*2+2}>
                    <circle cx={r+1} cy={r+1} r={r}
                      fill={pointColor} fillOpacity={0.7}
                      stroke="rgba(0,0,0,0.2)" strokeWidth={0.8} />
                  </svg>
                  <span style={{ fontSize: 9, whiteSpace: 'nowrap' }}>{fmtNum(v)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tooltip ── */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: Math.min(tooltip.x + 14, width - 220),
          top:  Math.min(tooltip.y + 14, height - 120),
          background: 'rgba(0,0,0,0.82)', color: '#fff',
          padding: '8px 11px', borderRadius: 4, fontSize: 12,
          maxWidth: 220, pointerEvents: 'none', zIndex: 40,
        }}>
          {tooltip.point.label && (
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{tooltip.point.label}</div>
          )}
          <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 4 }}>
            {tooltip.point.lat.toFixed(5)}, {tooltip.point.lng.toFixed(5)}
          </div>
          {hasMetric && (
            <div style={{ marginBottom: hasGroupby ? 6 : 0 }}>
              {metricName || 'Tổng'}: <b>{fmtNum(tooltip.point.total)}</b>
            </div>
          )}
          {hasGroupby && tooltip.point.segments.map(seg => (
            <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: seg.color, flexShrink: 0, display: 'inline-block',
              }} />
              <span style={{ flex: 1 }}>{seg.label}</span>
              <b>{fmtNum(seg.value)}</b>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loadingBg && !activePoints.length && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: '#888',
        }}>
          Không có điểm nào. Kiểm tra cột vĩ độ/kinh độ và bộ lọc.
        </div>
      )}

      {/* ── Timelapse timeline bar ── */}
      {timelapseEnabled && timeSteps.length > 1 && (isChartHovered || isPlaying) && (() => {
        const N      = timeSteps.length;
        const maxVal = Math.max(...stepTotals, 1);
        const uid    = epiUidRef.current;
        const VW     = N * 10; // viewBox units: 10 per step
        // Màu bar: transparent (0 ca) → hồng nhạt → đỏ đậm (max ca)
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
                  {/* Blur ngang nhẹ — màu các bước chuyển mượt */}
                  <filter id={`${uid}-hb`} x="-2%" width="104%" y="0%" height="100%">
                    <feGaussianBlur stdDeviation="1.2 0" />
                  </filter>
                  {/* Sheen trắng từ trên xuống */}
                  <linearGradient id={`${uid}-sh`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="white" stopOpacity="0.45" />
                    <stop offset="65%"  stopColor="white" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Bars (blurred horizontally for smooth color transition) */}
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

                {/* Sheen overlay */}
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

                {/* Tooltip titles */}
                {stepTotals.map((total, i) => (
                  <rect key={`t${i}`} x={i*10} y={0} width={10} height={36}
                    fill="transparent" pointerEvents="none"
                  >
                    <title>{fmtTimeStep(timeSteps[i])}: {fmtNum(total)}</title>
                  </rect>
                ))}
              </svg>
            </div>

            {/* Label ngày hiện tại */}
            <span style={{ fontSize: 12, color: '#444', whiteSpace: 'nowrap', minWidth: 80, textAlign: 'right' }}>
              {hasPlayed ? fmtTimeStep(timeSteps[currentStepIdx]) : 'Tổng'}
            </span>
          </div>
        );
      })()}
    </div>
  );
};

export default EcdsPointMap;
