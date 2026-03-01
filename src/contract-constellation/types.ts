export type NodeKind = 'root' | 'main' | 'sub' | 'leaf';
export type LinkKind = 'root-link' | 'smart-link' | 'child-link' | 'detail-link';
export type RiskLevel = 'none' | 'low' | 'medium' | 'high';
export type NodeActionType = 'delete' | 'revise' | 'add_clause';
export type TimePhase = 'pre_sign' | 'effective' | 'execution' | 'acceptance' | 'termination' | 'post_termination';

export interface TemplateDetailItem {
  label: string;
  content: string;
  timePhase?: TimePhase;
}

export interface TemplateSubItem {
  label: string;
  content: string;
  details?: TemplateDetailItem[];
  timePhase?: TimePhase;
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
  actionType?: NodeActionType;
  actionReason?: string;
  suggestionText?: string;
  supplementDraft?: string;
  confidence?: number;
}

export interface GraphNode {
  id: string;
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
  actionType?: NodeActionType;
  actionReason?: string;
  suggestionText?: string;
  supplementDraft?: string;
  confidence?: number;
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
