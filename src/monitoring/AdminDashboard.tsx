import { Fragment, useMemo, useState, useEffect } from 'react';
import { listMonitoringEvents, subscribeMonitoringEvents } from './collector';
import type { MonitoringEvent } from './types';

const CANVAS_WIDTH = 760;
const CANVAS_HEIGHT = 620;
const SIDE_PANEL_WIDTH = 320;
const LAYOUT_WIDTH = CANVAS_WIDTH + SIDE_PANEL_WIDTH;
const EXPANDED_PANEL_GAP = 22;
const DIMENSION_PANEL = {
  x: CANVAS_WIDTH - 16 - 470,
  y: CANVAS_HEIGHT - 16 - 96,
  w: 470,
  h: 96,
};
const MODIFY_PANEL = {
  x: LAYOUT_WIDTH + EXPANDED_PANEL_GAP,
  y: 190,
  w: 190,
  h: 280,
};
const TOTAL_LAYOUT_WIDTH = MODIFY_PANEL.x + MODIFY_PANEL.w;
const MODIFY_SOURCE_PANEL = {
  x: CANVAS_WIDTH + 20,
  y: 280,
  w: SIDE_PANEL_WIDTH - 40,
  h: 180,
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
const HEATMAP_GRID_X = 86;
const HEATMAP_GRID_Y = 50;
const HEATMAP_BLUR_STD = 1.95;

type AreaName = 'Canvas' | 'Modify' | 'Export' | 'Dimension' | 'Trash' | 'Other';

function inRect(x: number, y: number, rect: { x: number; y: number; w: number; h: number }): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function resolveAreaName(x: number, y: number): AreaName {
  if (inRect(x, y, MODIFY_PANEL)) return 'Modify';
  if (inRect(x, y, DIMENSION_PANEL)) return 'Dimension';
  if (inRect(x, y, EXPORT_PANEL)) return 'Export';
  if (inRect(x, y, TRASH_PANEL)) return 'Trash';
  if (x <= CANVAS_WIDTH && y >= 0 && y <= CANVAS_HEIGHT) return 'Canvas';
  return 'Other';
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString();
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

export default function AdminDashboard() {
  const [events, setEvents] = useState<MonitoringEvent[]>(() => listMonitoringEvents());
  const [isEventStreamOpen, setIsEventStreamOpen] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeMonitoringEvents({
      onEvent: (event) => {
        setEvents((prev) => [...prev, event].slice(-3000));
      },
      onReset: () => {
        setEvents([]);
        setExpandedEventId(null);
      },
    });
    return unsub;
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
    const bucket = new Array<number>(gridX * gridY).fill(0);
    let points = 0;
    let weightedPoints = 0;

    events.slice(-2000).forEach((event) => {
      const payload = event.payload ?? {};
      const rawX = payload.x;
      const rawY = payload.y;
      if (typeof rawX !== 'number' || typeof rawY !== 'number') return;
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
        x = MODIFY_PANEL.x + MODIFY_PANEL.w * 0.5;
        y = MODIFY_PANEL.y + MODIFY_PANEL.h * ratioY;
      } else {
        x = Math.max(0, Math.min(LAYOUT_WIDTH - 1, x));
      }
      const ix = Math.max(0, Math.min(gridX - 1, Math.floor((x / TOTAL_LAYOUT_WIDTH) * gridX)));
      const iy = Math.max(0, Math.min(gridY - 1, Math.floor((y / CANVAS_HEIGHT) * gridY)));
      const weight = getHeatWeight(event);
      bucket[iy * gridX + ix] += weight;
      points += 1;
      weightedPoints += weight;
    });

    const smoothBucket = smoothHeatBucket(bucket, gridX, gridY, 7);
    const constrainedBucket = smoothBucket.map((value, index) => {
      if (value <= 0) return 0;
      const cellW = TOTAL_LAYOUT_WIDTH / gridX;
      const cellH = CANVAS_HEIGHT / gridY;
      const cx = (index % gridX) * cellW + cellW * 0.5;
      const cy = Math.floor(index / gridX) * cellH + cellH * 0.5;
      if (cx > LAYOUT_WIDTH && !inRect(cx, cy, MODIFY_PANEL)) {
        return 0;
      }
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
  }, [events]);

  const areaMetrics = useMemo(() => {
    const areaPx: Record<AreaName, number> = {
      Canvas: CANVAS_WIDTH * CANVAS_HEIGHT,
      Modify: MODIFY_PANEL.w * MODIFY_PANEL.h,
      Export: EXPORT_PANEL.w * EXPORT_PANEL.h,
      Dimension: DIMENSION_PANEL.w * DIMENSION_PANEL.h,
      Trash: TRASH_PANEL.w * TRASH_PANEL.h,
      Other: Math.max(
        1,
        TOTAL_LAYOUT_WIDTH * CANVAS_HEIGHT -
          CANVAS_WIDTH * CANVAS_HEIGHT -
          MODIFY_PANEL.w * MODIFY_PANEL.h -
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
      const payload = event.payload ?? {};
      const rawX = payload.x;
      const rawY = payload.y;
      if (typeof rawX !== 'number' || typeof rawY !== 'number') return;
      if (event.component_id === 'side_panel_action') {
        sums.Modify += getHeatWeight(event);
        return;
      }
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
        x = MODIFY_PANEL.x + MODIFY_PANEL.w * 0.5;
        y = MODIFY_PANEL.y + MODIFY_PANEL.h * ratioY;
      } else {
        x = Math.max(0, Math.min(LAYOUT_WIDTH - 1, x));
      }
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

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Interaction Heatmap</h3>
            <span className="text-xs text-slate-500">
              {heatmap.points} samples (weighted {heatmap.weightedPoints.toFixed(1)})
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-200 p-2">
            <div className="mx-auto w-full max-w-[980px] rounded-md border border-slate-300 bg-white p-1 shadow-sm">
              <svg viewBox={`0 0 ${TOTAL_LAYOUT_WIDTH} ${CANVAS_HEIGHT}`} className="h-auto w-full">
              <defs>
                <filter id="heatmap-soft-blur" x="-5%" y="-5%" width="110%" height="110%">
                  <feGaussianBlur stdDeviation={HEATMAP_BLUR_STD} />
                </filter>
                <clipPath id="heatmap-clip">
                  <rect x={0} y={0} width={TOTAL_LAYOUT_WIDTH} height={CANVAS_HEIGHT} />
                </clipPath>
                <marker id="expand-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="#7a86a6" />
                </marker>
              </defs>
              <rect x={0} y={0} width={TOTAL_LAYOUT_WIDTH} height={CANVAS_HEIGHT} fill="#f8fafc" />
              <rect x={0.5} y={0.5} width={TOTAL_LAYOUT_WIDTH - 1} height={CANVAS_HEIGHT - 1} fill="none" stroke="#b8c1cf" strokeWidth={1} />
              <rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#f1f5f9" />
              <rect x={CANVAS_WIDTH} y={0} width={SIDE_PANEL_WIDTH} height={CANVAS_HEIGHT} fill="#f1f5f9" />
              <rect x={LAYOUT_WIDTH} y={0} width={TOTAL_LAYOUT_WIDTH - LAYOUT_WIDTH} height={CANVAS_HEIGHT} fill="#f8fafc" />
              <rect x={MODIFY_PANEL.x} y={MODIFY_PANEL.y} width={MODIFY_PANEL.w} height={MODIFY_PANEL.h} fill="#f1f5f9" />
              <line x1={CANVAS_WIDTH} y1={0} x2={CANVAS_WIDTH} y2={CANVAS_HEIGHT} stroke="#cbd5e1" strokeWidth={2} />
              <line x1={LAYOUT_WIDTH} y1={0} x2={LAYOUT_WIDTH} y2={CANVAS_HEIGHT} stroke="#cbd5e1" strokeWidth={1.5} />
              <g filter="url(#heatmap-soft-blur)" clipPath="url(#heatmap-clip)">
                {heatmap.bucket.map((count, index) => {
                  if (count <= 0 || heatmap.max <= 0 || heatmap.weightedPoints <= 0) return null;
                  const cellW = TOTAL_LAYOUT_WIDTH / heatmap.gridX;
                  const cellH = CANVAS_HEIGHT / heatmap.gridY;
                  const x = (index % heatmap.gridX) * cellW;
                  const y = Math.floor(index / heatmap.gridX) * cellH;
                  const share = count / heatmap.weightedPoints;
                  const stretched = (share - heatmap.shareLower) / (heatmap.shareUpper - heatmap.shareLower);
                  const normalized = Math.max(0, Math.min(1, stretched));
                  // Smoothstep keeps more values in the mid-band (yellow/orange) vs hard red/green split.
                  const smooth = normalized * normalized * (3 - 2 * normalized);
                  const intensity = Math.pow(smooth, 0.95);
                  return (
                    <rect
                      key={`heat-cell-${index}`}
                      x={x}
                      y={y}
                      width={cellW + 0.6}
                      height={cellH + 0.6}
                      fill={`hsla(${96 - intensity * 92}, 90%, ${74 - intensity * 26}%, ${0.1 + intensity * 0.78})`}
                    />
                  );
                })}
              </g>
              <rect x={DIMENSION_PANEL.x} y={DIMENSION_PANEL.y} width={DIMENSION_PANEL.w} height={DIMENSION_PANEL.h} fill="none" stroke="#6f8aa2" strokeOpacity={0.72} strokeWidth={1.5} strokeDasharray="6 7" />
              <rect x={MODIFY_PANEL.x} y={MODIFY_PANEL.y} width={MODIFY_PANEL.w} height={MODIFY_PANEL.h} fill="none" stroke="#7a86a6" strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="6 7" />
              <rect x={EXPORT_PANEL.x} y={EXPORT_PANEL.y} width={EXPORT_PANEL.w} height={EXPORT_PANEL.h} fill="none" stroke="#867da4" strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="6 7" />
              <rect x={TRASH_PANEL.x} y={TRASH_PANEL.y} width={TRASH_PANEL.w} height={TRASH_PANEL.h} fill="none" stroke="#8b8f9d" strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="6 7" />
              <rect x={MODIFY_SOURCE_PANEL.x} y={MODIFY_SOURCE_PANEL.y} width={MODIFY_SOURCE_PANEL.w} height={MODIFY_SOURCE_PANEL.h} fill="none" stroke="#7a86a6" strokeOpacity={0.45} strokeWidth={1.2} strokeDasharray="4 6" />
              <line
                x1={MODIFY_SOURCE_PANEL.x + MODIFY_SOURCE_PANEL.w}
                y1={MODIFY_SOURCE_PANEL.y + MODIFY_SOURCE_PANEL.h * 0.45}
                x2={MODIFY_PANEL.x - 8}
                y2={MODIFY_PANEL.y + MODIFY_PANEL.h * 0.2}
                stroke="#7a86a6"
                strokeOpacity={0.65}
                strokeWidth={1.4}
                strokeDasharray="5 5"
                markerEnd="url(#expand-arrow)"
              />
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
              <text x={MODIFY_PANEL.x + 10} y={MODIFY_PANEL.y - 8} fill="#6b7ea0" fontSize={11.5} fontWeight={600}>
                Modify Area (expanded)
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
          <p className="mt-1 text-[11px] text-slate-500">
            Global temperature scale: color reflects each cell's share of total weighted interactions; hover stays low-weight.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Area Interest Ranking</h3>
            <span className="text-xs text-slate-500">Share + Density</span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {areaMetrics.map((item) => (
              <div key={item.area} className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                <p className="text-xs font-semibold text-slate-700">{item.area}</p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500"
                    style={{ width: `${Math.max(4, Math.round(item.share * 100))}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500">Share {Math.round(item.share * 100)}%</p>
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

