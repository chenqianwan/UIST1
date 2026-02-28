export type NodeKind = 'root' | 'main' | 'sub' | 'leaf';
export type LinkKind = 'root-link' | 'smart-link' | 'child-link' | 'detail-link';
export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

export interface TemplateDetailItem {
  label: string;
  content: string;
}

export interface TemplateSubItem {
  label: string;
  content: string;
  details?: TemplateDetailItem[];
}

export interface TemplateItem {
  id: string;
  label: string;
  description: string;
  type: 'financial' | 'risk' | 'obligation' | 'asset';
  riskLevel: RiskLevel;
  content: string;
  satellites?: TemplateSubItem[];
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
  templateId?: string;
  parentId?: string;
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
