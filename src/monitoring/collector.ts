import type { MonitoringEvent, MonitoringEventName } from './types';
import { getRuntimeApiBase } from '../config/runtimeApiBase';

const STORAGE_KEY = 'uist_monitor_events_v1';
const CHANNEL_NAME = 'uist-monitor-channel';
const MAX_EVENTS = 5000;
const FLUSH_INTERVAL_MS = 1000;
const FLUSH_BATCH_SIZE = 50;
const IMMEDIATE_FLUSH_THRESHOLD = 20;
const API_BASE = getRuntimeApiBase();
const BATCH_ENDPOINT = `${API_BASE}/monitoring/events/batch`;

let pendingQueue: MonitoringEvent[] = [];
let isFlushInFlight = false;
let uploaderStarted = false;

type MonitoringChannelMessage =
  | { type: 'event'; event: MonitoringEvent }
  | { type: 'reset' };

function nowId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readEvents(): MonitoringEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MonitoringEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEvents(events: MonitoringEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
}

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel(CHANNEL_NAME);
}

async function flushMonitoringEvents(): Promise<void> {
  if (isFlushInFlight || pendingQueue.length === 0) return;
  isFlushInFlight = true;
  const batch = pendingQueue.slice(0, FLUSH_BATCH_SIZE);
  try {
    const response = await fetch(BATCH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
    if (!response.ok) {
      throw new Error(`monitoring upload failed with ${response.status}`);
    }
    pendingQueue = pendingQueue.slice(batch.length);
  } catch {
    // Keep pending queue unchanged for retry on next tick.
  } finally {
    isFlushInFlight = false;
    if (pendingQueue.length >= IMMEDIATE_FLUSH_THRESHOLD) {
      void flushMonitoringEvents();
    }
  }
}

function flushByBeaconOnPageHide() {
  if (pendingQueue.length === 0 || typeof navigator.sendBeacon !== 'function') return;
  const batch = pendingQueue.slice(0, FLUSH_BATCH_SIZE);
  const payload = JSON.stringify({ events: batch });
  const sent = navigator.sendBeacon(BATCH_ENDPOINT, new Blob([payload], { type: 'application/json' }));
  if (sent) {
    pendingQueue = pendingQueue.slice(batch.length);
  }
}

function ensureUploaderStarted() {
  if (uploaderStarted || typeof window === 'undefined') return;
  uploaderStarted = true;
  window.setInterval(() => {
    void flushMonitoringEvents();
  }, FLUSH_INTERVAL_MS);
  window.addEventListener('pagehide', flushByBeaconOnPageHide);
  window.addEventListener('beforeunload', flushByBeaconOnPageHide);
}

export function listMonitoringEvents(): MonitoringEvent[] {
  return readEvents();
}

export function appendMonitoringEvent(event: MonitoringEvent) {
  ensureUploaderStarted();
  const events = readEvents();
  events.push(event);
  writeEvents(events);
  pendingQueue.push(event);
  const channel = getChannel();
  channel?.postMessage({ type: 'event', event } satisfies MonitoringChannelMessage);
  channel?.close();
  if (pendingQueue.length >= IMMEDIATE_FLUSH_THRESHOLD) {
    void flushMonitoringEvents();
  }
}

export function clearMonitoringEvents() {
  writeEvents([]);
  pendingQueue = [];
  const channel = getChannel();
  channel?.postMessage({ type: 'reset' } satisfies MonitoringChannelMessage);
  channel?.close();
}

export async function flushMonitoringEventsNow() {
  await flushMonitoringEvents();
}

export function createMonitoringEvent(params: {
  sessionId: string;
  taskId: string;
  studyId?: string;
  participantId?: string;
  clientSeq?: number;
  route: 'main' | 'admin';
  eventName: MonitoringEventName;
  componentId?: string;
  nodeId?: string;
  payload?: Record<string, string | number | boolean | null>;
}): MonitoringEvent {
  return {
    id: nowId(),
    ts: Date.now(),
    session_id: params.sessionId,
    task_id: params.taskId,
    study_id: params.studyId,
    participant_id: params.participantId,
    client_seq: params.clientSeq,
    route: params.route,
    event_name: params.eventName,
    component_id: params.componentId,
    node_id: params.nodeId,
    payload: params.payload,
  };
}

export function subscribeMonitoringEvents(
  handlers: { onEvent: (event: MonitoringEvent) => void; onReset?: () => void },
): () => void {
  const channel = getChannel();
  if (!channel) {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as MonitoringEvent[];
        if (parsed.length === 0) {
          handlers.onReset?.();
          return;
        }
        const last = parsed[parsed.length - 1];
        if (last) handlers.onEvent(last);
      } catch {
        // ignore malformed payload
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }
  channel.onmessage = (event: MessageEvent<MonitoringChannelMessage>) => {
    if (!event.data) return;
    if (event.data.type === 'reset') {
      handlers.onReset?.();
      return;
    }
    handlers.onEvent(event.data.event);
  };
  return () => channel.close();
}

