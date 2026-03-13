import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GraphLink, GraphNode, TemplateItem } from './types';
import { getRiskColor, seededRandom } from './utils';
import stageAData from '../../docs/simple1.stage_a.json';
import stageBData from '../../docs/simple1.stage_b.json';

type StageANode = {
  id: string;
  label: string;
  content: string;
  type: 'main' | 'sub';
  parentId?: string | null;
  timePhase?: GraphNode['timePhase'];
};

type StageBAction = {
  id: string;
  type: 'delete' | 'revise' | 'add_clause';
  status?: 'pending' | 'completed';
  reason?: string;
  confidence?: number;
  replacementText?: string;
  supplementDraft?: string;
};

type StageBNode = {
  id: string;
  references?: string[];
  riskLevel?: GraphNode['riskLevel'];
  actions?: StageBAction[];
};

function getFallbackActionsByRisk(
  riskLevel: GraphNode['riskLevel'],
  seed: string,
): GraphNode['actions'] {
  // TODO(upstream): Remove this local action generation once upstream always provides actions.
  if (riskLevel === 'none') return undefined;
  const u = seededRandom(seed);
  const make = (type: 'delete' | 'revise' | 'add_clause', idx = 0) => ({
    id: `${seed}::${type}::${idx}`,
    type,
    status: 'pending' as const,
  });
  if (riskLevel === 'low') return u < 0.5 ? [make('add_clause')] : [make('revise')];
  if (riskLevel === 'medium') {
    if (u < 0.28) return [make('delete')];
    if (u < 0.62) return [make('revise')];
    return [make('add_clause', 0), make('revise', 1)];
  }
  return u < 0.5 ? [make('delete')] : [make('revise', 0), make('add_clause', 1)];
}

function normalizeActions(actions?: GraphNode['actions']): GraphNode['actions'] {
  if (!actions || actions.length === 0) return undefined;
  const seen = new Set<string>();
  const normalized = actions
    .filter((action) => {
      if (!action.id || seen.has(action.id)) return false;
      seen.add(action.id);
      return true;
    })
    .map((action) => ({
      ...action,
      status: action.status ?? 'pending',
    }));
  return normalized.length > 0 ? normalized : undefined;
}

function inferTimePhaseFromText(seedText: string): GraphNode['timePhase'] {
  const text = seedText.toLowerCase();
  if (text.includes('sign') || text.includes('effective date')) return 'pre_sign';
  if (text.includes('effective') || text.includes('background ip')) return 'effective';
  if (text.includes('accept') || text.includes('validation') || text.includes('remediation')) return 'acceptance';
  if (text.includes('termination') || text.includes('terminate') || text.includes('notice period')) return 'termination';
  if (text.includes('warranty') || text.includes('settlement') || text.includes('post')) return 'post_termination';
  return 'execution';
}

function getLabelCollisionExtra(label: string): number {
  return Math.min(30, label.length * 0.35);
}

const MAX_NODE_LABEL_CHARS = 30;
const LABEL_STAGGER_STEP = 10;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function getLabelVerticalOffset(nodeId: string): number {
  return (hashString(nodeId) % 3) * LABEL_STAGGER_STEP;
}

function getDisplayLabelLength(label: string): number {
  if (label.length <= MAX_NODE_LABEL_CHARS) return label.length;
  return MAX_NODE_LABEL_CHARS + 3;
}

function getLabelHalfWidth(label: string): number {
  // Approximate text width for semibold 11px labels.
  return Math.max(18, Math.min(112, getDisplayLabelLength(label) * 3.25));
}

function buildReferenceLinks(nodes: GraphNode[]): GraphLink[] {
  const resolveTargetId = (referenceKey: string): string | null => {
    const byNodeId = nodes.find((node) => node.id === referenceKey);
    if (byNodeId) return byNodeId.id;
    return null;
  };
  const links: GraphLink[] = [];
  nodes.forEach((node) => {
    if (!node.references || node.references.length === 0) return;
    node.references.forEach((referenceKey) => {
      const targetId = resolveTargetId(referenceKey);
      if (!targetId || targetId === node.id) return;
      links.push({
        source: node.id,
        target: targetId,
        type: 'reference-link',
      });
    });
  });
  return links;
}

function mergeLinksWithReferences(baseLinks: GraphLink[], nodes: GraphNode[]): GraphLink[] {
  const nonReference = baseLinks.filter((link) => link.type !== 'reference-link');
  return [...nonReference, ...buildReferenceLinks(nodes)];
}

