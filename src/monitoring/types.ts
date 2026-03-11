export type MonitoringEventName =
  | 'session_start'
  | 'session_end'
  | 'page_visible'
  | 'page_hidden_duration'
  | 'canvas_interaction'
  | 'template_added'
  | 'node_selected'
  | 'action_executed'
  | 'node_deleted'
  | 'export_success'
  | 'export_failed';

export interface MonitoringEvent {
  id: string;
  ts: number;
  session_id: string;
  task_id: string;
  study_id?: string;
  participant_id?: string;
  client_seq?: number;
  route: 'main' | 'admin';
  event_name: MonitoringEventName;
  component_id?: string;
  node_id?: string;
  payload?: Record<string, string | number | boolean | null>;
}

