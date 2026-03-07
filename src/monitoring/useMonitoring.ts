import { useCallback, useEffect, useRef } from 'react';
import { appendMonitoringEvent, clearMonitoringEvents, createMonitoringEvent } from './collector';
import type { MonitoringEventName } from './types';

const STUDY_ID = import.meta.env.VITE_STUDY_ID ?? 'uist-study';

function getOrCreateSessionId(): string {
  const key = 'uist_monitor_session_id';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const created = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  sessionStorage.setItem(key, created);
  return created;
}

function getOrCreateTaskId(): string {
  const key = 'uist_monitor_task_id';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const created = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  sessionStorage.setItem(key, created);
  return created;
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

function getOrCreateParticipantId(): string {
  const key = 'uist_monitor_participant_id';
  const fromLocation = readParticipantIdFromLocation();
  if (fromLocation) {
    sessionStorage.setItem(key, fromLocation);
    return fromLocation;
  }
  const fromStorage = sessionStorage.getItem(key);
  if (fromStorage) return fromStorage;
  const id = 'anonymous';
  sessionStorage.setItem(key, id);
  return id;
}

export function useMonitoring(route: 'main' | 'admin', enabled: boolean) {
  const sessionIdRef = useRef<string>(getOrCreateSessionId());
  const taskIdRef = useRef<string>(getOrCreateTaskId());
  const clientSeqRef = useRef<number>(0);
  const hiddenAtRef = useRef<number | null>(null);
  const participantIdRef = useRef<string>(getOrCreateParticipantId());

  const track = useCallback(
    (
      eventName: MonitoringEventName,
      options?: {
        componentId?: string;
        nodeId?: string;
        payload?: Record<string, string | number | boolean | null>;
      },
    ) => {
      if (!enabled) return;
      appendMonitoringEvent(
        createMonitoringEvent({
          sessionId: sessionIdRef.current,
          taskId: taskIdRef.current,
          studyId: STUDY_ID,
          participantId: participantIdRef.current,
          clientSeq: ++clientSeqRef.current,
          route,
          eventName,
          componentId: options?.componentId,
          nodeId: options?.nodeId,
          payload: options?.payload,
        }),
      );
    },
    [enabled, route],
  );

  useEffect(() => {
    if (!enabled) return;
    if (route === 'main') {
      clearMonitoringEvents();
      sessionStorage.removeItem('uist_monitor_session_id');
      sessionStorage.removeItem('uist_monitor_task_id');
      sessionIdRef.current = getOrCreateSessionId();
      taskIdRef.current = getOrCreateTaskId();
      clientSeqRef.current = 0;
    }
    track('session_start', { componentId: 'app' });
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }
      track('page_visible', { componentId: 'app' });
      if (hiddenAtRef.current) {
        const durationMs = Date.now() - hiddenAtRef.current;
        track('page_hidden_duration', {
          componentId: 'app',
          payload: { duration_ms: durationMs },
        });
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    const onBeforeUnload = () => {
      track('session_end', { componentId: 'app' });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
      track('session_end', { componentId: 'app' });
    };
  }, [enabled, route, track]);

  return {
    sessionId: sessionIdRef.current,
    taskId: taskIdRef.current,
    track,
  };
}