function buildGraphFromStageData(
  stageANodes: StageANode[],
  stageBNodes: StageBNode[],
  width: number,
  height: number,
): { nodes: GraphNode[]; links: GraphLink[] } | null {
  if (stageANodes.length === 0) return null;

  const byIdB = new Map(stageBNodes.map((n) => [n.id, n]));
  const byIdA = new Map(stageANodes.map((n) => [n.id, n]));
  const rootA = stageANodes.find((n) => n.id === 'root');
  const rootX = width / 2;
  const rootY = height / 2;

  const nodes: GraphNode[] = stageANodes.map((n, idx) => {
    const b = byIdB.get(n.id);
    const riskLevel = b?.riskLevel ?? 'none';
    const actions = b?.actions?.map((action) => ({
      ...action,
      status: action.status ?? 'pending',
    }));
    const isRoot = n.id === 'root';
    const parent = n.parentId ? byIdA.get(n.parentId) : undefined;
    const isSubOfSub = n.type === 'sub' && parent?.type === 'sub';
    const angle = ((idx + 1) / Math.max(stageANodes.length, 1)) * Math.PI * 2;
    const ring = n.type === 'main' ? 232 : isSubOfSub ? 98 : 154;
    const x = isRoot ? rootX : rootX + Math.cos(angle) * ring * 1.42;
    const y = isRoot ? rootY : rootY + Math.sin(angle) * ring;
    return {
      id: n.id,
      label: isRoot ? (rootA?.label ?? 'Master Contract') : n.label,
      type: isRoot ? 'root' : n.type,
      color: isRoot ? '#cbd5e1' : getRiskColor(riskLevel),
      x,
      y,
      vx: 0,
      vy: 0,
      r: isRoot ? 30 : n.type === 'main' ? 18 : isSubOfSub ? 7 : 10,
      content: n.content,
      riskLevel: isRoot ? 'none' : riskLevel,
      timePhase: n.timePhase ?? 'execution',
      parentId: isRoot ? undefined : (n.parentId ?? undefined),
      references: b?.references,
      actions,
    };
  });

  const links: GraphLink[] = [];
  const byIdNode = new Map(nodes.map((n) => [n.id, n]));
  nodes.forEach((n) => {
    if (!n.parentId) return;
    const parent = byIdNode.get(n.parentId);
    if (!parent) return;
    if (parent.id === 'root') {
      links.push({ source: 'root', target: n.id, type: 'root-link' });
      return;
    }
    links.push({
      source: parent.id,
      target: n.id,
      type: parent.type === 'main' ? 'child-link' : 'detail-link',
    });
  });

  const merged = mergeLinksWithReferences(links, nodes);
  return { nodes, links: merged };
}

