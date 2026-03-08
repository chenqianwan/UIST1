export type NodeKind = 'root' | 'main' | 'sub';
export type LinkKind = 'root-link' | 'child-link' | 'detail-link' | 'reference-link';
export type RiskLevel = 'none' | 'low' | 'medium' | 'high';
export type NodeActionType = 'delete' | 'revise' | 'add_clause';
export type NodeActionStatus = 'pending' | 'completed';
export type TimePhase = 'pre_sign' | 'effective' | 'execution' | 'acceptance' | 'termination' | 'post_termination';

export interface NodeActionItem {
  id: string;
  type: NodeActionType;
  status: NodeActionStatus;
  reason?: string;
  confidence?: number;
  replacementText?: string;
  supplementDraft?: string;
}

export interface TemplateDetailItem {
  id?: string;
  label: string;
  content: string;
  timePhase?: TimePhase;
  references?: string[];
}

export interface TemplateSubItem {
  id?: string;
  label: string;
  content: string;
  details?: TemplateDetailItem[];
  timePhase?: TimePhase;
  references?: string[];
}

export interface TemplateItem {
  id: string;
  label: string;
  description: string;
  type: 'financial' | 'risk' | 'obligation' | 'asset';
  riskLevel: RiskLevel;
  content: string;
  satellites?: TemplateSubItem[];
  timePhase?: TimePhase;
  actions?: NodeActionItem[];
}

export interface GraphNode {
  id: string;
  references?: string[];
  label: string;
  type: NodeKind;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  content: string;
  riskLevel: RiskLevel;
  timePhase: TimePhase;
  templateId?: string;
  parentId?: string;
  insertAfterId?: string;
  actions?: NodeActionItem[];
}

export interface GraphLink {
  source: string;
  target: string;
  type: LinkKind;
}

export interface AiSuggestion {
  title: string;
  reason: string;
  replacement: string;
}
