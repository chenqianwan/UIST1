import { Fragment, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import type { MonitoringEvent } from './types';

const API_BASE = (import.meta.env.VITE_SEMANTIC_API_BASE ?? 'http://127.0.0.1:8008').replace(/\/$/, '');
const CANVAS_WIDTH = 760;
const CANVAS_HEIGHT = 620;
const SIDE_PANEL_WIDTH = 320;
const LAYOUT_WIDTH = CANVAS_WIDTH + SIDE_PANEL_WIDTH;
const DIMENSION_PANEL = {
  x: CANVAS_WIDTH - 16 - 470,
  y: CANVAS_HEIGHT - 16 - 96,
  w: 470,
  h: 96,
};
const MODIFY_PANEL = {
  x: CANVAS_WIDTH + SIDE_PANEL_WIDTH - 16 - 190,
  y: 92,
  w: 190,
  h: 190,
};
const TOTAL_LAYOUT_WIDTH = LAYOUT_WIDTH;
const MODIFY_SOURCE_PANEL = {
  x: CANVAS_WIDTH + 20,
  y: 320,
  w: SIDE_PANEL_WIDTH - 40,
  h: 170,
};
const EXPORT_PANEL = {
  x: CANVAS_WIDTH + 16,
  y: CANVAS_HEIGHT - 72,
  w: SIDE_PANEL_WIDTH - 32,
  h: 48,
};
const TRASH_PANEL = {
  x: 16,
  y: CANVAS_HEIGHT - 16 - 96,
  w: 192,
  h: 96,
};
const HEATMAP_GRID_X = 108;
const HEATMAP_GRID_Y = 64;
const HEATMAP_BLUR_STD = 1.55;
const HEATMAP_COLOR_LEVELS = 9;
const HEATMAP_RED_BAND_START = 0.82;

type AreaName = 'Canvas' | 'Modify' | 'Export' | 'Dimension' | 'Trash' | 'Other';
type Rect = { x: number; y: number; w: number; h: number };

function inRect(x: number, y: number, rect: { x: number; y: number; w: number; h: number }): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function resolveAreaName(x: number, y: number): AreaName {
  if (inRect(x, y, MODIFY_SOURCE_PANEL)) return 'Modify';
  if (inRect(x, y, DIMENSION_PANEL)) return 'Dimension';
  if (inRect(x, y, EXPORT_PANEL)) return 'Export';
  if (inRect(x, y, TRASH_PANEL)) return 'Trash';
  if (x <= CANVAS_WIDTH && y >= 0 && y <= CANVAS_HEIGHT) return 'Canvas';
  return 'Other';
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getSpaceRect(space: string): Rect | null {
  if (space === 'canvas') return { x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT };
  if (space === 'modify') return MODIFY_SOURCE_PANEL;
  if (space === 'export') return EXPORT_PANEL;
  if (space === 'dimension') return DIMENSION_PANEL;
  if (space === 'trash') return TRASH_PANEL;
  return null;
}

function mapEventToLayoutPoint(event: MonitoringEvent): { x: number; y: number } | null {
  const payload = event.payload ?? {};
  const space = payload.space_id;
  const u = payload.space_u;
  const v = payload.space_v;
  if (typeof space === 'string' && typeof u === 'number' && typeof v === 'number') {
    const rect = getSpaceRect(space);
    if (rect) {
      return {
        x: rect.x + clamp01(u) * rect.w,
        y: rect.y + clamp01(v) * rect.h,
      };
    }
  }

  const rawX = payload.x;
  const rawY = payload.y;
  if (typeof rawX !== 'number' || typeof rawY !== 'number') return null;
  const sourceW =
    typeof payload.layout_w === 'number' && payload.layout_w > 0
      ? payload.layout_w
      : typeof payload.canvas_w === 'number' && payload.canvas_w > 0
        ? payload.canvas_w
        : LAYOUT_WIDTH;
  const sourceH =
    typeof payload.layout_h === 'number' && payload.layout_h > 0
      ? payload.layout_h
      : typeof payload.canvas_h === 'number' && payload.canvas_h > 0
        ? payload.canvas_h
        : CANVAS_HEIGHT;
  let x = Math.max(0, Math.min(LAYOUT_WIDTH - 1, (rawX / sourceW) * LAYOUT_WIDTH));
  let y = Math.max(0, Math.min(CANVAS_HEIGHT - 1, (rawY / sourceH) * CANVAS_HEIGHT));
  if (event.component_id === 'side_panel_action') {
    const actionType = payload.action_type;
    const hoverRatioY =
      typeof payload.modify_ratio_y === 'number'
        ? Math.max(0, Math.min(1, payload.modify_ratio_y))
        : 0.5;
    const ratioY = event.event_name === 'action_executed'
      ? (actionType === 'delete' ? 0.34 : actionType === 'revise' ? 0.52 : actionType === 'add_clause' ? 0.7 : 0.5)
      : hoverRatioY;
    x = MODIFY_SOURCE_PANEL.x + MODIFY_SOURCE_PANEL.w * 0.5;
    y = MODIFY_SOURCE_PANEL.y + MODIFY_SOURCE_PANEL.h * ratioY;
  } else {
    x = Math.max(0, Math.min(LAYOUT_WIDTH - 1, x));
  }
  return { x, y };
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0s';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}

function getHeatWeight(event: MonitoringEvent): number {
  const payload = event.payload ?? {};
  const explicitWeight = payload.heat_weight;
  if (typeof explicitWeight === 'number' && explicitWeight > 0) return explicitWeight;
  const source = payload.source;
  if (source === 'hover_sample') return 0.12;
  if (source === 'node_detail_hover') return 0.12;
  if (source === 'modify_hover') return 0.45;
  if (source === 'canvas_click' || source === 'node_click') return 1;
  if (source === 'semantic_pull' || source === 'risk_pull' || source === 'time_pull') return 0.4;
  if (event.event_name === 'template_added' || event.event_name === 'node_selected') return 1;
  if (event.event_name === 'action_executed' || event.event_name === 'export_success') return 1;
  return 0.8;
}

function smoothHeatBucket(bucket: number[], gridX: number, gridY: number, passes = 2): number[] {
  let current = bucket.slice();
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Array<number>(current.length).fill(0);
    for (let y = 0; y < gridY; y += 1) {
      for (let x = 0; x < gridX; x += 1) {
        let sum = 0;
        let weightSum = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= gridX || ny < 0 || ny >= gridY) continue;
            const weight = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
            sum += current[ny * gridX + nx] * weight;
            weightSum += weight;
          }
        }
        next[y * gridX + x] = weightSum > 0 ? sum / weightSum : 0;
      }
    }
    current = next;
  }
  return current;
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const clamped = Math.max(0, Math.min(1, p));
  const idx = Math.floor((sortedValues.length - 1) * clamped);
  return sortedValues[idx];
}