export function useGalaxyEngine(
  width: number,
  height: number,
  semanticBiasStrength = 0,
  semanticTargetXById: Record<string, number> = {},
  riskBiasStrength = 0,
  timeBiasStrength = 0,
  timeTargetXById: Record<string, number> = {},
) {
  const rootNode = useMemo<GraphNode>(
    () => ({
      id: 'root',
      label: 'Master Contract',
      type: 'root',
      color: '#cbd5e1',
      x: width / 2,
      y: height / 2,
      vx: 0,
      vy: 0,
      r: 30,
      content: 'Contract structure central node',
      riskLevel: 'none',
      timePhase: 'effective',
    }),
    [width, height],
  );

  const [nodes, setNodes] = useState<GraphNode[]>([rootNode]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const nodesRef = useRef<GraphNode[]>([rootNode]);
  const linksRef = useRef<GraphLink[]>([]);
  const draggingNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    nodesRef.current = [rootNode];
    linksRef.current = [];
    setNodes([rootNode]);
    setLinks([]);
  }, [rootNode]);

  const addNodeFromTemplate = useCallback(
    (template: TemplateItem, x: number, y: number) => {
      const id = template.id;
      if (template.id === 'tpl-demo-risk-ladder') {
        const baseId = `${id}_${Date.now()}`;
        const chain = [
          { id: `${baseId}_0`, label: 'Demo Healthy Start', type: 'main' as const, riskLevel: 'none' as const, r: 18, content: 'Chain node 1: healthy.' },
          { id: `${baseId}_1`, label: 'Demo Low Risk', type: 'sub' as const, riskLevel: 'low' as const, r: 10, content: 'Chain node 2: low risk.' },
          { id: `${baseId}_2`, label: 'Demo Medium Risk', type: 'sub' as const, riskLevel: 'medium' as const, r: 7, content: 'Chain node 3: medium risk.' },
          { id: `${baseId}_3`, label: 'Demo High Risk', type: 'sub' as const, riskLevel: 'high' as const, r: 7, content: 'Chain node 4: high risk.' },
          { id: `${baseId}_4`, label: 'Demo Healthy End', type: 'sub' as const, riskLevel: 'none' as const, r: 7, content: 'Chain node 5: healthy.' },
        ];
        const spacing = 68;
        const chainNodes: GraphNode[] = chain.map((item, index) => {
          const actions =
            item.riskLevel === 'none'
              ? undefined
              : normalizeActions(getFallbackActionsByRisk(item.riskLevel, item.id));
          return {
            id: item.id,
            label: item.label,
            type: item.type,
            color: getRiskColor(item.riskLevel),
            x: x + spacing * index,
            y,
            vx: 0,
            vy: 0,
            r: item.r,
            content: item.content,
            riskLevel: item.riskLevel,
            timePhase: 'execution',
            templateId: template.id,
            parentId: index === 0 ? undefined : chain[index - 1].id,
            actions,
          };
        });
        const chainLinks: GraphLink[] = [
          { source: 'root', target: chainNodes[0].id, type: 'root-link' },
          { source: chainNodes[0].id, target: chainNodes[1].id, type: 'child-link' },
          { source: chainNodes[1].id, target: chainNodes[2].id, type: 'detail-link' },
          { source: chainNodes[2].id, target: chainNodes[3].id, type: 'detail-link' },
          { source: chainNodes[3].id, target: chainNodes[4].id, type: 'detail-link' },
        ];
        const nextNodes = [...nodesRef.current, ...chainNodes];
        const nextBaseLinks = [...linksRef.current, ...chainLinks];
        const nextLinks = mergeLinksWithReferences(nextBaseLinks, nextNodes);
        nodesRef.current = nextNodes;
        linksRef.current = nextLinks;
        setNodes(nextNodes);
        setLinks(nextLinks);
        return;
      }
      const actions = template.riskLevel === 'none' ? undefined : normalizeActions(template.actions);
      const newNode: GraphNode = {
        id,
        label: template.label,
        type: 'main',
        color: getRiskColor(template.riskLevel),
        x,
        y,
        vx: 0,
        vy: 0,
        r: 18,
        content: template.content,
        riskLevel: template.riskLevel,
        timePhase: template.timePhase ?? inferTimePhaseFromText(`${template.label}. ${template.content}`),
        templateId: template.id,
        actions,
      };

      const existing = nodesRef.current;

      const satellites = (template.satellites ?? []).map((item, index, arr) => {
        const angle = (index / Math.max(arr.length, 1)) * Math.PI * 2;
        const riskLevel: GraphNode['riskLevel'] = item.riskLevel ?? 'none';
        const actions = riskLevel === 'none' ? undefined : normalizeActions(item.actions);
        const timePhase = item.timePhase ?? inferTimePhaseFromText(`${item.label}. ${item.content}`);
        const satelliteId = item.id ?? `sub_${id}_${index}`;
        return {
          id: satelliteId,
          references: item.references,
          label: item.label,
          type: 'sub' as const,
          color: getRiskColor(riskLevel),
          x: x + Math.cos(angle) * 56,
          y: y + Math.sin(angle) * 56,
          vx: 0,
          vy: 0,
          r: 10,
          content: item.content,
          riskLevel,
          timePhase,
          templateId: template.id,
          parentId: id,
          actions,
        };
      });
      const detailNodes = (template.satellites ?? []).flatMap((item, index, arr) => {
        const details = item.details ?? [];
        if (details.length === 0) return [];
        const satId = item.id ?? `sub_${id}_${index}`;
        const satAngle = (index / Math.max(arr.length, 1)) * Math.PI * 2;
        const satX = x + Math.cos(satAngle) * 56;
        const satY = y + Math.sin(satAngle) * 56;
        const ux = Math.cos(satAngle);
        const uy = Math.sin(satAngle);

        return details.map((detail, detailIndex) => {
          const riskLevel: GraphNode['riskLevel'] = detail.riskLevel ?? 'none';
          const actions = riskLevel === 'none' ? undefined : normalizeActions(detail.actions);
          const timePhase = detail.timePhase ?? inferTimePhaseFromText(`${detail.label}. ${detail.content}`);
          const detailId = detail.id ?? `sub_${id}_${index}_${detailIndex}`;
          return {
            id: detailId,
            references: detail.references,
            label: detail.label,
            type: 'sub' as const,
            color: getRiskColor(riskLevel),
            x: satX + ux * 34,
            y: satY + uy * 34,
            vx: 0,
            vy: 0,
            r: 7,
            content: detail.content,
            riskLevel,
            timePhase,
            templateId: template.id,
            parentId: satId,
            actions,
          };
        });
      });

      const rootLink: GraphLink = { source: 'root', target: id, type: 'root-link' };
      const satelliteLinks: GraphLink[] = satellites.map((sat) => ({
        source: id,
        target: sat.id,
        type: 'child-link',
      }));
      const detailLinks: GraphLink[] = detailNodes.map((subNode) => ({
        source: subNode.parentId ?? id,
        target: subNode.id,
        type: 'detail-link',
      }));

      const nextNodes = [...existing, newNode, ...satellites, ...detailNodes];
      const nextBaseLinks = [...linksRef.current, rootLink, ...satelliteLinks, ...detailLinks];
      const nextLinks = mergeLinksWithReferences(nextBaseLinks, nextNodes);

      nodesRef.current = nextNodes;
      linksRef.current = nextLinks;
      setNodes(nextNodes);
      setLinks(nextLinks);
    },
    [],
  );

  const markNodeAsMitigated = useCallback((nodeId: string, content: string) => {
    const safeColor = getRiskColor('none');
    const nextNodes = nodesRef.current.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            content,
            riskLevel: 'none' as const,
            color: safeColor,
            actions: undefined,
          }
        : node,
    );
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
  }, []);

  const completeNodeAction = useCallback(
    (nodeId: string, actionId: string, content?: string) => {
      const safeColor = getRiskColor('none');
      let didComplete = false;
      const nextNodes = nodesRef.current.map((node) => {
        if (node.id !== nodeId) return node;
        const plannedActions = normalizeActions(node.actions);
        if (!plannedActions) {
          return content !== undefined ? { ...node, content } : node;
        }
        let changed = false;
        const nextActions = plannedActions.map((action) => {
          if (action.id !== actionId) return action;
          changed = true;
          return { ...action, status: 'completed' as const };
        });
        if (!changed) {
          return content !== undefined ? { ...node, content } : node;
        }
        didComplete = true;
        const allDone = nextActions.every((action) => action.status === 'completed');
        if (allDone) {
          return {
            ...node,
            content: content ?? node.content,
            riskLevel: 'none' as const,
            color: safeColor,
            actions: undefined,
          };
        }
        return {
          ...node,
          content: content ?? node.content,
          actions: nextActions,
        };
      });
      nodesRef.current = nextNodes;
      setNodes(nextNodes);
      return didComplete;
    },
    [],
  );

  const updateNodeContent = useCallback((nodeId: string, content: string) => {
    const nextNodes = nodesRef.current.map((node) =>
      node.id === nodeId ? { ...node, content } : node,
    );
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
  }, []);

  const updateNodePosition = useCallback((nodeId: string, x: number, y: number) => {
    const nextNodes = nodesRef.current.map((node) =>
      node.id === nodeId ? { ...node, x, y, vx: 0, vy: 0 } : node,
    );
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
  }, []);

  const removeNodeCascade = useCallback((nodeId: string) => {
    if (nodeId === 'root') return;
    const removeIds = new Set<string>([nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      nodesRef.current.forEach((node) => {
        if (node.parentId && removeIds.has(node.parentId) && !removeIds.has(node.id)) {
          removeIds.add(node.id);
          changed = true;
        }
      });
    }

    const nextNodes = nodesRef.current.filter((node) => !removeIds.has(node.id));
    const nextBaseLinks = linksRef.current.filter(
      (link) => !removeIds.has(link.source) && !removeIds.has(link.target),
    );
    const nextLinks = mergeLinksWithReferences(nextBaseLinks, nextNodes);

    nodesRef.current = nextNodes;
    linksRef.current = nextLinks;
    setNodes(nextNodes);
    setLinks(nextLinks);
  }, []);

  const addSupplementClause = useCallback((nodeId: string, draft?: string) => {
    const parentNode = nodesRef.current.find((node) => node.id === nodeId);
    if (!parentNode || parentNode.id === 'root') return;

    const isParentMain = parentNode.type === 'main';
    const siblingIds = nodesRef.current
      .filter((node) => node.parentId === parentNode.id)
      .map((node) => node.id);
    const childIndex = siblingIds.length;
    const insertAfterId = siblingIds.length > 0 ? siblingIds[siblingIds.length - 1] : undefined;
    const angle = (childIndex % 6) * (Math.PI / 3);
    const radiusX = isParentMain ? 62 : 38;
    const radiusY = isParentMain ? 62 : 38;
    const newType: GraphNode['type'] = 'sub';
    const newRadius = isParentMain ? 10 : 7;
    const content = (draft && draft.trim()) || `Supplement for "${parentNode.label}".`;
    const riskLevel: GraphNode['riskLevel'] = 'none';
    const newId = `${newType}_${parentNode.id}_${Date.now()}`;
    const newNode: GraphNode = {
      id: newId,
      label: isParentMain ? `Supplement ${childIndex + 1}` : `Detail ${childIndex + 1}`,
      type: newType,
      color: getRiskColor(riskLevel),
      x: parentNode.x + Math.cos(angle) * radiusX,
      y: parentNode.y + Math.sin(angle) * radiusY,
      vx: 0,
      vy: 0,
      r: newRadius,
      content,
      riskLevel,
      timePhase: 'execution',
      templateId: parentNode.templateId,
      parentId: parentNode.id,
      insertAfterId,
    };
    const newLink: GraphLink = {
      source: parentNode.id,
      target: newId,
      type: isParentMain ? 'child-link' : 'detail-link',
    };
    const nextNodes = [...nodesRef.current, newNode];
    const nextBaseLinks = [...linksRef.current, newLink];
    const nextLinks = mergeLinksWithReferences(nextBaseLinks, nextNodes);
    nodesRef.current = nextNodes;
    linksRef.current = nextLinks;
    setNodes(nextNodes);
    setLinks(nextLinks);
  }, []);

  const loadGraphPreset = useCallback((presetId: 'blank' | 'simple1') => {
    if (presetId === 'blank') {
      nodesRef.current = [rootNode];
      linksRef.current = [];
      setNodes([rootNode]);
      setLinks([]);
      return;
    }
    const stageANodes = (stageAData as { nodes?: StageANode[] }).nodes ?? [];
    const stageBNodes = (stageBData as { nodes?: StageBNode[] }).nodes ?? [];
    const graph = buildGraphFromStageData(
      stageANodes,
      stageBNodes,
      width,
      height,
    );
    if (!graph) {
      nodesRef.current = [rootNode];
      linksRef.current = [];
      setNodes([rootNode]);
      setLinks([]);
      return;
    }
    nodesRef.current = graph.nodes;
    linksRef.current = graph.links;
    setNodes(graph.nodes);
    setLinks(graph.links);
  }, [height, rootNode, width]);

  const setDraggingNode = useCallback((nodeId: string | null) => {
    draggingNodeIdRef.current = nodeId;
  }, []);

  useEffect(() => {
    let frame = 0;
    const margin = 24;

    const tick = () => {
      const localNodes = nodesRef.current;
      const localLinks = linksRef.current;
      if (localNodes.length <= 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      if (draggingNodeIdRef.current) {
        frame = requestAnimationFrame(tick);
        return;
      }

      const repulsion = 8600;
      const damping = 0.82;
      // Keep Y neutral while allowing extra horizontal spread.
      const centerPullX = 0.0016;
      const centerPullY = 0.0031;
      const xForceGain = 1.34;
      const yForceGain = 1;
      const rootSpring = 0.02;
      const referenceSpring = 0.06;
      const childSpring = 0.12;
      const detailSpring = 0.14;
      // Slightly compact layout for better readability in medium/large graphs.
      const spreadFactor = localNodes.length <= 12 ? 1.48 : localNodes.length <= 22 ? 1.3 : 1.14;
      const rootLen = 172 * spreadFactor;
      const referenceLen = 146 * spreadFactor;
      const childLen = 66 * spreadFactor;
      const detailLen = 42 * spreadFactor;
      const maxPairForce = 4.2;
      const maxSpringForce = 2.8;
      const maxSpeed = 4.4;

      const forces = localNodes.map(() => ({ fx: 0, fy: 0 }));

      for (let i = 0; i < localNodes.length; i += 1) {
        for (let j = i + 1; j < localNodes.length; j += 1) {
          const a = localNodes[i];
          const b = localNodes[j];
          if (draggingNodeIdRef.current && (a.id === draggingNodeIdRef.current || b.id === draggingNodeIdRef.current)) {
            continue;
          }
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy || 1;
          const d = Math.sqrt(d2);
          if (d > 560) continue;
          const f = Math.min(repulsion / d2, maxPairForce);
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          forces[i].fx += fx;
          forces[i].fy += fy;
          forces[j].fx -= fx;
          forces[j].fy -= fy;
          const extraA = getLabelCollisionExtra(a.label);
          const extraB = getLabelCollisionExtra(b.label);
          const minDist = a.r + b.r + 18 + extraA + extraB;
          if (d < minDist) {
            const overlap = minDist - d;
            const push = Math.min(2.6, overlap * 0.18);
            const cfx = (dx / d) * push;
            const cfy = (dy / d) * push;
            forces[i].fx += cfx;
            forces[i].fy += cfy;
            forces[j].fx -= cfx;
            forces[j].fy -= cfy;
          }

          // Scheme B: treat label boxes as soft colliders and add extra repulsion
          // when label AABB overlaps. Keep Y-priority to preserve lane readability.
          const aLabelX = a.x;
          const aLabelY = a.y + a.r + 16 + getLabelVerticalOffset(a.id);
          const bLabelX = b.x;
          const bLabelY = b.y + b.r + 16 + getLabelVerticalOffset(b.id);
          const halfWsum = getLabelHalfWidth(a.label) + getLabelHalfWidth(b.label) + 4;
          const halfHsum = 7.5 + 7.5 + 2.5;
          const labelDx = aLabelX - bLabelX;
          const labelDy = aLabelY - bLabelY;
          const overlapX = halfWsum - Math.abs(labelDx);
          const overlapY = halfHsum - Math.abs(labelDy);
          // Smooth/low-jitter variant:
          // - Use soft direction (no hard sign flip near 0)
          // - Add relative-velocity damping when nodes already separate
          // - Ignore tiny overlap to avoid micro-oscillation
          if (overlapX > 2 && overlapY > 1) {
            const nx = labelDx / (Math.abs(labelDx) + 12);
            const ny = labelDy / (Math.abs(labelDy) + 10);
            const overlapRatioX = Math.min(1, overlapX / Math.max(1, halfWsum));
            const overlapRatioY = Math.min(1, overlapY / Math.max(1, halfHsum));
            const overlapRatio = overlapRatioX * overlapRatioY;

            const relVx = a.vx - b.vx;
            const relVy = a.vy - b.vy;
            const separatingX = relVx * nx > 0;
            const separatingY = relVy * ny > 0;
            const dampX = separatingX ? Math.min(0.6, Math.abs(relVx * nx) * 0.38) : 0;
            const dampY = separatingY ? Math.min(0.7, Math.abs(relVy * ny) * 0.35) : 0;

            const basePushY = Math.min(0.95, overlapRatio * 0.85 + overlapRatioY * 0.22);
            const basePushX = Math.min(0.18, overlapRatio * 0.16);
            const pushY = basePushY * (1 - dampY);
            const pushX = basePushX * (1 - dampX);

            forces[i].fy += ny * pushY;
            forces[j].fy -= ny * pushY;
            forces[i].fx += nx * pushX;
            forces[j].fx -= nx * pushX;
          }
        }
      }

      localLinks.forEach((link) => {
        if (
          draggingNodeIdRef.current &&
          (link.source === draggingNodeIdRef.current || link.target === draggingNodeIdRef.current)
        ) {
          return;
        }
        const si = localNodes.findIndex((node) => node.id === link.source);
        const ti = localNodes.findIndex((node) => node.id === link.target);
        if (si < 0 || ti < 0) return;
        const source = localNodes[si];
        const target = localNodes[ti];
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const len =
          link.type === 'root-link'
            ? rootLen
            : link.type === 'child-link'
              ? childLen
              : link.type === 'detail-link'
                ? detailLen
                : referenceLen;
        const k =
          link.type === 'root-link'
            ? rootSpring
            : link.type === 'child-link'
              ? childSpring
              : link.type === 'detail-link'
                ? detailSpring
                : referenceSpring;
        const f = Math.max(-maxSpringForce, Math.min(maxSpringForce, (d - len) * k));
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        forces[si].fx += fx;
        forces[si].fy += fy;
        forces[ti].fx -= fx;
        forces[ti].fy -= fy;
      });

      if (semanticBiasStrength > 0) {
        const softForce = 0.5;
        localNodes.forEach((node, i) => {
          if (node.id === 'root' || draggingNodeIdRef.current === node.id) return;
          const targetNorm = semanticTargetXById[node.id];
          if (typeof targetNorm !== 'number') return;
          const targetY = height * targetNorm;
          forces[i].fy += (targetY - node.y) * semanticBiasStrength * softForce;
        });
      }

      if (riskBiasStrength > 0) {
        const softRiskForce = 0.1;
        const riskLaneX: Record<GraphNode['riskLevel'], number> = {
          none: 0.24,
          low: 0.42,
          medium: 0.62,
          high: 0.8,
        };
        localNodes.forEach((node, i) => {
          if (node.id === 'root' || draggingNodeIdRef.current === node.id) return;
          const targetNorm = riskLaneX[node.riskLevel];
          const targetX = width * targetNorm;
          forces[i].fx += (targetX - node.x) * riskBiasStrength * softRiskForce;
        });
      }

      if (timeBiasStrength > 0) {
        const softTimeForce = 0.09;
        localNodes.forEach((node, i) => {
          if (node.id === 'root' || draggingNodeIdRef.current === node.id) return;
          const targetNorm = timeTargetXById[node.id];
          if (typeof targetNorm !== 'number') return;
          const targetX = width * targetNorm;
          forces[i].fx += (targetX - node.x) * timeBiasStrength * softTimeForce;
        });
      }

      localNodes.forEach((node, i) => {
        if (node.id === 'root') {
          node.x = width / 2;
          node.y = height / 2;
          node.vx = 0;
          node.vy = 0;
          return;
        }
        if (draggingNodeIdRef.current === node.id) {
          node.vx = 0;
          node.vy = 0;
          return;
        }
        forces[i].fx += (width / 2 - node.x) * centerPullX;
        forces[i].fy += (height / 2 - node.y) * centerPullY;
        const rightSoftEdge = width - margin;
        if (node.x > rightSoftEdge) {
          forces[i].fx -= Math.min(1.2, (node.x - rightSoftEdge) * 0.02);
        }
        const fx = Math.max(-maxPairForce, Math.min(maxPairForce, forces[i].fx * xForceGain));
        const fy = Math.max(-maxPairForce, Math.min(maxPairForce, forces[i].fy * yForceGain));
        node.vx = (node.vx + fx) * damping;
        node.vy = (node.vy + fy) * damping;
        node.vx = Math.max(-maxSpeed, Math.min(maxSpeed, node.vx));
        node.vy = Math.max(-maxSpeed, Math.min(maxSpeed, node.vy));
        if (Math.abs(node.vx) < 0.004) node.vx = 0;
        if (Math.abs(node.vy) < 0.004) node.vy = 0;
        node.x += node.vx;
        node.y += node.vy;
        const minX = margin;
        const maxX = width - margin;
        const minY = margin;
        const maxY = height - margin;
        // Use soft bounds instead of hard clipping to prevent edge pile-ups.
        if (node.x < minX) {
          node.x = minX + (minX - node.x) * 0.28;
          node.vx = Math.abs(node.vx) * 0.32;
        } else if (node.x > maxX) {
          node.x = maxX - (node.x - maxX) * 0.28;
          node.vx = -Math.abs(node.vx) * 0.32;
        }
        if (node.y < minY) {
          node.y = minY + (minY - node.y) * 0.28;
          node.vy = Math.abs(node.vy) * 0.32;
        } else if (node.y > maxY) {
          node.y = maxY - (node.y - maxY) * 0.28;
          node.vy = -Math.abs(node.vy) * 0.32;
        }
      });

      setNodes([...localNodes]);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [height, width, semanticBiasStrength, semanticTargetXById, riskBiasStrength, timeBiasStrength, timeTargetXById]);

  return {
    nodes,
    links,
    addNodeFromTemplate,
    markNodeAsMitigated,
    completeNodeAction,
    updateNodeContent,
    updateNodePosition,
    removeNodeCascade,
    addSupplementClause,
    loadGraphPreset,
    setDraggingNode,
  };
}
