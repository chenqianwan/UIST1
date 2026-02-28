import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from 'react';
import { Box, DollarSign, Download, FileText, Link2, Shield, Sparkles, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import canvasBg from '../static/canvas_bg.png';
import sidePanelBg from '../static/side_panel.png';

type NodeKind = 'root' | 'main' | 'sub' | 'leaf';
type LinkKind = 'root-link' | 'smart-link' | 'child-link' | 'detail-link';
type RiskLevel = 'none' | 'low' | 'medium' | 'high';

interface TemplateDetailItem {
  label: string;
  content: string;
}

interface TemplateSubItem {
  label: string;
  content: string;
  details?: TemplateDetailItem[];
}

interface TemplateItem {
  id: string;
  label: string;
  description: string;
  type: 'financial' | 'risk' | 'obligation' | 'asset';
  riskLevel: RiskLevel;
  content: string;
  satellites?: TemplateSubItem[];
}

interface GraphNode {
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

interface GraphLink {
  source: string;
  target: string;
  type: LinkKind;
}

const getRiskColor = (riskLevel: RiskLevel): string => {
  switch (riskLevel) {
    case 'none':
      return '#77c8b3';
    case 'low':
      return '#dcc46b';
    case 'medium':
      return '#e3a174';
    case 'high':
      return '#de6f66';
    default:
      return '#77c8b3';
  }
};

const getRiskText = (riskLevel: RiskLevel): string => {
  switch (riskLevel) {
    case 'none':
      return 'No Risk';
    case 'low':
      return 'Low Risk';
    case 'medium':
      return 'Medium Risk';
    case 'high':
      return 'High Risk';
    default:
      return 'No Risk';
  }
};

const getRiskNodeStrokeColor = (riskLevel: RiskLevel): string => {
  switch (riskLevel) {
    case 'none':
      return '#77c8b3';
    case 'low':
      return '#dcc46b';
    case 'medium':
      return '#e3a174';
    case 'high':
      return '#de6f66';
    default:
      return '#77c8b3';
  }
};

/** Seeded 0–1 from string id for stable per-node randomness */
function seededRandom(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 10000) / 10000;
}

/** Highlight arc length (min = current, max = 1/3 of circle); position in bottom-right */
function getNodeHighlightParams(nodeId: string, arcR: number): { length: number; offset: number } {
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

const getRiskNodeGradientId = (riskLevel: RiskLevel): string => {
  switch (riskLevel) {
    case 'none': return 'node-fill-none';
    case 'low': return 'node-fill-low';
    case 'medium': return 'node-fill-medium';
    case 'high': return 'node-fill-high';
    default: return 'node-fill-none';
  }
};

const getRiskNodeInnerStroke = (riskLevel: RiskLevel): string => {
  switch (riskLevel) {
    case 'none': return '#89cfbb';
    case 'low': return '#e3cd79';
    case 'medium': return '#e9af89';
    case 'high': return '#ea8b83';
    default: return '#89cfbb';
  }
};

const getAiSuggestion = (node: GraphNode) => {
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
};

const NODE_LIBRARY: TemplateItem[] = [
  {
    id: 'tpl-payment',
    label: 'Standard Payment Terms',
    description: 'Clear payment milestones and timelines with low execution risk',
    type: 'financial',
    riskLevel: 'none',
    content: 'Party A shall pay the corresponding milestone fee within 10 business days after acceptance.',
    satellites: [
      {
        label: 'Initial Payment',
        content: 'Initial payment is due upon contract signing.',
        details: [{ label: 'Payment Proof', content: 'Bank transfer receipt serves as proof of initial payment.' }],
      },
      { label: 'Acceptance Payment', content: 'Second-stage payment is due after acceptance is approved.' },
      { label: 'Final Payment', content: 'Remaining balance is due after the warranty period ends.' },
    ],
  },
  {
    id: 'tpl-ip',
    label: 'Intellectual Property Ownership',
    description: 'Deliverable ownership is clear, but infringement boundaries need refinement',
    type: 'asset',
    riskLevel: 'low',
    content: 'All deliverables and derivative outcomes of this project are owned by Party A.',
    satellites: [
      {
        label: 'Background IP',
        content: 'Party B retains pre-existing background intellectual property rights.',
        details: [{ label: 'License Scope', content: 'Background IP grants a non-exclusive license for this project only.' }],
      },
      { label: 'Infringement Warranty', content: 'Party B assumes indemnification responsibility for infringement risk.' },
    ],
  },
  {
    id: 'tpl-confidentiality',
    label: 'Mutual Confidentiality Obligation',
    description: 'Covers confidentiality duration and disclosure exceptions with controllable risk',
    type: 'obligation',
    riskLevel: 'none',
    content: 'Both parties shall maintain ongoing confidentiality for trade secrets learned during collaboration.',
    satellites: [
      { label: 'Confidentiality Period', content: 'Confidentiality obligations continue for the agreed period after termination.' },
      { label: 'Disclosure Exceptions', content: 'Legally mandated disclosure scenarios are treated as exceptions.' },
    ],
  },
  {
    id: 'tpl-acceptance',
    label: 'Acceptance Criteria Clause',
    description: 'Acceptance criteria are not sufficiently quantifiable; dispute risk is medium',
    type: 'obligation',
    riskLevel: 'medium',
    content: 'Party A shall conduct acceptance after delivery; specific criteria require joint confirmation.',
    satellites: [
      { label: 'Defect Remediation', content: 'Party B shall complete defect remediation within a reasonable timeframe.' },
      {
        label: 'Re-Validation Process',
        content: 'If re-validation fails, another remediation cycle must begin.',
        details: [{ label: 'Re-Validation SLA', content: 'Provide re-validation feedback within 3 business days after each remediation.' }],
      },
    ],
  },
  {
    id: 'tpl-liability',
    label: 'Liability and Indemnification',
    description: 'Liability cap and exemption boundaries still leave interpretation room',
    type: 'risk',
    riskLevel: 'medium',
    content: 'Direct losses caused by Party B breach shall be compensated within the liability cap.',
    satellites: [
      { label: 'Liability Cap', content: 'Compensation cap is based on total contract value.' },
      { label: 'Exemption Clause', content: 'Losses caused by force majeure may be partially exempted.' },
    ],
  },
  {
    id: 'tpl-termination',
    label: 'Unilateral Termination Right',
    description: 'Trigger conditions are ambiguous, creating high dispute and risk potential',
    type: 'risk',
    riskLevel: 'high',
    content: 'Either party may unilaterally terminate for material breach, but quantitative standards are undefined.',
    satellites: [
      { label: 'Notice Period', content: 'A written notice must be issued at least 7 days before termination.' },
      {
        label: 'Loss Settlement',
        content: 'Both parties shall complete settlement within 15 days after termination.',
        details: [{ label: 'Settlement Basis', content: 'Settlement is based on completed milestones and acceptable deliverables.' }],
      },
    ],
  },
];

const distance = (a: GraphNode, b: GraphNode): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const getEdgePath = (
  source: GraphNode,
  target: GraphNode,
  bend = 0.18,
  sourcePadding = 0,
  targetPadding = 0,
): string => {
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
};

const useGalaxyEngine = (width: number, height: number) => {
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
        return {
          id: `sub_${id}_${index}`,
          label: item.label,
          type: 'sub' as const,
          color: getRiskColor(template.riskLevel),
          x: x + Math.cos(angle) * 56,
          y: y + Math.sin(angle) * 56,
          vx: 0,
          vy: 0,
          r: 10,
          content: item.content,
          riskLevel: template.riskLevel,
          templateId: template.id,
          parentId: id,
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

        return details.slice(0, 1).map((detail, detailIndex) => ({
          id: `leaf_${id}_${index}_${detailIndex}`,
          label: detail.label,
          type: 'leaf' as const,
          color: getRiskColor(template.riskLevel),
          x: satX + ux * 34,
          y: satY + uy * 34,
          vx: 0,
          vy: 0,
          r: 7,
          content: detail.content,
          riskLevel: template.riskLevel,
          templateId: template.id,
          parentId: satId,
        }));
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
      // Adapt spacing by graph density to better use the canvas area.
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
  }, [height, width]);

  return {
    nodes,
    links,
    addNodeFromTemplate,
    markNodeAsMitigated,
    updateNodePosition,
    removeNodeCascade,
    setDraggingNode,
  };
};

const getTemplateIcon = (type: TemplateItem['type']) => {
  switch (type) {
    case 'financial':
      return <DollarSign size={14} />;
    case 'risk':
      return <Shield size={14} />;
    case 'asset':
      return <Box size={14} />;
    default:
      return <FileText size={14} />;
  }
};

export default function ContractConstellation() {
  const width = 760;
  const height = 620;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const trashRef = useRef<HTMLDivElement | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDragOverCanvas, setIsDragOverCanvas] = useState(false);
  const [usedTemplateIds, setUsedTemplateIds] = useState<string[]>([]);
  const [lastAppliedNodeId, setLastAppliedNodeId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isOverTrash, setIsOverTrash] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'success'>('idle');
  const [revealStage, setRevealStage] = useState<1 | 2>(2);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const exportTimerRef = useRef<number | null>(null);
  const {
    nodes,
    links,
    addNodeFromTemplate,
    markNodeAsMitigated,
    updateNodePosition,
    removeNodeCascade,
    setDraggingNode,
  } = useGalaxyEngine(width, height);
  const availableTemplates = useMemo(
    () => NODE_LIBRARY.filter((item) => !usedTemplateIds.includes(item.id)),
    [usedTemplateIds],
  );

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const aiSuggestion = useMemo(
    () => (selectedNode && selectedNode.id !== 'root' ? getAiSuggestion(selectedNode) : null),
    [selectedNode],
  );
  const focusDepthMap = useMemo(() => {
    if (!selectedNodeId) return null;
    const depthMap = new Map<string, number>();
    const queue: string[] = [selectedNodeId];
    const queueDepth: number[] = [0];
    while (queue.length > 0) {
      const current = queue.shift();
      const currentDepth = queueDepth.shift() ?? 0;
      if (!current || depthMap.has(current)) continue;
      depthMap.set(current, currentDepth);
      links.forEach((link) => {
        if (link.source === current && !depthMap.has(link.target)) {
          queue.push(link.target);
          queueDepth.push(currentDepth + 1);
        }
      });
    }
    return depthMap;
  }, [links, selectedNodeId]);
  const incomingNodeIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    return new Set(
      links.filter((link) => link.target === selectedNodeId && link.source !== selectedNodeId).map((link) => link.source),
    );
  }, [links, selectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) {
      setRevealStage(2);
      return;
    }
    setRevealStage(1);
    const timer = window.setTimeout(() => setRevealStage(2), 260);
    return () => window.clearTimeout(timer);
  }, [selectedNodeId]);

  const handleDragStart = (event: DragEvent<HTMLDivElement>, templateId: string) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', templateId);
  };

  const handleDrop = (event: DragEvent<SVGSVGElement>) => {
    event.preventDefault();
    setIsDragOverCanvas(false);
    const templateId = event.dataTransfer.getData('text/plain');
    if (usedTemplateIds.includes(templateId)) return;
    const template = NODE_LIBRARY.find((item) => item.id === templateId);
    if (!template || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const y = ((event.clientY - rect.top) / rect.height) * height;
    addNodeFromTemplate(template, x, y);
    setUsedTemplateIds((prev) => [...prev, template.id]);
  };

  const handleNodePointerDown = (event: PointerEvent<SVGGElement>, node: GraphNode) => {
    if (node.id === 'root' || !svgRef.current) return;
    event.stopPropagation();
    const rect = svgRef.current.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * width;
    const pointerY = ((event.clientY - rect.top) / rect.height) * height;
    dragOffsetRef.current = { x: pointerX - node.x, y: pointerY - node.y };
    setDraggingNodeId(node.id);
    setDraggingNode(node.id);
    setSelectedNodeId(node.id);
  };

  const endNodeDrag = useCallback(
    (shouldDelete: boolean) => {
      if (!draggingNodeId) return;
      if (shouldDelete) {
        const draggedNode = nodes.find((node) => node.id === draggingNodeId);
        if (draggedNode?.type === 'sub') {
          removeNodeCascade(draggingNodeId);
          if (selectedNodeId === draggingNodeId) setSelectedNodeId(null);
        } else if (draggedNode && draggedNode.id !== 'root') {
          removeNodeCascade(draggingNodeId);
          if (draggedNode.templateId) {
            setUsedTemplateIds((prev) => prev.filter((id) => id !== draggedNode.templateId));
          }
          setSelectedNodeId(null);
        }
      }
      setDraggingNodeId(null);
      setDraggingNode(null);
      setIsOverTrash(false);
    },
    [
      draggingNodeId,
      nodes,
      removeNodeCascade,
      selectedNodeId,
      setDraggingNode,
    ],
  );

  const updateDraggingByClient = useCallback(
    (clientX: number, clientY: number) => {
      if (!draggingNodeId || !svgRef.current) return false;
      const rect = svgRef.current.getBoundingClientRect();
      const nextX = ((clientX - rect.left) / rect.width) * width - dragOffsetRef.current.x;
      const nextY = ((clientY - rect.top) / rect.height) * height - dragOffsetRef.current.y;
      updateNodePosition(
        draggingNodeId,
        Math.max(18, Math.min(width - 18, nextX)),
        Math.max(18, Math.min(height - 18, nextY)),
      );

      let overTrash = false;
      if (trashRef.current) {
        const trashRect = trashRef.current.getBoundingClientRect();
        overTrash =
          clientX >= trashRect.left &&
          clientX <= trashRect.right &&
          clientY >= trashRect.top &&
          clientY <= trashRect.bottom;
      }
      setIsOverTrash(overTrash);
      return overTrash;
    },
    [draggingNodeId, height, updateNodePosition, width],
  );

  const handleCanvasPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    updateDraggingByClient(event.clientX, event.clientY);
  };

  useEffect(() => {
    if (!draggingNodeId) return;

    const onWindowPointerMove = (event: globalThis.PointerEvent) => {
      updateDraggingByClient(event.clientX, event.clientY);
    };

    const onWindowPointerUp = (event: globalThis.PointerEvent) => {
      const shouldDelete = updateDraggingByClient(event.clientX, event.clientY);
      endNodeDrag(shouldDelete);
    };

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
    };
  }, [draggingNodeId, endNodeDrag, updateDraggingByClient]);

  const handleCanvasPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const shouldDelete = updateDraggingByClient(event.clientX, event.clientY);
    endNodeDrag(shouldDelete);
  };

  const handleExportContract = useCallback(() => {
    if (exportState === 'exporting') return;
    if (exportTimerRef.current) {
      window.clearTimeout(exportTimerRef.current);
      exportTimerRef.current = null;
    }

    setExportState('exporting');
    const exportPayload = {
      generatedAt: new Date().toISOString(),
      clauses: nodes
        .filter((node) => node.id !== 'root')
        .map((node) => ({
          id: node.id,
          label: node.label,
          type: node.type,
          riskLevel: node.riskLevel,
          content: node.content,
          parentId: node.parentId ?? null,
        })),
      links,
    };

    exportTimerRef.current = window.setTimeout(() => {
      // Demo export: here we only simulate successful generation.
      console.info('[Demo] Contract exported successfully', exportPayload);
      setExportState('success');
      exportTimerRef.current = window.setTimeout(() => {
        setExportState('idle');
      }, 2200);
    }, 900);
  }, [exportState, links, nodes]);

  useEffect(() => {
    return () => {
      if (exportTimerRef.current) {
        window.clearTimeout(exportTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="flex h-full w-full overflow-hidden border border-slate-200 bg-[#F7F9FC]">
      <div className="relative flex-1 select-none border-r border-slate-200 bg-white">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${canvasBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: 0.14,
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-white/86" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_40%,rgba(255,255,255,0)_0%,rgba(255,255,255,0.3)_100%)]" />

        <div className="absolute left-4 top-4 z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
          Drag nodes from the right panel into the canvas to auto-create relationships.
        </div>
        <div
          ref={trashRef}
          className={`pointer-events-none absolute bottom-20 left-4 z-0 w-52 rounded-xl border border-dashed p-3 text-center transition ${
            isOverTrash
              ? 'border-red-400 bg-red-50 text-red-600'
              : draggingNodeId
                ? 'border-red-300 bg-red-50 text-red-500'
                : 'border-slate-300 bg-white text-slate-600'
          }`}
        >
          <div className="flex items-center justify-center gap-2 text-xs font-semibold">
            <Trash2 size={14} />
            Drop Here
          </div>
          <p className="mt-1 text-[11px] opacity-80">Sub-clause: Delete / Main clause: Remove reference</p>
        </div>
        <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600 shadow-sm">
          <div className="mb-1 font-semibold text-slate-700">Risk Legend</div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getRiskColor('none') }} />
            No Risk
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getRiskColor('low') }} />
            Low Risk
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getRiskColor('medium') }} />
            Medium Risk
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getRiskColor('high') }} />
            High Risk
          </div>
        </div>

        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          onClick={() => setSelectedNodeId(null)}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onDragOver={(event) => {
            event.preventDefault();
            if (!isDragOverCanvas) setIsDragOverCanvas(true);
          }}
          onDragLeave={() => setIsDragOverCanvas(false)}
          onDrop={handleDrop}
          className="relative z-[1] h-full w-full cursor-crosshair"
        >
          <defs>
            <marker
              id="auto-arrow"
              viewBox="0 0 10 10"
              markerWidth="6"
              markerHeight="6"
              refX="10"
              refY="5"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
            </marker>
            <radialGradient id="node-fill-none" cx="34%" cy="30%" r="76%">
              <stop offset="0%" stopColor="#9fd8c9" />
              <stop offset="100%" stopColor="#90cdc0" />
            </radialGradient>
            <radialGradient id="node-fill-low" cx="34%" cy="30%" r="76%">
              <stop offset="0%" stopColor="#efd27c" />
              <stop offset="100%" stopColor="#e7c86a" />
            </radialGradient>
            <radialGradient id="node-fill-medium" cx="34%" cy="30%" r="76%">
              <stop offset="0%" stopColor="#efae95" />
              <stop offset="100%" stopColor="#e69d84" />
            </radialGradient>
            <radialGradient id="node-fill-high" cx="34%" cy="30%" r="76%">
              <stop offset="0%" stopColor="#ef9b93" />
              <stop offset="100%" stopColor="#e9867d" />
            </radialGradient>
            <radialGradient id="node-soft-light" cx="30%" cy="22%" r="62%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
            </radialGradient>
          </defs>

          {links.map((link) => {
            const source = nodes.find((node) => node.id === link.source);
            const target = nodes.find((node) => node.id === link.target);
            if (!source || !target) return null;
            if (draggingNodeId && (link.source === draggingNodeId || link.target === draggingNodeId)) {
              return null;
            }
            const smart = link.type === 'smart-link';
            const child = link.type === 'child-link';
            const detail = link.type === 'detail-link';
            const sourceDepth = focusDepthMap?.get(link.source);
            const isFocused = !selectedNodeId || sourceDepth !== undefined;
            const isIncomingToSelected = Boolean(selectedNodeId) && link.target === selectedNodeId && link.source !== selectedNodeId;
            const isOutgoingFromSelected = Boolean(selectedNodeId) && link.source === selectedNodeId;
            const sourceEffectiveR =
              source.id === 'root' ? source.r : (source.r * 227) / 256;
            const targetEffectiveR =
              target.id === 'root' ? target.r : (target.r * 227) / 256;
            const edgePath = getEdgePath(
              source,
              target,
              detail ? 0.08 : child ? 0.12 : 0.18,
              sourceEffectiveR,
              targetEffectiveR,
            );
            const shouldRevealEdge =
              !selectedNodeId ||
              isIncomingToSelected ||
              (sourceDepth !== undefined && (revealStage === 2 || sourceDepth <= 1));
            const edgeCenterX = (source.x + target.x) / 2;
            const edgeCenterY = (source.y + target.y) / 2;
            const distToSelected = selectedNode
              ? Math.hypot(edgeCenterX - selectedNode.x, edgeCenterY - selectedNode.y)
              : 0;
            const lensFactor = !selectedNode ? 1 : distToSelected > 320 ? 0.65 : distToSelected > 250 ? 0.82 : 1;
            const baseOpacity =
              !shouldRevealEdge
                ? 0.08
                : isIncomingToSelected
                  ? 0.52
                  : detail
                    ? 0.44
                    : child
                      ? 0.56
                      : smart
                        ? 0.44
                        : 0.3;
            return (
              <g key={`${link.source}-${link.target}-${link.type}`}>
                <motion.path
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: 1,
                    opacity: baseOpacity * lensFactor,
                  }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  d={edgePath}
                  stroke={isFocused ? (child || detail ? target.color : '#2563eb') : isIncomingToSelected ? '#94a3b8' : '#cbd5e1'}
                  strokeWidth={selectedNodeId && sourceDepth !== undefined && sourceDepth <= 1 ? 1.9 : 1.2}
                  strokeDasharray={detail ? '2 2' : '0'}
                  strokeLinecap="round"
                  fill="none"
                  markerEnd="url(#auto-arrow)"
                />
                {selectedNodeId && isOutgoingFromSelected && (
                  <motion.path
                    d={edgePath}
                    stroke={child || detail ? target.color : '#2563eb'}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeDasharray="7 10"
                    fill="none"
                    animate={{ strokeDashoffset: [0, -38], opacity: [0.45, 0.9, 0.45] }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
                  />
                )}
              </g>
            );
          })}

          {nodes.map((node) => {
            const selected = node.id === selectedNodeId;
            const isRoot = node.id === 'root';
            const isLeaf = node.type === 'leaf';
            const depth = focusDepthMap?.get(node.id);
            const isIncoming = incomingNodeIds.has(node.id);
            const isFocused = !selectedNodeId || depth !== undefined || isIncoming;
            const distToSelected = selectedNode
              ? Math.hypot(node.x - selectedNode.x, node.y - selectedNode.y)
              : 0;
            const lensFactor = !selectedNode ? 1 : distToSelected > 340 ? 0.5 : distToSelected > 260 ? 0.72 : 1;
            const depthOpacity = !selectedNodeId
              ? 1
              : selected
                ? 1
                : isIncoming
                  ? 0.72
                  : depth === undefined
                    ? 0.14
                    : revealStage === 1 && depth > 1
                      ? 0.16
                      : depth === 1
                        ? 0.9
                        : depth === 2
                          ? 0.58
                          : 0.34;
            const nodeTone = !selectedNodeId
              ? 1
              : selected
                ? 1
                : isFocused
                  ? Math.max(0.46, depthOpacity * lensFactor)
                  : 0.16;
            const shouldShowLabel =
              !isLeaf
                ? !selectedNodeId || selected || isIncoming || (depth !== undefined && depth <= 1)
                : selected || (depth !== undefined && depth <= 1 && revealStage === 2);
            const isDragging = node.id === draggingNodeId;
            return (
              <motion.g
                key={node.id}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{
                  x: node.x,
                  y: node.y,
                  opacity: 1,
                  scale: selected ? 1.12 : isFocused ? (depth !== undefined && depth > 1 ? 0.98 : 1) : 0.95,
                }}
                transition={{
                  x: isDragging
                    ? { type: 'tween', duration: 0 }
                    : { type: 'spring', stiffness: 170, damping: 18, mass: 0.7 },
                  y: isDragging
                    ? { type: 'tween', duration: 0 }
                    : { type: 'spring', stiffness: 170, damping: 18, mass: 0.7 },
                  scale: { type: 'spring', stiffness: 220, damping: 16 },
                  opacity: { duration: 0.2 },
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedNodeId(node.id);
                }}
                onPointerDown={(event) => handleNodePointerDown(event, node)}
                className={node.id === 'root' ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}
                style={{
                  filter: !isFocused
                    ? 'saturate(0.72) brightness(0.98)'
                    : selected
                      ? 'drop-shadow(0 5px 12px rgba(59,130,246,0.2))'
                      : 'none',
                }}
              >
                {selected && (
                  <circle
                    r={node.r + 3}
                    fill="none"
                    stroke={isRoot ? '#94a3b8' : getRiskNodeStrokeColor(node.riskLevel)}
                    strokeWidth={1.6}
                    strokeOpacity={0.32}
                  />
                )}
                <circle
                  r={node.r}
                  fill={isRoot ? '#f1f3f6' : 'none'}
                  fillOpacity={isRoot ? Math.min(1, nodeTone + 0.06) : 0}
                  stroke={isRoot ? '#a4a9b4' : 'none'}
                  strokeWidth={isRoot ? 1.8 : 0}
                  strokeOpacity={isRoot ? nodeTone : 0}
                />
                {!isRoot && (() => {
                  const R = (node.r * 227) / 256;
                  const arcR = (node.r * 168) / 256;
                  const circum = 2 * Math.PI * arcR;
                  const scale = node.r / 256;
                  const mainStroke = 10.5 * scale;
                  const innerStroke = 5.2 * scale;
                  const arcStroke = 36.4 * scale;
                  const softR = (node.r * 214) / 256;
                  const innerR = (node.r * 197) / 256;
                  const { length: highlightLen, offset: highlightOffset } = getNodeHighlightParams(node.id, arcR);
                  return (
                    <g opacity={Math.min(1, nodeTone + 0.04)}>
                      <circle r={R} fill={`url(#${getRiskNodeGradientId(node.riskLevel)})`} stroke={getRiskNodeStrokeColor(node.riskLevel)} strokeWidth={mainStroke} />
                      <circle r={softR} fill="url(#node-soft-light)" opacity={0.6} />
                      <circle r={innerR} fill="none" stroke={getRiskNodeInnerStroke(node.riskLevel)} strokeWidth={innerStroke} opacity={0.58} />
                      <circle r={arcR} fill="none" stroke="#ffffff" strokeWidth={arcStroke} strokeLinecap="round" strokeDasharray={`${circum} 1`} strokeOpacity={0.24} />
                      <circle r={arcR} fill="none" stroke="#ffffff" strokeWidth={arcStroke} strokeLinecap="round" strokeDasharray={`${highlightLen} ${circum - highlightLen}`} strokeDashoffset={highlightOffset} strokeOpacity={0.94} />
                    </g>
                  );
                })()}
                {isRoot && (
                  <circle
                    r={3.8}
                    fill="#6b7280"
                    fillOpacity={nodeTone}
                  />
                )}
                {shouldShowLabel && (
                  <text
                    x={0}
                    y={node.r + 16}
                    textAnchor="middle"
                    fontSize={isLeaf ? 10 : 11}
                    fill={isRoot ? '#374151' : '#1f2937'}
                    fillOpacity={Math.min(1, nodeTone + 0.08)}
                    className="pointer-events-none select-none font-semibold"
                  >
                    {node.label}
                  </text>
                )}
              </motion.g>
            );
          })}
        </svg>

        {isDragOverCanvas && (
          <div className="pointer-events-none absolute inset-3 rounded-xl border-2 border-dashed border-cyan-300/90 bg-cyan-300/10 backdrop-blur-sm" />
        )}
      </div>

      <div className="relative flex w-80 flex-col overflow-hidden border-l border-slate-200 bg-white">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${sidePanelBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: 0.9,
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-white/72" />

        <div className="relative z-[1] border-b border-slate-200 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Link2 size={14} className="text-blue-600" />
            Node Library
          </h3>
          <p className="mt-1 text-xs text-slate-500">Drag nodes into the main canvas to auto-generate links</p>
        </div>

        <div className="relative z-[1] flex-1 space-y-3 overflow-y-auto p-4">
          {availableTemplates.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(event) => handleDragStart(event, item.id)}
              className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md active:cursor-grabbing"
            >
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md"
                  style={{
                    backgroundColor: `${getRiskColor(item.riskLevel)}22`,
                    color: getRiskColor(item.riskLevel),
                  }}
                >
                  {getTemplateIcon(item.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-800"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {item.label}
                    </div>
                    <span
                      className="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{
                        backgroundColor: `${getRiskColor(item.riskLevel)}1f`,
                        color: getRiskColor(item.riskLevel),
                      }}
                    >
                      {getRiskText(item.riskLevel)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs leading-snug text-slate-500">{item.description}</div>
                </div>
              </div>
            </div>
          ))}
          {availableTemplates.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
              All nodes have been added. Click canvas nodes to continue editing.
            </div>
          )}
        </div>

        <div className="relative z-[1] border-t border-slate-200 p-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected Node</p>
            {selectedNode && selectedNode.id !== 'root' ? (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800">{selectedNode.label}</p>
                  <span
                    className="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{
                      backgroundColor: `${getRiskColor(selectedNode.riskLevel)}1f`,
                      color: getRiskColor(selectedNode.riskLevel),
                    }}
                  >
                    {getRiskText(selectedNode.riskLevel)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-600">{selectedNode.content}</p>
                {lastAppliedNodeId === selectedNode.id && selectedNode.riskLevel === 'none' && (
                  <p className="text-[11px] font-semibold text-emerald-600">AI update applied; node is now marked as no-risk.</p>
                )}
                {aiSuggestion && (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-sky-50 p-3">
                    <div className="mb-1 flex items-center gap-1 border-l-4 border-blue-500 pl-2 text-xs font-semibold text-blue-700">
                      <Sparkles size={12} />
                      AI Suggestion: {aiSuggestion.title}
                    </div>
                    <p className="text-xs leading-relaxed text-slate-600">{aiSuggestion.reason}</p>
                    <div className="mt-2 rounded border border-slate-200 bg-white p-2 text-xs leading-relaxed text-slate-700">
                      {aiSuggestion.replacement}
                    </div>
                    <button
                      className="mt-2 w-full rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 hover:border-blue-300"
                      onClick={() => {
                        markNodeAsMitigated(selectedNode.id, aiSuggestion.replacement);
                        setLastAppliedNodeId(selectedNode.id);
                      }}
                    >
                      Apply AI Suggestion
                    </button>
                    {lastAppliedNodeId === selectedNode.id && (
                      <p className="mt-1 text-center text-[11px] text-emerald-600">AI suggestion applied successfully.</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Click a clause node on the canvas to view details.</p>
            )}
          </div>
          <button
            onClick={handleExportContract}
            disabled={exportState === 'exporting'}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 hover:border-blue-300 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            <Download size={14} />
            {exportState === 'exporting' ? 'Exporting...' : 'Export Contract'}
          </button>
          {exportState === 'success' && (
            <p className="mt-1 text-center text-[11px] text-emerald-600">Export successful. Current changes were included (Demo).</p>
          )}
        </div>
      </div>
    </div>
  );
}