function readParticipantIdFromLocation(): string | null {
  const queryParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash || '';
  const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const hashParams = new URLSearchParams(hashQuery);
  const raw = queryParams.get('pid')
    ?? queryParams.get('participant')
    ?? hashParams.get('pid')
    ?? hashParams.get('participant');
  const normalized = raw?.trim();
  return normalized ? normalized : null;
}

function mergeByEventId(base: MonitoringEvent[], incoming: MonitoringEvent[]): MonitoringEvent[] {
  if (incoming.length === 0) return base;
  const byId = new Map<string, MonitoringEvent>();
  base.forEach((event) => byId.set(event.id, event));
  incoming.forEach((event) => byId.set(event.id, event));
  return Array.from(byId.values())
    .sort((a, b) => a.ts - b.ts)
    .slice(-5000);
}

export default function AdminDashboard() {
  const participantId = readParticipantIdFromLocation();
  const [events, setEvents] = useState<MonitoringEvent[]>([]);
  const [isEventStreamOpen, setIsEventStreamOpen] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState<number>(Date.now());
  const latestTsRef = useRef<number>(events.length > 0 ? events[events.length - 1].ts : 0);
  const heatBucketRef = useRef<number[]>(new Array<number>(HEATMAP_GRID_X * HEATMAP_GRID_Y).fill(0));
  const heatPointsRef = useRef<number>(0);
  const heatWeightedPointsRef = useRef<number>(0);
  const heatSeenIdsRef = useRef<Set<string>>(new Set());
  const [heatmapVersion, setHeatmapVersion] = useState<number>(0);

  const resetHeatmapAccumulator = useCallback(() => {
    heatBucketRef.current = new Array<number>(HEATMAP_GRID_X * HEATMAP_GRID_Y).fill(0);
    heatPointsRef.current = 0;
    heatWeightedPointsRef.current = 0;
    heatSeenIdsRef.current = new Set();
    setHeatmapVersion((prev) => prev + 1);
  }, []);

  const ingestHeatmapEvents = useCallback((incoming: MonitoringEvent[]) => {
    if (incoming.length === 0) return;
    let ingested = 0;
    const bucket = heatBucketRef.current;
    const seen = heatSeenIdsRef.current;
    incoming.forEach((event) => {
      if (seen.has(event.id)) return;
      seen.add(event.id);
      if (event.component_id === 'side_panel_action') return;
      const point = mapEventToLayoutPoint(event);
      if (!point) return;
      const x = point.x;
      const y = point.y;
      const ix = Math.max(0, Math.min(HEATMAP_GRID_X - 1, Math.floor((x / TOTAL_LAYOUT_WIDTH) * HEATMAP_GRID_X)));
      const iy = Math.max(0, Math.min(HEATMAP_GRID_Y - 1, Math.floor((y / CANVAS_HEIGHT) * HEATMAP_GRID_Y)));
      const weight = getHeatWeight(event);
      bucket[iy * HEATMAP_GRID_X + ix] += weight;
      heatPointsRef.current += 1;
      heatWeightedPointsRef.current += weight;
      ingested += 1;
    });
    if (ingested > 0) {
      setHeatmapVersion((prev) => prev + 1);
    }
  }, []);

  useEffect(() => {
    setEvents([]);
    latestTsRef.current = 0;
    setExpandedEventId(null);
    resetHeatmapAccumulator();
  }, [participantId, resetHeatmapAccumulator]);

  useEffect(() => {
    let stopped = false;
    const fetchRemote = async () => {
      const sinceTs = latestTsRef.current;
      try {
        const participantQuery = participantId ? `&participant_id=${encodeURIComponent(participantId)}` : '';
        const response = await fetch(
          `${API_BASE}/monitoring/events?since_ts=${sinceTs}&limit=3000${participantQuery}`,
        );
        if (!response.ok) return;
        const data = (await response.json()) as { events?: MonitoringEvent[] };
        const next = Array.isArray(data.events) ? data.events : [];
        if (next.length === 0 || stopped) return;
        ingestHeatmapEvents(next);
        setEvents((prev) => {
          const merged = mergeByEventId(prev, next);
          latestTsRef.current = merged.length > 0 ? merged[merged.length - 1].ts : latestTsRef.current;
          return merged;
        });
      } catch {
        // Keep local dashboard usable even if backend is temporarily unreachable.
      }
    };
    void fetchRemote();
    const timer = window.setInterval(() => {
      void fetchRemote();
    }, 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [ingestHeatmapEvents, participantId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const metrics = useMemo(() => {
    const totalEvents = events.length;
    const sessions = new Set(events.map((event) => event.session_id)).size;
    const templateAdded = events.filter((event) => event.event_name === 'template_added').length;
    const nodeSelected = events.filter((event) => event.event_name === 'node_selected').length;
    const actionExecuted = events.filter((event) => event.event_name === 'action_executed').length;
    const exports = events.filter((event) => event.event_name === 'export_success').length;
    const hiddenMs = events
      .filter((event) => event.event_name === 'page_hidden_duration')
      .reduce((sum, event) => sum + Number(event.payload?.duration_ms ?? 0), 0);
    return {
      totalEvents,
      sessions,
      templateAdded,
      nodeSelected,
      actionExecuted,
      exports,
      hiddenMs,
    };
  }, [events]);

  const heatmap = useMemo(() => {
    const gridX = HEATMAP_GRID_X;
    const gridY = HEATMAP_GRID_Y;
    const points = heatPointsRef.current;
    const weightedPoints = heatWeightedPointsRef.current;
    const smoothBucket = smoothHeatBucket(heatBucketRef.current, gridX, gridY, 5);
    const constrainedBucket = smoothBucket.map((value, index) => {
      if (value <= 0) return 0;
      const cellW = TOTAL_LAYOUT_WIDTH / gridX;
      const cx = (index % gridX) * cellW + cellW * 0.5;
      if (cx > LAYOUT_WIDTH) return 0;
      return value;
    });
    const max = constrainedBucket.reduce((acc, value) => Math.max(acc, value), 0);
    const shares =
      weightedPoints > 0
        ? constrainedBucket
            .filter((value) => value > 0)
            .map((value) => value / weightedPoints)
            .sort((a, b) => a - b)
        : [];
    const shareLower = percentile(shares, 0.2);
    const shareUpper = Math.max(percentile(shares, 0.992), shareLower + 1e-8);
    return { gridX, gridY, bucket: constrainedBucket, max, points, weightedPoints, shareLower, shareUpper };
  }, [heatmapVersion]);

  const modifyExpandedHeatmap = useMemo(() => {
    const gridX = 40;
    const gridY = 40;
    const bucket = new Array<number>(gridX * gridY).fill(0);
    let points = 0;
    let weightedPoints = 0;
    events.forEach((event) => {
      if (event.component_id !== 'side_panel_action') return;
      if (event.event_name !== 'canvas_interaction' && event.event_name !== 'action_executed') return;
      const payload = event.payload ?? {};
      const actionType = payload.action_type;
      const rawX = payload.x;
      const rawY = payload.y;
      const sourceW =
        typeof payload.layout_w === 'number' && payload.layout_w > 0
          ? payload.layout_w
          : typeof payload.canvas_w === 'number' && payload.canvas_w > 0
            ? payload.canvas_w
            : LAYOUT_WIDTH;
      const sourceH =
        typeof payload.layout_h === 'number' && payload.layout_h > 0
          ? payload.layout_h
          : typeof payload.canvas_h === 'number' && payload.canvas_h > 0
            ? payload.canvas_h
            : CANVAS_HEIGHT;

      const hasRawPoint = typeof rawX === 'number' && typeof rawY === 'number';
      const layoutX = hasRawPoint ? Math.max(0, Math.min(LAYOUT_WIDTH - 1, (rawX / sourceW) * LAYOUT_WIDTH)) : null;
      const layoutY = hasRawPoint ? Math.max(0, Math.min(CANVAS_HEIGHT - 1, (rawY / sourceH) * CANVAS_HEIGHT)) : null;

      const fallbackRatioY =
        typeof payload.modify_ratio_y === 'number'
          ? Math.max(0, Math.min(1, payload.modify_ratio_y))
          : event.event_name === 'action_executed'
            ? (actionType === 'delete' ? 0.34 : actionType === 'revise' ? 0.52 : actionType === 'add_clause' ? 0.7 : 0.5)
            : 0.5;
      const fallbackRatioX = event.event_name === 'action_executed'
        ? (actionType === 'delete' ? 0.35 : actionType === 'revise' ? 0.5 : actionType === 'add_clause' ? 0.65 : 0.5)
        : 0.5;

      const ratioX = layoutX == null
        ? fallbackRatioX
        : clamp01((layoutX - MODIFY_SOURCE_PANEL.x) / MODIFY_SOURCE_PANEL.w);
      const ratioY = layoutY == null
        ? fallbackRatioY
        : clamp01((layoutY - MODIFY_SOURCE_PANEL.y) / MODIFY_SOURCE_PANEL.h);
      const ix = Math.max(0, Math.min(gridX - 1, Math.floor(ratioX * gridX)));
      const iy = Math.max(0, Math.min(gridY - 1, Math.floor(ratioY * gridY)));
      const weight = getHeatWeight(event);
      bucket[iy * gridX + ix] += weight;
      points += 1;
      weightedPoints += weight;
    });
    const smoothBucket = smoothHeatBucket(bucket, gridX, gridY, 4);
    const max = smoothBucket.reduce((acc, value) => Math.max(acc, value), 0);
    const shares =
      weightedPoints > 0
        ? smoothBucket
            .filter((value) => value > 0)
            .map((value) => value / weightedPoints)
            .sort((a, b) => a - b)
        : [];
    const shareLower = percentile(shares, 0.2);
    const shareUpper = Math.max(percentile(shares, 0.992), shareLower + 1e-8);
    return { gridX, gridY, bucket: smoothBucket, max, points, weightedPoints, shareLower, shareUpper };
  }, [events]);

  const unifiedHeatScale = useMemo(() => {
    const totalWeighted = heatmap.weightedPoints + modifyExpandedHeatmap.weightedPoints;
    if (totalWeighted <= 0) {
      return {
        totalWeighted: 0,
        shareLower: 0,
        shareUpper: 1e-8,
      };
    }
    const mainShares = heatmap.bucket
      .filter((value) => value > 0)
      .map((value) => value / totalWeighted);
    const modifyShares = modifyExpandedHeatmap.bucket
      .filter((value) => value > 0)
      .map((value) => value / totalWeighted);
    const shares = [...mainShares, ...modifyShares].sort((a, b) => a - b);
    const shareLower = percentile(shares, 0.2);
    const shareUpper = Math.max(percentile(shares, 0.992), shareLower + 1e-8);
    return { totalWeighted, shareLower, shareUpper };
  }, [heatmap, modifyExpandedHeatmap]);

  const areaMetrics = useMemo(() => {
    const areaPx: Record<AreaName, number> = {
      Canvas: CANVAS_WIDTH * CANVAS_HEIGHT,
      Modify: MODIFY_SOURCE_PANEL.w * MODIFY_SOURCE_PANEL.h,
      Export: EXPORT_PANEL.w * EXPORT_PANEL.h,
      Dimension: DIMENSION_PANEL.w * DIMENSION_PANEL.h,
      Trash: TRASH_PANEL.w * TRASH_PANEL.h,
      Other: Math.max(
        1,
        TOTAL_LAYOUT_WIDTH * CANVAS_HEIGHT -
          CANVAS_WIDTH * CANVAS_HEIGHT -
          MODIFY_SOURCE_PANEL.w * MODIFY_SOURCE_PANEL.h -
          EXPORT_PANEL.w * EXPORT_PANEL.h -
          DIMENSION_PANEL.w * DIMENSION_PANEL.h -
          TRASH_PANEL.w * TRASH_PANEL.h,
      ),
    };
    const sums: Record<AreaName, number> = {
      Canvas: 0,
      Modify: 0,
      Export: 0,
      Dimension: 0,
      Trash: 0,
      Other: 0,
    };
    events.slice(-2000).forEach((event) => {
      if (event.component_id === 'side_panel_action') {
        sums.Modify += getHeatWeight(event);
        return;
      }
      const point = mapEventToLayoutPoint(event);
      if (!point) return;
      const x = point.x;
      const y = point.y;
      const area = resolveAreaName(x, y);
      sums[area] += getHeatWeight(event);
    });
    const total = Object.values(sums).reduce((acc, value) => acc + value, 0);
    return (Object.keys(sums) as AreaName[])
      .map((area) => {
        const weight = sums[area];
        return {
          area,
          weight,
          share: total > 0 ? weight / total : 0,
          density: weight / Math.max(1, areaPx[area]),
        };
      })
      .sort((a, b) => b.share - a.share);
  }, [events]);

  const stageTiming = useMemo(() => {
    const starts = events
      .filter((event) => event.component_id === 'template_gate' && event.payload?.timer_action === 'start')
      .sort((a, b) => a.ts - b.ts);
    const latestStart = starts[starts.length - 1];
    if (!latestStart) return null;

    const tailEvents = events.filter((event) => event.ts >= latestStart.ts).sort((a, b) => a.ts - b.ts);
    const exportStart = tailEvents.find(
      (event) => event.component_id === 'template_gate' && event.payload?.timer_action === 'export_start',
    );
    const exportSuccess = tailEvents.find((event) => event.event_name === 'export_success');
    const endTs = exportSuccess?.ts ?? nowTs;
    const exportingStart = exportStart?.ts;
    const exportingMs = exportingStart ? Math.max(0, endTs - exportingStart) : 0;
    const nonExportEndTs = exportingStart ?? endTs;

    const timelineEvents = tailEvents.filter((event) => {
      if (event.ts > nonExportEndTs) return false;
      if (event.event_name === 'canvas_interaction') return true;
      if (event.event_name === 'node_selected' || event.event_name === 'template_added' || event.event_name === 'node_deleted' || event.event_name === 'action_executed') {
        return true;
      }
      return false;
    });

    const isDimensionEvent = (event: MonitoringEvent): boolean => {
      if (event.event_name !== 'canvas_interaction') return false;
      if (event.payload?.space_id === 'dimension') return true;
      const source = event.payload?.source;
      if (source === 'semantic_pull' || source === 'risk_pull' || source === 'time_pull') return true;
      if (source === 'hover_sample') {
        const point = mapEventToLayoutPoint(event);
        if (point) return inRect(point.x, point.y, DIMENSION_PANEL);
      }
      return false;
    };

    const isModifyEvent = (event: MonitoringEvent): boolean => {
      if (event.event_name === 'template_added' || event.event_name === 'node_deleted') return true;
      if (event.event_name === 'action_executed') return true;
      if (event.event_name === 'canvas_interaction' && event.component_id === 'side_panel_action') {
        return event.payload?.source === 'modify_hover';
      }
      return false;
    };

    let dimensionActionMsRaw = 0;
    let modifyingActionMsRaw = 0;
    for (let i = 0; i < timelineEvents.length; i += 1) {
      const event = timelineEvents[i];
      const currentTs = event.ts;
      const nextTs = i + 1 < timelineEvents.length ? timelineEvents[i + 1].ts : nonExportEndTs;
      const delta = Math.max(0, Math.min(nonExportEndTs, nextTs) - currentTs);
      if (delta <= 0) continue;
      if (isDimensionEvent(event)) {
        dimensionActionMsRaw += delta;
        continue;
      }
      if (isModifyEvent(event)) {
        modifyingActionMsRaw += delta;
      }
    }

    const taskTotalMs = Math.max(1, endTs - latestStart.ts);
    const modifyingActionMs = Math.min(modifyingActionMsRaw, Math.max(0, nonExportEndTs - latestStart.ts));
    const availableForDimension = Math.max(0, nonExportEndTs - latestStart.ts - modifyingActionMs);
    const dimensionActionMs = Math.min(dimensionActionMsRaw, availableForDimension);
    const otherActionMs = Math.max(0, taskTotalMs - exportingMs - modifyingActionMs - dimensionActionMs);
    const totalMs = taskTotalMs;
    return {
      startedAt: latestStart.ts,
      ended: Boolean(exportSuccess),
      totalMs,
      otherActionMs,
      dimensionActionMs,
      modifyingMs: modifyingActionMs,
      exportingMs,
    };
  }, [events, nowTs]);

  return (
    <div className="min-h-screen w-screen overflow-y-auto bg-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Admin Monitoring</h2>
            <a
              href="#/main"
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Back to Main
            </a>
          </div>
          <p className="mt-1 text-xs text-slate-500">Realtime monitoring for UIST interaction study (software-only instrumentation).</p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">Sessions</p><p className="text-xl font-semibold text-slate-800">{metrics.sessions}</p></div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">Total Events</p><p className="text-xl font-semibold text-slate-800">{metrics.totalEvents}</p></div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">Template Added</p><p className="text-xl font-semibold text-slate-800">{metrics.templateAdded}</p></div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">Node Selected</p><p className="text-xl font-semibold text-slate-800">{metrics.nodeSelected}</p></div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">Action Executed</p><p className="text-xl font-semibold text-slate-800">{metrics.actionExecuted}</p></div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">Export Success</p><p className="text-xl font-semibold text-slate-800">{metrics.exports}</p></div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:col-span-2">
            <p className="text-xs text-slate-500">Background Time (proxy of external search/use)</p>
            <p className="text-xl font-semibold text-slate-800">{Math.round(metrics.hiddenMs / 1000)}s</p>
          </div>
        </div>

        <div className="w-full md:w-[420px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Task Stage Timeline</h3>
            {stageTiming ? (
              <span className="text-xs text-slate-500">
                {stageTiming.ended ? 'Completed' : 'Running'} · started {formatTs(stageTiming.startedAt)}
              </span>
            ) : (
              <span className="text-xs text-slate-500">No active task</span>
            )}
          </div>
          {stageTiming ? (
            <>
              <div className="h-3 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                <div className="flex h-full w-full">
                  <div
                    className="h-full bg-blue-400"
                    style={{ width: `${(stageTiming.otherActionMs / stageTiming.totalMs) * 100}%` }}
                    title={`Other Action ${formatDuration(stageTiming.otherActionMs)}`}
                  />
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${(stageTiming.dimensionActionMs / stageTiming.totalMs) * 100}%` }}
                    title={`Dimension Control ${formatDuration(stageTiming.dimensionActionMs)}`}
                  />
                  <div
                    className="h-full bg-violet-400"
                    style={{ width: `${(stageTiming.modifyingMs / stageTiming.totalMs) * 100}%` }}
                    title={`Modifying ${formatDuration(stageTiming.modifyingMs)}`}
                  />
                  <div
                    className="h-full bg-emerald-400"
                    style={{ width: `${(stageTiming.exportingMs / stageTiming.totalMs) * 100}%` }}
                    title={`Exporting ${formatDuration(stageTiming.exportingMs)}`}
                  />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-4">
                <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="font-semibold text-blue-600">Other Action</div>
                  <div>{formatDuration(stageTiming.otherActionMs)}</div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="font-semibold text-amber-600">Dimension Control</div>
                  <div>{formatDuration(stageTiming.dimensionActionMs)}</div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="font-semibold text-violet-600">Modifying</div>
                  <div>{formatDuration(stageTiming.modifyingMs)}</div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="font-semibold text-emerald-600">Exporting</div>
                  <div>{formatDuration(stageTiming.exportingMs)}</div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500">Start from default/upload template to begin timing.</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Interaction Heatmap</h3>
            <span className="text-xs text-slate-500">
              {heatmap.points} samples (weighted {heatmap.weightedPoints.toFixed(1)} / total {unifiedHeatScale.totalWeighted.toFixed(1)})
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 p-2">
            <div className="mx-auto w-full max-w-[980px] rounded-md border border-slate-200 bg-white p-1 shadow-sm">
              <svg viewBox={`0 0 ${TOTAL_LAYOUT_WIDTH} ${CANVAS_HEIGHT}`} className="h-auto w-full">
              <defs>
                <filter id="heatmap-soft-blur" x="-5%" y="-5%" width="110%" height="110%">
                  <feGaussianBlur stdDeviation={HEATMAP_BLUR_STD} />
                </filter>
                <clipPath id="heatmap-clip">
                  <rect x={0} y={0} width={TOTAL_LAYOUT_WIDTH} height={CANVAS_HEIGHT} />
                </clipPath>
              </defs>
              <rect x={0} y={0} width={TOTAL_LAYOUT_WIDTH} height={CANVAS_HEIGHT} fill="#f9fbff" />
              <rect x={0.5} y={0.5} width={TOTAL_LAYOUT_WIDTH - 1} height={CANVAS_HEIGHT - 1} fill="none" stroke="#d6deea" strokeWidth={1} />
              <rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#f7faff" />
              <rect x={CANVAS_WIDTH} y={0} width={SIDE_PANEL_WIDTH} height={CANVAS_HEIGHT} fill="#f7faff" />
              <line x1={CANVAS_WIDTH} y1={0} x2={CANVAS_WIDTH} y2={CANVAS_HEIGHT} stroke="#d4ddea" strokeWidth={1.8} />
              <g filter="url(#heatmap-soft-blur)" clipPath="url(#heatmap-clip)">
                {heatmap.bucket.map((count, index) => {
                  if (count <= 0 || heatmap.max <= 0 || unifiedHeatScale.totalWeighted <= 0) return null;
                  const cellW = TOTAL_LAYOUT_WIDTH / heatmap.gridX;
                  const cellH = CANVAS_HEIGHT / heatmap.gridY;
                  const x = (index % heatmap.gridX) * cellW;
                  const y = Math.floor(index / heatmap.gridX) * cellH;
                  const share = count / unifiedHeatScale.totalWeighted;
                  const stretched = (share - unifiedHeatScale.shareLower) / (unifiedHeatScale.shareUpper - unifiedHeatScale.shareLower);
                  const normalized = Math.max(0, Math.min(1, stretched));
                  // Smoothstep keeps more values in the mid-band (yellow/orange) vs hard red/green split.
                  const smooth = normalized * normalized * (3 - 2 * normalized);
                  const intensity = Math.pow(smooth, 0.95);
                  // Quantize into visible bands so users can distinguish levels more easily.
                  const levelCount = Math.max(2, HEATMAP_COLOR_LEVELS);
                  const level = Math.round(intensity * (levelCount - 1));
                  const band = level / (levelCount - 1);
                  // Keep red only for peak values; most bands stay blue->yellow.
                  const redStart = HEATMAP_RED_BAND_START;
                  const h = band < redStart
                    ? 220 - (band / redStart) * 170
                    : 50 - ((band - redStart) / (1 - redStart)) * 46;
                  const s = 74 + band * 18;
                  const l = 87 - band * 42;
                  const a = 0.2 + band * 0.66;
                  return (
                    <rect
                      key={`heat-cell-${index}`}
                      x={x}
                      y={y}
                      width={cellW + 0.35}
                      height={cellH + 0.35}
                      fill={`hsla(${h}, ${s}%, ${l}%, ${a})`}
                    />
                  );
                })}
              </g>
              <rect x={DIMENSION_PANEL.x} y={DIMENSION_PANEL.y} width={DIMENSION_PANEL.w} height={DIMENSION_PANEL.h} fill="none" stroke="#6f8aa2" strokeOpacity={0.72} strokeWidth={1.5} strokeDasharray="6 7" />
              <rect x={EXPORT_PANEL.x} y={EXPORT_PANEL.y} width={EXPORT_PANEL.w} height={EXPORT_PANEL.h} fill="none" stroke="#867da4" strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="6 7" />
              <rect x={TRASH_PANEL.x} y={TRASH_PANEL.y} width={TRASH_PANEL.w} height={TRASH_PANEL.h} fill="none" stroke="#8b8f9d" strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="6 7" />
              <rect x={MODIFY_SOURCE_PANEL.x} y={MODIFY_SOURCE_PANEL.y} width={MODIFY_SOURCE_PANEL.w} height={MODIFY_SOURCE_PANEL.h} fill="none" stroke="#7a86a6" strokeOpacity={0.45} strokeWidth={1.2} strokeDasharray="4 6" />
              <text x={12} y={24} fill="#475569" fontSize={14} fontWeight={600}>
                Main Canvas Area
                </text>
              <text x={CANVAS_WIDTH + 12} y={24} fill="#64748b" fontSize={13}>
                Side Panel Area
                </text>
              <text x={MODIFY_SOURCE_PANEL.x + 8} y={MODIFY_SOURCE_PANEL.y - 8} fill="#7583a0" fontSize={10.8} fontWeight={600}>
                Modify origin in side panel
              </text>
              <text x={DIMENSION_PANEL.x + 10} y={DIMENSION_PANEL.y - 8} fill="#647f97" fontSize={11.5} fontWeight={600}>
                Dimension Control Panel
                </text>
              <text x={EXPORT_PANEL.x + 10} y={EXPORT_PANEL.y - 8} fill="#726e98" fontSize={11.5} fontWeight={600}>
                Export Area
                </text>
              <text x={TRASH_PANEL.x + 10} y={TRASH_PANEL.y - 8} fill="#7e8392" fontSize={11.5} fontWeight={600}>
                Trash Area
              </text>
              </svg>
            </div>
          </div>
        </div>

        <div className="w-[320px] max-w-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Modify Expanded Heatmap</h3>
            <span className="text-xs text-slate-500">
              {modifyExpandedHeatmap.points} samples (weighted {modifyExpandedHeatmap.weightedPoints.toFixed(1)} / total {unifiedHeatScale.totalWeighted.toFixed(1)})
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 p-2">
            <div className="w-full rounded-md border border-slate-200 bg-white p-1 shadow-sm">
              <svg viewBox={`0 0 ${MODIFY_PANEL.w} ${MODIFY_PANEL.h}`} className="h-auto w-full">
                <defs>
                  <filter id="modify-heatmap-soft-blur" x="-8%" y="-8%" width="116%" height="116%">
                    <feGaussianBlur stdDeviation={HEATMAP_BLUR_STD} />
                  </filter>
                  <clipPath id="modify-heatmap-clip">
                    <rect x={0} y={0} width={MODIFY_PANEL.w} height={MODIFY_PANEL.h} />
                  </clipPath>
                </defs>
                <rect x={0} y={0} width={MODIFY_PANEL.w} height={MODIFY_PANEL.h} fill="#f9fbff" />
                <rect x={0.5} y={0.5} width={MODIFY_PANEL.w - 1} height={MODIFY_PANEL.h - 1} fill="none" stroke="#d6deea" strokeWidth={1} />
                <g filter="url(#modify-heatmap-soft-blur)" clipPath="url(#modify-heatmap-clip)">
                  {modifyExpandedHeatmap.bucket.map((count, index) => {
                    if (count <= 0 || modifyExpandedHeatmap.max <= 0 || unifiedHeatScale.totalWeighted <= 0) return null;
                    const cellW = MODIFY_PANEL.w / modifyExpandedHeatmap.gridX;
                    const cellH = MODIFY_PANEL.h / modifyExpandedHeatmap.gridY;
                    const x = (index % modifyExpandedHeatmap.gridX) * cellW;
                    const y = Math.floor(index / modifyExpandedHeatmap.gridX) * cellH;
                    const share = count / unifiedHeatScale.totalWeighted;
                    const stretched = (share - unifiedHeatScale.shareLower) / (unifiedHeatScale.shareUpper - unifiedHeatScale.shareLower);
                    const normalized = Math.max(0, Math.min(1, stretched));
                    const smooth = normalized * normalized * (3 - 2 * normalized);
                    const intensity = Math.pow(smooth, 0.95);
                    const levelCount = Math.max(2, HEATMAP_COLOR_LEVELS);
                    const level = Math.round(intensity * (levelCount - 1));
                    const band = level / (levelCount - 1);
                    const redStart = HEATMAP_RED_BAND_START;
                    const h = band < redStart
                      ? 220 - (band / redStart) * 170
                      : 50 - ((band - redStart) / (1 - redStart)) * 46;
                    const s = 74 + band * 18;
                    const l = 87 - band * 42;
                    const a = 0.2 + band * 0.66;
                    return (
                      <rect
                        key={`modify-heat-cell-${index}`}
                        x={x}
                        y={y}
                        width={cellW + 0.28}
                        height={cellH + 0.28}
                        fill={`hsla(${h}, ${s}%, ${l}%, ${a})`}
                      />
                    );
                  })}
                </g>
                <rect x={0.5} y={0.5} width={MODIFY_PANEL.w - 1} height={MODIFY_PANEL.h - 1} fill="none" stroke="#7a86a6" strokeOpacity={0.65} strokeWidth={1.4} strokeDasharray="6 7" />
                <text x={10} y={16} fill="#6b7ea0" fontSize={11.5} fontWeight={600}>
                  Modify Area (expanded)
                </text>
              </svg>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Area Interest Ranking</h3>
            <span className="text-xs text-slate-500">Normalized share and density</span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {areaMetrics.map((item) => (
              <div key={item.area} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-xs font-semibold text-slate-700">{item.area}</p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-slate-700"
                    style={{
                      width: `${Math.max(4, Math.round(item.share * 100))}%`,
                      opacity: 0.45 + Math.min(0.5, item.share * 1.2),
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">Share {Math.round(item.share * 100)}%</p>
                <p className="text-[11px] text-slate-500">Density {(item.density * 10000).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-2 text-left"
            onClick={() => setIsEventStreamOpen((prev) => !prev)}
          >
            <h3 className="text-sm font-semibold text-slate-700">Event Stream</h3>
            <span className="text-xs text-slate-500">
              {isEventStreamOpen ? 'Collapse' : 'Expand'} ({Math.min(events.length, 400)} rows)
            </span>
          </button>

          {isEventStreamOpen && (
            <div className="h-[44vh] overflow-auto border-t border-slate-200 px-4 py-2">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-slate-500">
                    <th className="py-1 pr-2">Time</th>
                    <th className="py-1 pr-2">Event</th>
                    <th className="py-1 pr-2">Route</th>
                    <th className="py-1 pr-2">Component</th>
                    <th className="py-1 pr-2">Node</th>
                    <th className="py-1 pr-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(-400).reverse().map((event) => (
                    <Fragment key={event.id}>
                      <tr className="border-t border-slate-100 text-slate-700">
                        <td className="py-1 pr-2">{formatTs(event.ts)}</td>
                        <td className="py-1 pr-2 font-medium">{event.event_name}</td>
                        <td className="py-1 pr-2">{event.route}</td>
                        <td className="py-1 pr-2">{event.component_id ?? '-'}</td>
                        <td className="py-1 pr-2">{event.node_id ?? '-'}</td>
                        <td className="py-1 pr-2">
                          <button
                            type="button"
                            onClick={() => setExpandedEventId((prev) => (prev === event.id ? null : event.id))}
                            className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                          >
                            {expandedEventId === event.id ? 'Hide' : 'View'}
                          </button>
                        </td>
                      </tr>
                      {expandedEventId === event.id && (
                        <tr className="border-t border-slate-100 bg-slate-50/60 text-slate-700">
                          <td className="px-2 py-2" colSpan={6}>
                            <pre className="whitespace-pre-wrap break-words text-[11px]">
                              {JSON.stringify(
                                {
                                  id: event.id,
                                  session_id: event.session_id,
                                  task_id: event.task_id,
                                  payload: event.payload ?? null,
                                },
                                null,
                                2,
                              )}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

