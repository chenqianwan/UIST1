import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GraphLink, GraphNode, TemplateItem } from './types';
import { getRiskColor, distance, seededRandom } from './utils';

function getIndependentRiskLevel(seed: string): GraphNode['riskLevel'] {
  const v = seededRandom(seed);
  if (v < 0.25) return 'none';
  if (v < 0.5) return 'low';
  if (v < 0.78) return 'medium';
  return 'high';
}

function getActionTypeByRisk(
  riskLevel: GraphNode['riskLevel'],
  seed: string,
): GraphNode['actionType'] {
  if (riskLevel === 'none') return undefined;
  const u = seededRandom(seed);
  if (riskLevel === 'low') return u < 0.5 ? 'add_clause' : 'revise';
  if (riskLevel === 'medium') return u < 0.33 ? 'delete' : u < 0.66 ? 'revise' : 'add_clause';
  return u < 0.55 ? 'revise' : 'delete';
}

export function useGalaxyEngine(
  width: number,
  height: number,
  semanticBiasStrength = 0,
  semanticTargetXById: Record<string, number> = {},
  riskBiasStrength = 0,
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
      const id = `node_${Date.now()}`;
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
        templateId: template.id,
        actionType: template.riskLevel === 'none' ? undefined : template.actionType,
        actionReason: template.riskLevel === 'none' ? undefined : template.actionReason,
        suggestionText: template.riskLevel === 'none' ? undefined : template.suggestionText,
        supplementDraft: template.riskLevel === 'none' ? undefined : template.supplementDraft,
        confidence: template.riskLevel === 'none' ? undefined : template.confidence,
      };

      const existing = nodesRef.current;
      const smartTargets = existing
        .filter((node) => node.id !== 'root' && node.type === 'main')
        .map((node) => ({ id: node.id, d: distance(node, newNode) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
        .filter((item) => item.d < 260)
        .map((item) => item.id);

      const satellites = (template.satellites ?? []).map((item, index, arr) => {
        const angle = (index / Math.max(arr.length, 1)) * Math.PI * 2;
        const riskLevel = getIndependentRiskLevel(`${template.id}::sat::${item.label}::${item.content}`);
        const actionType = getActionTypeByRisk(riskLevel, `${template.id}::sat-action::${item.label}`);
        return {
          id: `sub_${id}_${index}`,
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
          templateId: template.id,
          parentId: id,
          actionType,
        };
      });
      const detailNodes = (template.satellites ?? []).flatMap((item, index, arr) => {
        const details = item.details ?? [];
        if (details.length === 0) return [];
        const satId = `sub_${id}_${index}`;
        const satAngle = (index / Math.max(arr.length, 1)) * Math.PI * 2;
        const satX = x + Math.cos(satAngle) * 56;
        const satY = y + Math.sin(satAngle) * 56;
        const ux = Math.cos(satAngle);
        const uy = Math.sin(satAngle);

        return details.slice(0, 1).map((detail, detailIndex) => {
          const riskLevel = getIndependentRiskLevel(`${template.id}::leaf::${detail.label}::${detail.content}`);
          const actionType = getActionTypeByRisk(riskLevel, `${template.id}::leaf-action::${detail.label}`);
          return {
            id: `leaf_${id}_${index}_${detailIndex}`,
            label: detail.label,
            type: 'leaf' as const,
            color: getRiskColor(riskLevel),
            x: satX + ux * 34,
            y: satY + uy * 34,
            vx: 0,
            vy: 0,
            r: 7,
            content: detail.content,
            riskLevel,
            templateId: template.id,
            parentId: satId,
            actionType,
          };
        });
      });

      const rootLink: GraphLink = { source: 'root', target: id, type: 'root-link' };
      const autoLinks: GraphLink[] = smartTargets.map((targetId) => ({
        source: id,
        target: targetId,
        type: 'smart-link',
      }));
      const satelliteLinks: GraphLink[] = satellites.map((sat) => ({
        source: id,
        target: sat.id,
        type: 'child-link',
      }));
      const detailLinks: GraphLink[] = detailNodes.map((leaf) => ({
        source: leaf.parentId ?? id,
        target: leaf.id,
        type: 'detail-link',
      }));

      const nextNodes = [...existing, newNode, ...satellites, ...detailNodes];
      const nextLinks = [...linksRef.current, rootLink, ...autoLinks, ...satelliteLinks, ...detailLinks];

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
            actionType: undefined,
            actionReason: undefined,
            suggestionText: undefined,
            supplementDraft: undefined,
            confidence: undefined,
          }
        : node,
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
    const nextLinks = linksRef.current.filter(
      (link) => !removeIds.has(link.source) && !removeIds.has(link.target),
    );

    nodesRef.current = nextNodes;
    linksRef.current = nextLinks;
    setNodes(nextNodes);
    setLinks(nextLinks);
  }, []);

  const addSupplementClause = useCallback((nodeId: string, draft?: string) => {
    const parentNode = nodesRef.current.find((node) => node.id === nodeId);
    if (!parentNode || parentNode.id === 'root') return;

    const isParentMain = parentNode.type === 'main';
    const childIndex = nodesRef.current.filter((node) => node.parentId === parentNode.id).length;
    const angle = (childIndex % 6) * (Math.PI / 3);
    const radius = isParentMain ? 62 : 38;
    const newType: GraphNode['type'] = isParentMain ? 'sub' : 'leaf';
    const newRadius = isParentMain ? 10 : 7;
    const content = (draft && draft.trim()) || `Supplement for "${parentNode.label}".`;
    const riskLevel: GraphNode['riskLevel'] = 'none';
    const newId = `${newType}_${parentNode.id}_${Date.now()}`;
    const newNode: GraphNode = {
      id: newId,
      label: isParentMain ? `Supplement ${childIndex + 1}` : `Detail ${childIndex + 1}`,
      type: newType,
      color: getRiskColor(riskLevel),
      x: parentNode.x + Math.cos(angle) * radius,
      y: parentNode.y + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      r: newRadius,
      content,
      riskLevel,
      templateId: parentNode.templateId,
      parentId: parentNode.id,
    };
    const newLink: GraphLink = {
      source: parentNode.id,
      target: newId,
      type: isParentMain ? 'child-link' : 'detail-link',
    };
    const nextNodes = [...nodesRef.current, newNode];
    const nextLinks = [...linksRef.current, newLink];
    nodesRef.current = nextNodes;
    linksRef.current = nextLinks;
    setNodes(nextNodes);
    setLinks(nextLinks);
  }, []);

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

      const repulsion = 7600;
      const damping = 0.88;
      const centerPull = 0.0036;
      const rootSpring = 0.02;
      const smartSpring = 0.06;
      const childSpring = 0.12;
      const detailSpring = 0.14;
      const spreadFactor = localNodes.length <= 12 ? 1.58 : localNodes.length <= 22 ? 1.28 : 1.05;
      const rootLen = 188 * spreadFactor;
      const smartLen = 156 * spreadFactor;
      const childLen = 70 * spreadFactor;
      const detailLen = 44 * spreadFactor;

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
          if (d > 420) continue;
          const f = repulsion / d2;
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          forces[i].fx += fx;
          forces[i].fy += fy;
          forces[j].fx -= fx;
          forces[j].fy -= fy;
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
                : smartLen;
        const k =
          link.type === 'root-link'
            ? rootSpring
            : link.type === 'child-link'
              ? childSpring
              : link.type === 'detail-link'
                ? detailSpring
                : smartSpring;
        const f = (d - len) * k;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        forces[si].fx += fx;
        forces[si].fy += fy;
        forces[ti].fx -= fx;
        forces[ti].fy -= fy;
      });

      if (semanticBiasStrength > 0) {
        const softForce = 0.12;
        localNodes.forEach((node, i) => {
          if (node.id === 'root' || draggingNodeIdRef.current === node.id) return;
          const targetNorm = semanticTargetXById[node.id];
          if (typeof targetNorm !== 'number') return;
          const targetX = width * targetNorm;
          forces[i].fx += (targetX - node.x) * semanticBiasStrength * softForce;
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
        forces[i].fx += (width / 2 - node.x) * centerPull;
        forces[i].fy += (height / 2 - node.y) * centerPull;
        node.vx = (node.vx + forces[i].fx) * damping;
        node.vy = (node.vy + forces[i].fy) * damping;
        node.x += node.vx;
        node.y += node.vy;
        node.x = Math.max(margin, Math.min(width - margin, node.x));
        node.y = Math.max(margin, Math.min(height - margin, node.y));
      });

      setNodes([...localNodes]);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [height, width, semanticBiasStrength, semanticTargetXById, riskBiasStrength]);

  return {
    nodes,
    links,
    addNodeFromTemplate,
    markNodeAsMitigated,
    updateNodePosition,
    removeNodeCascade,
    addSupplementClause,
    setDraggingNode,
  };
}
