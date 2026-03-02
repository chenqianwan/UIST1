import type { MonitoringEvent, MonitoringEventName } from './types';

const STORAGE_KEY = 'uist_monitor_events_v1';
const CHANNEL_NAME = 'uist-monitor-channel';
const MAX_EVENTS = 5000;

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

export function listMonitoringEvents(): MonitoringEvent[] {
  return readEvents();
}

export function appendMonitoringEvent(event: MonitoringEvent) {
  const events = readEvents();
  events.push(event);
  writeEvents(events);
  const channel = getChannel();
  channel?.postMessage({ type: 'event', event } satisfies MonitoringChannelMessage);
  channel?.close();
}

export function clearMonitoringEvents() {
  writeEvents([]);
  const channel = getChannel();
  channel?.postMessage({ type: 'reset' } satisfies MonitoringChannelMessage);
  channel?.close();
}

export function createMonitoringEvent(params: {
  sessionId: string;
  taskId: string;
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

