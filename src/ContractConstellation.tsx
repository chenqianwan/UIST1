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

const STAR_POINTS = [
  { x: 6, y: 12, size: 1.5 },
  { x: 13, y: 26, size: 1.2 },
  { x: 19, y: 43, size: 1.4 },
  { x: 24, y: 16, size: 1.1 },
  { x: 32, y: 36, size: 1.6 },
  { x: 38, y: 58, size: 1.3 },
  { x: 44, y: 19, size: 1.2 },
  { x: 51, y: 11, size: 1.5 },
  { x: 59, y: 29, size: 1.1 },
  { x: 67, y: 17, size: 1.4 },
  { x: 74, y: 35, size: 1.2 },
  { x: 82, y: 12, size: 1.5 },
  { x: 88, y: 24, size: 1.1 },
  { x: 91, y: 45, size: 1.4 },
  { x: 77, y: 64, size: 1.3 },
  { x: 61, y: 74, size: 1.2 },
  { x: 47, y: 83, size: 1.4 },
  { x: 28, y: 76, size: 1.1 },
];

const getRiskColor = (riskLevel: RiskLevel): string => {
  switch (riskLevel) {
    case 'none':
      return '#22c55e';
    case 'low':
      return '#facc15';
    case 'medium':
      return '#fb923c';
    case 'high':
      return '#ef4444';
    default:
      return '#22c55e';
  }
};

const getRiskText = (riskLevel: RiskLevel): string => {
  switch (riskLevel) {
    case 'none':
      return '无风险';
    case 'low':
      return '低风险';
    case 'medium':
      return '中风险';
    case 'high':
      return '高风险';
    default:
      return '无风险';
  }
};

const getAiSuggestion = (node: GraphNode) => {
  if (node.riskLevel === 'none') return null;
  if (node.riskLevel === 'low') {
    return {
      title: '建议补强措辞',
      reason: '当前条款总体可用，但部分触发条件和边界描述偏宽泛。',
      replacement: `${node.content} 建议补充“以双方签字确认文件为准”的判定标准。`,
    };
  }
  if (node.riskLevel === 'medium') {
    return {
      title: '建议明确执行条件',
      reason: '该条款存在解释空间，可能导致执行口径不一致。',
      replacement: `${node.content} 建议增加明确的时间节点、验收标准和书面确认流程。`,
    };
  }
  return {
    title: '高风险建议立即修订',
    reason: '条款争议风险较高，建议增加量化条件和违约后处理路径。',
    replacement: `${node.content} 建议补充“触发条件、责任上限、争议解决时限”三项硬性约束，并以附件标准模板执行。`,
  };
};

const NODE_LIBRARY: TemplateItem[] = [
  {
    id: 'tpl-payment',
    label: '标准付款条款',
    description: '付款节点清晰、时限明确，执行风险低',
    type: 'financial',
    riskLevel: 'none',
    content: '甲方应在验收通过后 10 个工作日内支付对应阶段费用。',
    satellites: [
      {
        label: '首付款',
        content: '合同签署后支付首付款。',
        details: [{ label: '付款凭证', content: '以银行回单作为首付款完成凭证。' }],
      },
      { label: '验收款', content: '验收通过后支付第二阶段款项。' },
      { label: '尾款', content: '质保期结束后支付剩余尾款。' },
    ],
  },
  {
    id: 'tpl-ip',
    label: '知识产权归属',
    description: '交付物权属清晰，但侵权界定仍需补强',
    type: 'asset',
    riskLevel: 'low',
    content: '本项目交付物及其衍生成果的知识产权归甲方所有。',
    satellites: [
      {
        label: '背景 IP',
        content: '乙方保留既有背景知识产权。',
        details: [{ label: '授权范围', content: '背景 IP 在本项目内授予非独占使用许可。' }],
      },
      { label: '侵权担保', content: '乙方对侵权风险承担赔偿责任。' },
    ],
  },
  {
    id: 'tpl-confidentiality',
    label: '双向保密义务',
    description: '覆盖保密期限和例外披露，风险可控',
    type: 'obligation',
    riskLevel: 'none',
    content: '双方应对合作期间知悉的商业秘密承担持续保密义务。',
    satellites: [
      { label: '保密期限', content: '协议终止后仍保持约定期限保密。' },
      { label: '披露例外', content: '法律强制披露场景可作为例外。' },
    ],
  },
  {
    id: 'tpl-acceptance',
    label: '验收标准条款',
    description: '验收标准不够量化，争议概率中等',
    type: 'obligation',
    riskLevel: 'medium',
    content: '甲方应在交付后进行验收，但具体验收指标需双方另行确认。',
    satellites: [
      { label: '缺陷修复', content: '乙方应在合理期限内完成缺陷修复。' },
      {
        label: '复验流程',
        content: '复验不通过时应进入再次整改流程。',
        details: [{ label: '复验时限', content: '每次整改后 3 个工作日内完成复验反馈。' }],
      },
    ],
  },
  {
    id: 'tpl-liability',
    label: '责任与赔偿',
    description: '责任上限及免责边界存在解释空间',
    type: 'risk',
    riskLevel: 'medium',
    content: '因乙方违约导致的直接损失，应在责任上限内予以赔偿。',
    satellites: [
      { label: '责任上限', content: '赔偿上限以合同总价为基准。' },
      { label: '免责条款', content: '不可抗力导致损失可部分免责。' },
    ],
  },
  {
    id: 'tpl-termination',
    label: '单方解除权',
    description: '触发条件不明确，存在高争议和高风险',
    type: 'risk',
    riskLevel: 'high',
    content: '一方可在认定重大违约时单方解除合同，但未定义量化标准。',
    satellites: [
      { label: '通知期限', content: '解除前应至少提前 7 日发出书面通知。' },
      {
        label: '损失结算',
        content: '解除后双方应在 15 日内完成费用结算。',
        details: [{ label: '结算口径', content: '按已完成里程碑及可验收成果进行结算。' }],
      },
    ],
  },
];

