import type { GraphNode, RiskLevel } from './types';
import type { AiSuggestion } from './types';

export function getRiskColor(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'none': return '#77c8b3';
    case 'low': return '#dcc46b';
    case 'medium': return '#e3a174';
    case 'high': return '#de6f66';
    default: return '#77c8b3';
  }
}

export function getRiskText(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'none': return 'No Risk';
    case 'low': return 'Low Risk';
    case 'medium': return 'Medium Risk';
    case 'high': return 'High Risk';
    default: return 'No Risk';
  }
}

export function getRiskNodeStrokeColor(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'none': return '#77c8b3';
    case 'low': return '#dcc46b';
    case 'medium': return '#e3a174';
    case 'high': return '#de6f66';
    default: return '#77c8b3';
  }
}

export function getRiskNodeGradientId(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'none': return 'node-fill-none';
    case 'low': return 'node-fill-low';
    case 'medium': return 'node-fill-medium';
    case 'high': return 'node-fill-high';
    default: return 'node-fill-none';
  }
}

export function getRiskNodeInnerStroke(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'none': return '#89cfbb';
    case 'low': return '#e3cd79';
    case 'medium': return '#e9af89';
    case 'high': return '#ea8b83';
    default: return '#89cfbb';
  }
}

/** Seeded 0–1 from string id for stable per-node randomness */
export function seededRandom(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 10000) / 10000;
}

/** Highlight arc length (min = current, max = 1/3 of circle); position in bottom-right */
export function getNodeHighlightParams(nodeId: string, arcR: number): { length: number; offset: number } {
  const circum = 2 * Math.PI * arcR;
  const minLength = circum * (150 / 1055);
  const maxLength = circum / 3;
  const u = seededRandom(nodeId);
  const v = seededRandom(nodeId + '2');
  const length = minLength + u * (maxLength - minLength);
  const offsetStart = circum * 0.12;
  const offsetEnd = circum * 0.42;
  const offset = -(offsetStart + v * (offsetEnd - offsetStart));
  return { length, offset };
}

export function getAiSuggestion(node: GraphNode): AiSuggestion | null {
  if (node.riskLevel === 'none') return null;
  if (node.riskLevel === 'low') {
    return {
      title: 'Strengthen Wording',
      reason: 'The clause is usable overall, but trigger conditions and boundaries are still broad.',
      replacement: `${node.content} Suggested addition: "Determination is subject to written confirmation signed by both parties."`,
    };
  }
  if (node.riskLevel === 'medium') {
    return {
      title: 'Clarify Execution Conditions',
      reason: 'This clause has interpretation ambiguity and may lead to inconsistent execution.',
      replacement: `${node.content} Suggested addition: explicit timelines, acceptance criteria, and written confirmation workflow.`,
    };
  }
  return {
    title: 'High-Risk: Immediate Revision Suggested',
    reason: 'This clause has a high dispute risk; add quantifiable conditions and post-breach handling paths.',
    replacement: `${node.content} Suggested addition: hard constraints for "trigger conditions, liability cap, and dispute-resolution timeline", executed via a standard appendix template.`,
  };
}

export function distance(a: GraphNode, b: GraphNode): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function getEdgePath(
  source: GraphNode,
  target: GraphNode,
  bend = 0.18,
  sourcePadding = 0,
  targetPadding = 0,
): string {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const maxPad = Math.max(0, len / 2 - 2);
  const startPad = Math.min(sourcePadding, maxPad);
  const endPad = Math.min(targetPadding, maxPad);
  const sx = source.x + ux * startPad;
  const sy = source.y + uy * startPad;
  const tx = target.x - ux * endPad;
  const ty = target.y - uy * endPad;
  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;
  const nx = -dy / len;
  const ny = dx / len;
  const curve = Math.min(34, len * bend);
  const cx = mx + nx * curve;
  const cy = my + ny * curve;
  return `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
}