const distance = (a: GraphNode, b: GraphNode): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const useGalaxyEngine = (width: number, height: number) => {
  const rootNode = useMemo<GraphNode>(
    () => ({
      id: 'root',
      label: '主合同',
      type: 'root',
      color: '#cbd5e1',
      x: width / 2,
      y: height / 2,
      vx: 0,
      vy: 0,
      r: 30,
      content: '合同结构中心节点',
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

      const repulsion = 5200;
      const damping = 0.88;
      const centerPull = 0.006;
      const rootSpring = 0.02;
      const smartSpring = 0.06;
      const childSpring = 0.12;
      const detailSpring = 0.14;
      const rootLen = 170;
      const smartLen = 140;
      const childLen = 62;
      const detailLen = 38;

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
          if (d > 320) continue;
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
  const focusedNodeIds = useMemo(() => {
    if (!selectedNodeId) return null;
    const related = new Set<string>();
    const queue: string[] = [selectedNodeId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || related.has(current)) continue;
      related.add(current);
      links.forEach((link) => {
        if (link.source === current && !related.has(link.target)) {
          queue.push(link.target);
        }
      });
    }
    return related;
  }, [links, selectedNodeId]);

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
    <div className="flex h-full w-full overflow-hidden border border-indigo-400/20 bg-slate-950 shadow-[0_20px_80px_rgba(15,23,42,0.75)]">
      <div className="relative flex-1 bg-[radial-gradient(circle_at_20%_20%,#1e1b4b_0%,#0f172a_40%,#020617_100%)]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(148,163,184,0.28)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.28)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(circle_at_10%_15%,rgba(99,102,241,0.45),transparent_30%),radial-gradient(circle_at_88%_18%,rgba(56,189,248,0.28),transparent_25%),radial-gradient(circle_at_55%_82%,rgba(244,114,182,0.2),transparent_35%)]" />
        <div className="pointer-events-none absolute inset-0">
          {STAR_POINTS.map((star, idx) => (
            <motion.span
              key={`${star.x}-${star.y}`}
              className="absolute rounded-full bg-white/90"
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
              }}
              animate={{ opacity: [0.25, 0.8, 0.25], scale: [1, 1.18, 1] }}
              transition={{
                duration: 2.4 + (idx % 5) * 0.45,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: (idx % 7) * 0.22,
              }}
            />
          ))}
        </div>
        <motion.div
          className="pointer-events-none absolute -left-24 top-20 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl"
          animate={{ x: [0, 20, 0], y: [0, -12, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="pointer-events-none absolute bottom-14 right-10 h-52 w-52 rounded-full bg-cyan-400/20 blur-3xl"
          animate={{ x: [0, -16, 0], y: [0, 10, 0] }}
          transition={{ duration: 8.5, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="absolute left-4 top-4 z-10 rounded-lg border border-white/15 bg-slate-900/55 px-3 py-2 text-xs text-slate-200 backdrop-blur-md">
          拖拽右侧节点到主编辑区，系统会自动创建关联关系
        </div>
        <div className="absolute right-4 top-4 z-10 rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-medium text-cyan-100 backdrop-blur-md">
          UIST Demo Visual Build
        </div>
        <div
          ref={trashRef}
          className={`absolute bottom-20 left-4 z-20 w-52 rounded-xl border border-dashed p-3 text-center transition ${
            isOverTrash
              ? 'border-red-400 bg-red-500/20 text-red-100 shadow-[0_0_24px_rgba(248,113,113,0.35)]'
              : draggingNodeId
                ? 'border-red-400/70 bg-red-500/10 text-red-200'
                : 'border-white/25 bg-slate-900/55 text-slate-300'
          }`}
        >
          <div className="flex items-center justify-center gap-2 text-xs font-semibold">
            <Trash2 size={14} />
            拖拽到此
          </div>
          <p className="mt-1 text-[11px] opacity-80">子条例删除 / 主条款取消引用</p>
        </div>
        <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-white/15 bg-slate-900/55 px-3 py-2 text-[11px] text-slate-200 backdrop-blur-md">
          <div className="mb-1 font-semibold text-slate-100">风险色阶</div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getRiskColor('none') }} />
            无风险
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getRiskColor('low') }} />
            低风险
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getRiskColor('medium') }} />
            中风险
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getRiskColor('high') }} />
            高风险
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
          className="h-full w-full cursor-crosshair"
        >
          <defs>
            <marker id="auto-arrow" markerWidth="10" markerHeight="10" refX="20" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" fill="#94a3b8" />
            </marker>
            <filter id="node-glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
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
            const isFocused = !selectedNodeId || Boolean(focusedNodeIds?.has(link.source));
            const flowColor = child || detail ? target.color : smart ? target.color : '#64748b';
            return (
              <g key={`${link.source}-${link.target}-${link.type}`}>
                <motion.line
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: 1,
                    opacity: isFocused ? (detail ? 0.5 : child ? 0.6 : smart ? 0.45 : 0.3) : 0.08,
                  }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={child || detail ? target.color : smart ? target.color : '#64748b'}
                  strokeWidth={detail ? 1.1 : child ? 1.4 : smart ? 1.8 : 1.2}
                  strokeDasharray={smart ? '4 3' : child ? '2 2' : detail ? '1.5 2.5' : '0'}
                  markerEnd="url(#auto-arrow)"
                />
                {selectedNodeId && isFocused && (
                  <motion.line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={flowColor}
                    strokeWidth={detail ? 1.8 : 2.2}
                    strokeLinecap="round"
                    strokeDasharray={detail ? '5 12' : '8 14'}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: detail ? 0.75 : 0.9, strokeDashoffset: [0, -44] }}
                    transition={{
                      opacity: { duration: 0.2 },
                      strokeDashoffset: { duration: 1.1, repeat: Infinity, ease: 'linear' },
                    }}
                  />
                )}
              </g>
            );
          })}

          {nodes.map((node) => {
            const selected = node.id === selectedNodeId;
            const isRoot = node.id === 'root';
            const isSub = node.type === 'sub';
            const isLeaf = node.type === 'leaf';
            const isFocused = !focusedNodeIds || focusedNodeIds.has(node.id);
            const isDragging = node.id === draggingNodeId;
            return (
              <motion.g
                key={node.id}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{
                  x: node.x,
                  y: node.y,
                  opacity: isFocused ? 1 : 0.18,
                  scale: selected ? 1.12 : isFocused ? 1 : 0.95,
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
                style={{ filter: isFocused ? 'none' : 'saturate(0.15) brightness(0.7)' }}
              >
                {selected && (
                  <circle
                    r={node.r + 8}
                    fill="none"
                    stroke={node.color}
                    strokeOpacity={0.65}
                    strokeWidth={2}
                    filter="url(#node-glow)"
                  />
                )}
                <circle
                  r={node.r}
                  fill={isRoot ? '#ffffff' : node.color}
                  fillOpacity={isRoot ? 0.14 : isLeaf ? 0.18 : isSub ? 0.14 : 0.2}
                  stroke={isRoot ? '#cbd5e1' : node.color}
                  strokeWidth={isRoot ? 1.5 : isLeaf ? 1.1 : isSub ? 1.3 : 2}
                />
                <circle
                  r={isRoot ? 4 : isLeaf ? 1.7 : isSub ? 2 : 3}
                  fill={isRoot ? '#f8fafc' : node.color}
                  filter={selected ? 'url(#node-glow)' : undefined}
                />
                {(!isLeaf || selected) && (
                  <text
                    x={0}
                    y={node.r + 16}
                    textAnchor="middle"
                    fontSize={isLeaf ? 10 : 11}
                    fill={isRoot ? '#e2e8f0' : node.color}
                    className="pointer-events-none select-none font-semibold"
                  >
                    {isLeaf ? `·· ${node.label}` : isSub ? `· ${node.label}` : node.label}
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

      <div className="relative flex w-80 flex-col border-l border-white/10 bg-slate-900/85 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-cyan-400/8 to-transparent" />
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Link2 size={14} className="text-cyan-300" />
            节点栏
          </h3>
          <p className="mt-1 text-xs text-slate-400">拖拽节点到主编辑栏，自动生成联系</p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {availableTemplates.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(event) => handleDragStart(event, item.id)}
              className="cursor-grab rounded-xl border border-white/10 bg-slate-800/65 p-3 shadow-[0_8px_24px_rgba(2,6,23,0.4)] transition hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-slate-800/85 active:cursor-grabbing"
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
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-slate-100">{item.label}</div>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{
                        backgroundColor: `${getRiskColor(item.riskLevel)}1f`,
                        color: getRiskColor(item.riskLevel),
                      }}
                    >
                      {getRiskText(item.riskLevel)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs leading-snug text-slate-400">{item.description}</div>
                </div>
              </div>
            </div>
          ))}
          {availableTemplates.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/20 bg-slate-800/50 p-4 text-center text-xs text-slate-400">
              节点已全部添加，可点击画布节点继续编辑。
            </div>
          )}
        </div>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl border border-white/10 bg-slate-800/55 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">当前选中</p>
            {selectedNode && selectedNode.id !== 'root' ? (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-100">{selectedNode.label}</p>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{
                      backgroundColor: `${getRiskColor(selectedNode.riskLevel)}1f`,
                      color: getRiskColor(selectedNode.riskLevel),
                    }}
                  >
                    {getRiskText(selectedNode.riskLevel)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-300">{selectedNode.content}</p>
                {lastAppliedNodeId === selectedNode.id && selectedNode.riskLevel === 'none' && (
                  <p className="text-[11px] font-semibold text-emerald-300">AI 修改已生效，节点已标记为无风险状态</p>
                )}
                {aiSuggestion && (
                  <div className="mt-3 rounded-lg border border-cyan-400/25 bg-cyan-400/10 p-3">
                    <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-cyan-200">
                      <Sparkles size={12} />
                      AI建议：{aiSuggestion.title}
                    </div>
                    <p className="text-xs leading-relaxed text-cyan-100/90">{aiSuggestion.reason}</p>
                    <div className="mt-2 rounded border border-white/10 bg-slate-900/70 p-2 text-xs leading-relaxed text-slate-200">
                      {aiSuggestion.replacement}
                    </div>
                    <button
                      className="mt-2 w-full rounded bg-cyan-500 px-2 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400"
                      onClick={() => {
                        markNodeAsMitigated(selectedNode.id, aiSuggestion.replacement);
                        setLastAppliedNodeId(selectedNode.id);
                      }}
                    >
                      一键替换为AI建议
                    </button>
                    {lastAppliedNodeId === selectedNode.id && (
                      <p className="mt-1 text-center text-[11px] text-emerald-300">已替换为 AI 建议文本</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">点击画布中的条款节点查看详情</p>
            )}
          </div>
          <button
            onClick={handleExportContract}
            disabled={exportState === 'exporting'}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-700/70 disabled:text-slate-200"
          >
            <Download size={14} />
            {exportState === 'exporting' ? '导出中...' : '导出合同'}
          </button>
          {exportState === 'success' && (
            <p className="mt-1 text-center text-[11px] text-emerald-300">导出成功，已同步当前修改（Demo）</p>
          )}
        </div>
      </div>
    </div>
  );
}
