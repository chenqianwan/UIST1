import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent,
} from 'react';
import { Trash2 } from 'lucide-react';
import canvasBg from '../../static/canvas_bg.png';
import sidePanelBg from '../../static/side_panel.png';
import { NODE_LIBRARY } from './constants';
import { GraphCanvas, CANVAS_WIDTH, CANVAS_HEIGHT } from './GraphCanvas';
import { SidePanel } from './SidePanel';
import type { GraphNode, GraphLink, NodeActionType } from './types';
import type { NodeActionItem } from './types';
import { getRiskColor, getAiSuggestion } from './utils';
import { getSemanticTargetXMap } from './semanticEmbedding';
import { useGalaxyEngine } from './useGalaxyEngine';
import { useMonitoring } from '../monitoring/useMonitoring';

const FALLBACK_X_BY_RISK = {
  none: 0.24,
  low: 0.42,
  medium: 0.62,
  high: 0.8,
} as const;

const TIME_LANE_X_BY_PHASE = {
  pre_sign: 0.14,
  effective: 0.28,
  execution: 0.44,
  acceptance: 0.6,
  termination: 0.76,
  post_termination: 0.88,
} as const;

const RISK_RANK = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
} as const;

const SIDE_PANEL_WIDTH = 320;
const CONTROLS_PANEL_WIDTH = 470;
const CONTROLS_PANEL_HEIGHT = 96;
const TRASH_ZONE_WIDTH = 192;
const TRASH_ZONE_HEIGHT = 96;
const TRASH_ZONE_LEFT = 16;
const TRASH_ZONE_BOTTOM = 16;
const HOVER_SAMPLE_INTERVAL_MS = 320;
const HOVER_HEAT_WEIGHT = 0.12;
const SLIDER_SAMPLE_INTERVAL_MS = 220;
const SLIDER_HEAT_WEIGHT = 0.4;
const MODIFY_SAMPLE_INTERVAL_MS = 220;
const MODIFY_HEAT_WEIGHT = 0.45;

/** Structural links only (child-link, detail-link); exclude reference-link. */
function getStructuralChildrenBySource(links: GraphLink[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  links.forEach((link) => {
    if (link.type === 'reference-link') return;
    const list = map.get(link.source) ?? [];
    list.push(link.target);
    map.set(link.source, list);
  });
  return map;
}

/** DFS order of node ids in subtree (structural links only). Parent deleted => skip that branch. */
function getSubtreeDfsOrder(seedNodeId: string, childrenBySource: Map<string, string[]>): string[] {
  const order: string[] = [];
  function dfs(id: string) {
    order.push(id);
    const children = childrenBySource.get(id);
    if (!children) return;
    children.forEach((c) => dfs(c));
  }
  dfs(seedNodeId);
  return order;
}

/** All descendant ids for a node (structural links only). */
function getDescendantIds(nodeId: string, childrenBySource: Map<string, string[]>): Set<string> {
  const set = new Set<string>();
  function dfs(id: string) {
    const children = childrenBySource.get(id);
    if (!children) return;
    children.forEach((c) => {
      set.add(c);
      dfs(c);
    });
  }
  dfs(nodeId);
  return set;
}

export default function ContractConstellation() {
  const width = CANVAS_WIDTH;
  const height = CANVAS_HEIGHT;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const trashRef = useRef<HTMLDivElement | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDragOverCanvas, setIsDragOverCanvas] = useState(false);
  const [usedTemplateIds, setUsedTemplateIds] = useState<string[]>([]);
  const [lastAppliedAction, setLastAppliedAction] = useState<{ nodeId: string; actionId: string; actionType: NodeActionType } | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isOverTrash, setIsOverTrash] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'success'>('idle');
  const [isBulkApplying, setIsBulkApplying] = useState(false);
  const [bulkApplyDoneCount, setBulkApplyDoneCount] = useState<number | null>(null);
  const bulkApplyDoneTimerRef = useRef<number | null>(null);
  const [revealStage, setRevealStage] = useState<1 | 2>(2);
  const [semanticBiasStrength, setSemanticBiasStrength] = useState(0);
  const [riskBiasStrength, setRiskBiasStrength] = useState(0);
  const [timeBiasStrength, setTimeBiasStrength] = useState(0);
  const [semanticTargetXById, setSemanticTargetXById] = useState<Record<string, number>>({});
  const [timeTargetXById, setTimeTargetXById] = useState<Record<string, number>>({});
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const exportTimerRef = useRef<number | null>(null);
  const hoverSampleAtRef = useRef<number>(0);
  const sliderSampleAtRef = useRef<number>(0);
  const modifySampleAtRef = useRef<number>(0);
  const { track } = useMonitoring('main', true);
  const layoutWidth = width + SIDE_PANEL_WIDTH;
  const layoutHeight = height;
  const trashCenterX = TRASH_ZONE_LEFT + TRASH_ZONE_WIDTH / 2;
  const trashCenterY = height - TRASH_ZONE_BOTTOM - TRASH_ZONE_HEIGHT / 2;

  const getCanvasPointFromClient = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * width;
    const y = ((clientY - rect.top) / rect.height) * height;
    return {
      x: Math.max(0, Math.min(width, x)),
      y: Math.max(0, Math.min(height, y)),
    };
  }, [height, width]);
  const getLayoutPointFromClient = useCallback((clientX: number, clientY: number) => {
    if (!rootRef.current) return null;
    const rect = rootRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * layoutWidth;
    const y = ((clientY - rect.top) / rect.height) * layoutHeight;
    return {
      x: Math.max(0, Math.min(layoutWidth, x)),
      y: Math.max(0, Math.min(layoutHeight, y)),
    };
  }, [layoutHeight, layoutWidth]);

  const {
    nodes,
    links,
    addNodeFromTemplate,
    completeNodeAction,
    updateNodePosition,
    removeNodeCascade,
    addSupplementClause,
    setDraggingNode,
  } = useGalaxyEngine(
    width,
    height,
    semanticBiasStrength,
    semanticTargetXById,
    riskBiasStrength,
    timeBiasStrength,
    timeTargetXById,
  );

  const availableTemplates = useMemo(
    () => NODE_LIBRARY.filter((item) => !usedTemplateIds.includes(item.id)),
    [usedTemplateIds],
  );

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const bulkApplySummary = useMemo(() => {
    if (!selectedNodeId || !selectedNode || selectedNode.id === 'root') return null;
    const childrenBySource = getStructuralChildrenBySource(links);
    const subtreeIds = getSubtreeDfsOrder(selectedNodeId, childrenBySource);
    let revise = 0;
    let addClause = 0;
    let del = 0;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    subtreeIds.forEach((id) => {
      const node = nodeMap.get(id);
      if (!node?.actions) return;
      node.actions.forEach((a) => {
        if (a.status === 'completed') return;
        if (a.type === 'revise') revise += 1;
        else if (a.type === 'add_clause') addClause += 1;
        else if (a.type === 'delete') del += 1;
      });
    });
    const total = revise + addClause + del;
    if (total === 0) return null;
    return { nodeCount: subtreeIds.length, revise, addClause, delete: del, total };
  }, [links, nodes, selectedNode, selectedNodeId]);

  const aiSuggestion = useMemo(
    () => (selectedNode && selectedNode.id !== 'root' ? getAiSuggestion(selectedNode) : null),
    [selectedNode],
  );
  const semanticNodes = useMemo(
    () =>
      nodes
        .filter((node) => node.id !== 'root')
        .map((node) => ({
          id: node.id,
          label: node.label,
          content: node.content,
          riskLevel: node.riskLevel,
          timePhase: node.timePhase,
        })),
    [nodes],
  );
  const semanticSignature = useMemo(
    () =>
      semanticNodes
        .map((node) => `${node.id}::${node.label}::${node.content}::${node.riskLevel}::${node.timePhase}`)
        .join('|'),
    [semanticNodes],
  );
  const semanticNodesForEmbedding = useMemo(() => semanticNodes, [semanticSignature]);
  const fallbackSemanticTargetXById = useMemo(() => {
    const map: Record<string, number> = {};
    semanticNodesForEmbedding.forEach((node) => {
      map[node.id] = FALLBACK_X_BY_RISK[node.riskLevel];
    });
    return map;
  }, [semanticNodesForEmbedding]);
  const fallbackTimeTargetXById = useMemo(() => {
    const map: Record<string, number> = {};
    nodes
      .filter((node) => node.id !== 'root')
      .forEach((node) => {
        map[node.id] = TIME_LANE_X_BY_PHASE[node.timePhase];
      });
    return map;
  }, [nodes]);

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
        if (link.type === 'reference-link') return;
        if (link.source === current && !depthMap.has(link.target)) {
          queue.push(link.target);
          queueDepth.push(currentDepth + 1);
        }
      });
    }
    return depthMap;
  }, [links, selectedNodeId]);

  const pathMaxRiskByNode = useMemo(() => {
    const nodeRiskById = new Map(nodes.map((node) => [node.id, node.riskLevel]));
    const maxRiskMap = new Map<string, GraphNode['riskLevel']>();
    nodes.forEach((node) => {
      maxRiskMap.set(node.id, node.riskLevel);
    });

    const structuralLinks = links.filter((link) => link.type !== 'reference-link');
    const outgoingBySource = new Map<string, string[]>();
    structuralLinks.forEach((link) => {
      const list = outgoingBySource.get(link.source) ?? [];
      list.push(link.target);
      outgoingBySource.set(link.source, list);
    });

    const queue = Array.from(outgoingBySource.keys());
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      const currentMaxRisk = maxRiskMap.get(current) ?? nodeRiskById.get(current) ?? 'none';
      const targets = outgoingBySource.get(current) ?? [];
      targets.forEach((targetId) => {
        const targetCurrent = maxRiskMap.get(targetId) ?? nodeRiskById.get(targetId) ?? 'none';
        const nextMaxRisk = RISK_RANK[currentMaxRisk] > RISK_RANK[targetCurrent] ? currentMaxRisk : targetCurrent;
        if (RISK_RANK[nextMaxRisk] > RISK_RANK[targetCurrent]) {
          maxRiskMap.set(targetId, nextMaxRisk);
          queue.push(targetId);
        }
      });
    }
    return maxRiskMap;
  }, [links, nodes]);

  const incomingNodeIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    return new Set(
      links.filter((link) => link.target === selectedNodeId && link.source !== selectedNodeId).map((link) => link.source),
    );
  }, [links, selectedNodeId]);
  const aggregationStrength = useMemo(
    () => Math.max(semanticBiasStrength, riskBiasStrength, timeBiasStrength),
    [semanticBiasStrength, riskBiasStrength, timeBiasStrength],
  );

  useEffect(() => {
    if (!selectedNodeId) {
      setRevealStage(2);
      return;
    }
    setRevealStage(1);
    const timer = window.setTimeout(() => setRevealStage(2), 260);
    return () => window.clearTimeout(timer);
  }, [selectedNodeId]);

  useEffect(() => {
    if (semanticNodesForEmbedding.length === 0) {
      setSemanticTargetXById({});
      return;
    }
    let active = true;
    void getSemanticTargetXMap(semanticNodesForEmbedding)
      .then((targetMap) => {
        if (!active) return;
        if (Object.keys(targetMap).length > 0) {
          setSemanticTargetXById(targetMap);
        } else {
          setSemanticTargetXById(fallbackSemanticTargetXById);
        }
      })
      .catch((error) => {
        if (!active) return;
        console.warn('[Semantic] Built-in semantic grouping failed, fallback to risk lanes.', error);
        setSemanticTargetXById(fallbackSemanticTargetXById);
      });
    return () => {
      active = false;
    };
  }, [semanticNodesForEmbedding, fallbackSemanticTargetXById]);

  useEffect(() => {
    setTimeTargetXById(fallbackTimeTargetXById);
  }, [fallbackTimeTargetXById]);

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
    track('template_added', {
      componentId: 'canvas',
      payload: {
        template_id: template.id,
        x: Math.round(x),
        y: Math.round(y),
        canvas_w: width,
        canvas_h: height,
        layout_w: layoutWidth,
        layout_h: layoutHeight,
      },
    });
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

  const removeNodeByUserAction = useCallback((nodeId: string, source: 'drop_zone' | 'click_zone' | 'action_delete') => {
    const targetNode = nodes.find((node) => node.id === nodeId);
    if (!targetNode || targetNode.id === 'root') return;
    const basePayload: Record<string, string | number> = {
      node_type: targetNode.type,
      risk_level: targetNode.riskLevel,
      layout_w: layoutWidth,
      layout_h: layoutHeight,
      canvas_w: width,
      canvas_h: height,
    };
    if (source === 'drop_zone' || source === 'click_zone') {
      basePayload.x = Math.round(trashCenterX);
      basePayload.y = Math.round(trashCenterY);
    }
    track('node_deleted', {
      componentId: source,
      nodeId,
      payload: basePayload,
    });
    if (targetNode.type === 'sub') {
      removeNodeCascade(nodeId);
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
      return;
    }
    removeNodeCascade(nodeId);
    if (targetNode.templateId) {
      setUsedTemplateIds((prev) => prev.filter((id) => id !== targetNode.templateId));
    }
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [height, layoutHeight, layoutWidth, nodes, removeNodeCascade, selectedNodeId, track, trashCenterX, trashCenterY, width]);

  const endNodeDrag = useCallback(
    (shouldDelete: boolean) => {
      if (!draggingNodeId) return;
      if (shouldDelete) {
        removeNodeByUserAction(draggingNodeId, 'drop_zone');
      }
      setDraggingNodeId(null);
      setDraggingNode(null);
      setIsOverTrash(false);
    },
    [draggingNodeId, removeNodeByUserAction, setDraggingNode],
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
    if (draggingNodeId) return;
    updateDraggingByClient(event.clientX, event.clientY);
  };

  useEffect(() => {
    if (!draggingNodeId) return;
    const onWindowPointerMove = (event: globalThis.PointerEvent) => {
      updateDraggingByClient(event.clientX, event.clientY);
    };
    const onWindowPointerUp = (event: globalThis.PointerEvent) => {
      const shouldDelete = updateDraggingByClient(event.clientX, event.clientY);
      endNodeDrag(Boolean(shouldDelete));
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
    endNodeDrag(Boolean(shouldDelete));
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
          timePhase: node.timePhase,
          content: node.content,
          parentId: node.parentId ?? null,
        })),
      links,
    };
    exportTimerRef.current = window.setTimeout(() => {
      console.info('[Demo] Contract exported successfully', exportPayload);
      setExportState('success');
      track('export_success', {
        componentId: 'side_panel_export',
        payload: {
          clause_count: exportPayload.clauses.length,
          link_count: exportPayload.links.length,
          x: width + SIDE_PANEL_WIDTH / 2,
          y: height - 34,
          layout_w: layoutWidth,
          layout_h: layoutHeight,
        },
      });
      exportTimerRef.current = window.setTimeout(() => {
        setExportState('idle');
      }, 2200);
    }, 900);
  }, [exportState, height, layoutHeight, layoutWidth, links, nodes, track, width]);

  useEffect(() => {
    return () => {
      if (exportTimerRef.current) window.clearTimeout(exportTimerRef.current);
      if (bulkApplyDoneTimerRef.current != null) window.clearTimeout(bulkApplyDoneTimerRef.current);
    };
  }, []);

  const handleApplySuggestion = useCallback(
    (nodeId: string, actionId: string, replacement: string) => {
      const didComplete = completeNodeAction(nodeId, actionId, replacement);
      if (didComplete) {
        setLastAppliedAction({ nodeId, actionId, actionType: 'revise' });
        track('action_executed', {
          componentId: 'side_panel_action',
          nodeId,
          payload: {
            action_id: actionId,
            action_type: 'revise',
            x: width + SIDE_PANEL_WIDTH / 2,
            y: height * 0.66,
            layout_w: layoutWidth,
            layout_h: layoutHeight,
          },
        });
      }
    },
    [completeNodeAction, height, layoutHeight, layoutWidth, track, width],
  );

  const handleDeleteNodeAction = useCallback((nodeId: string, actionId: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node || node.id === 'root') return;
    removeNodeByUserAction(nodeId, 'action_delete');
    setSelectedNodeId(null);
    setLastAppliedAction({ nodeId, actionId, actionType: 'delete' });
    track('action_executed', {
      componentId: 'side_panel_action',
      nodeId,
      payload: {
        action_id: actionId,
        action_type: 'delete',
        x: width + SIDE_PANEL_WIDTH / 2,
        y: height * 0.66,
        layout_w: layoutWidth,
        layout_h: layoutHeight,
      },
    });
  }, [height, layoutHeight, layoutWidth, nodes, removeNodeByUserAction, track, width]);

  const handleAddSupplementAction = useCallback((nodeId: string, actionId: string, draft?: string) => {
    addSupplementClause(nodeId, draft);
    const targetNode = nodes.find((node) => node.id === nodeId);
    if (targetNode && targetNode.id !== 'root') {
      const mergedContent = draft?.trim()
        ? `${targetNode.content} ${draft.trim()}`
        : targetNode.content;
      const didComplete = completeNodeAction(nodeId, actionId, mergedContent);
      if (didComplete) {
        setLastAppliedAction({ nodeId, actionId, actionType: 'add_clause' });
        track('action_executed', {
          componentId: 'side_panel_action',
          nodeId,
          payload: {
            action_id: actionId,
            action_type: 'add_clause',
            x: width + SIDE_PANEL_WIDTH / 2,
            y: height * 0.66,
            layout_w: layoutWidth,
            layout_h: layoutHeight,
          },
        });
      }
    }
  }, [addSupplementClause, completeNodeAction, height, layoutHeight, layoutWidth, nodes, track, width]);

  type BulkTask = { nodeId: string; action: NodeActionItem; node: GraphNode };
  const handleBulkApply = useCallback(() => {
    if (!selectedNodeId || !selectedNode || selectedNode.id === 'root') return;
    const childrenBySource = getStructuralChildrenBySource(links);
    const subtreeIds = getSubtreeDfsOrder(selectedNodeId, childrenBySource);
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const revises: BulkTask[] = [];
    const addClauses: BulkTask[] = [];
    const deletes: BulkTask[] = [];
    subtreeIds.forEach((nodeId) => {
      const node = nodeMap.get(nodeId);
      if (!node || !node.actions) return;
      const pending = node.actions.filter((a) => a.status !== 'completed');
      const hasDelete = pending.some((a) => a.type === 'delete');
      pending.forEach((action) => {
        const task: BulkTask = { nodeId, action, node };
        if (action.type === 'delete') deletes.push(task);
        else if (!hasDelete) {
          if (action.type === 'revise') revises.push(task);
          else if (action.type === 'add_clause') addClauses.push(task);
        }
      });
    });
    const totalTasks = revises.length + addClauses.length + deletes.length;
    if (totalTasks === 0) return;
    const message = `将递归执行：${subtreeIds.length} 个节点，共 ${totalTasks} 项操作（先删除 ${deletes.length}，再修订 ${revises.length}、补充 ${addClauses.length}）。确认执行？`;
    if (!window.confirm(message)) return;
    setIsBulkApplying(true);
    const removedIds = new Set<string>();
    const run = () => {
      const applyRevise = (t: BulkTask) => {
        if (removedIds.has(t.nodeId)) return;
        completeNodeAction(t.nodeId, t.action.id, t.action.suggestionText ?? t.node.content);
      };
      const applyAddClause = (t: BulkTask) => {
        if (removedIds.has(t.nodeId)) return;
        addSupplementClause(t.nodeId, t.action.supplementDraft);
        const merged = t.action.supplementDraft?.trim()
          ? `${t.node.content} ${t.action.supplementDraft.trim()}`
          : t.node.content;
        completeNodeAction(t.nodeId, t.action.id, merged);
      };
      const applyDelete = (t: BulkTask) => {
        if (removedIds.has(t.nodeId)) return;
        const desc = getDescendantIds(t.nodeId, childrenBySource);
        removedIds.add(t.nodeId);
        desc.forEach((id) => removedIds.add(id));
        removeNodeCascade(t.nodeId);
      };
      deletes.forEach(applyDelete);
      revises.forEach(applyRevise);
      addClauses.forEach(applyAddClause);
      if (removedIds.has(selectedNodeId)) setSelectedNodeId(null);
      setLastAppliedAction(null);
      track('action_executed', {
        componentId: 'side_panel_action',
        nodeId: selectedNodeId,
        payload: {
          source: 'modify_bulk_apply',
          node_count: subtreeIds.length,
          revise_count: revises.length,
          add_clause_count: addClauses.length,
          delete_count: deletes.length,
          x: width + SIDE_PANEL_WIDTH / 2,
          y: height * 0.66,
          layout_w: layoutWidth,
          layout_h: layoutHeight,
        },
      });
      setIsBulkApplying(false);
      setBulkApplyDoneCount(totalTasks);
      if (bulkApplyDoneTimerRef.current != null) window.clearTimeout(bulkApplyDoneTimerRef.current);
      bulkApplyDoneTimerRef.current = window.setTimeout(() => {
        setBulkApplyDoneCount(null);
        bulkApplyDoneTimerRef.current = null;
      }, 2500);
    };
    run();
  }, [
    links,
    nodes,
    selectedNode,
    selectedNodeId,
    completeNodeAction,
    addSupplementClause,
    removeNodeCascade,
    track,
    width,
    height,
    layoutWidth,
    layoutHeight,
  ]);

  const deletableSelectedNode = selectedNode && selectedNode.id !== 'root' ? selectedNode : null;
  const handleDeleteSelectedNode = useCallback(() => {
    if (!deletableSelectedNode) return;
    removeNodeByUserAction(deletableSelectedNode.id, 'click_zone');
  }, [deletableSelectedNode, removeNodeByUserAction]);

  const handleSelectNode = useCallback((
    nodeId: string | null,
    meta?: { clientX: number; clientY: number; source: 'canvas_click' | 'node_click' },
  ) => {
    setSelectedNodeId(nodeId);
    const canvasPoint = meta ? getCanvasPointFromClient(meta.clientX, meta.clientY) : null;
    if (canvasPoint) {
      track('canvas_interaction', {
        componentId: 'canvas',
        nodeId: nodeId ?? undefined,
        payload: {
          x: Math.round(canvasPoint.x),
          y: Math.round(canvasPoint.y),
          source: meta?.source ?? 'canvas_click',
          canvas_w: width,
          canvas_h: height,
          layout_w: layoutWidth,
          layout_h: layoutHeight,
        },
      });
    }
    if (nodeId) {
      const selected = nodes.find((node) => node.id === nodeId);
      track('node_selected', {
        componentId: 'canvas',
        nodeId,
        payload: selected
          ? {
            x: Math.round(selected.x),
            y: Math.round(selected.y),
            canvas_w: width,
            canvas_h: height,
            layout_w: layoutWidth,
            layout_h: layoutHeight,
          }
          : undefined,
      });
    }
  }, [getCanvasPointFromClient, height, layoutHeight, layoutWidth, nodes, track, width]);

  const trackDimensionPanelInteraction = useCallback(
    (
      source: 'semantic_pull' | 'risk_pull' | 'time_pull',
      sliderIndex: 0 | 1 | 2,
      value: number,
      force = false,
    ) => {
      const now = Date.now();
      if (!force && now - sliderSampleAtRef.current < SLIDER_SAMPLE_INTERVAL_MS) return;
      sliderSampleAtRef.current = now;
      const panelLeft = width - 16 - CONTROLS_PANEL_WIDTH;
      const panelCenterY = height - 16 - CONTROLS_PANEL_HEIGHT / 2;
      const sliderCenterX = panelLeft + CONTROLS_PANEL_WIDTH * ((sliderIndex * 2 + 1) / 6);
      track('canvas_interaction', {
        componentId: 'analysis_controls',
        payload: {
          x: Math.round(sliderCenterX),
          y: Math.round(panelCenterY),
          source,
          value: Number(value.toFixed(2)),
          heat_weight: SLIDER_HEAT_WEIGHT,
          canvas_w: width,
          canvas_h: height,
          layout_w: layoutWidth,
          layout_h: layoutHeight,
        },
      });
    },
    [height, layoutHeight, layoutWidth, track, width],
  );

  const handleSemanticBiasChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setSemanticBiasStrength(value);
    trackDimensionPanelInteraction('semantic_pull', 0, value);
  }, [trackDimensionPanelInteraction]);

  const handleRiskBiasChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setRiskBiasStrength(value);
    trackDimensionPanelInteraction('risk_pull', 1, value);
  }, [trackDimensionPanelInteraction]);

  const handleTimeBiasChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setTimeBiasStrength(value);
    trackDimensionPanelInteraction('time_pull', 2, value);
  }, [trackDimensionPanelInteraction]);

  const handleSemanticBiasCommit = useCallback((event: PointerEvent<HTMLInputElement>) => {
    trackDimensionPanelInteraction('semantic_pull', 0, Number((event.target as HTMLInputElement).value), true);
  }, [trackDimensionPanelInteraction]);

  const handleRiskBiasCommit = useCallback((event: PointerEvent<HTMLInputElement>) => {
    trackDimensionPanelInteraction('risk_pull', 1, Number((event.target as HTMLInputElement).value), true);
  }, [trackDimensionPanelInteraction]);

  const handleTimeBiasCommit = useCallback((event: PointerEvent<HTMLInputElement>) => {
    trackDimensionPanelInteraction('time_pull', 2, Number((event.target as HTMLInputElement).value), true);
  }, [trackDimensionPanelInteraction]);

  const handleLayoutPointerMoveCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (draggingNodeId) return;
    const now = Date.now();
    if (now - hoverSampleAtRef.current < HOVER_SAMPLE_INTERVAL_MS) return;
    const layoutPoint = getLayoutPointFromClient(event.clientX, event.clientY);
    if (!layoutPoint) return;
    hoverSampleAtRef.current = now;
    track('canvas_interaction', {
      componentId: 'layout_hover',
      payload: {
        x: Math.round(layoutPoint.x),
        y: Math.round(layoutPoint.y),
        source: 'hover_sample',
        heat_weight: HOVER_HEAT_WEIGHT,
        layout_w: layoutWidth,
        layout_h: layoutHeight,
        canvas_w: width,
        canvas_h: height,
      },
    });
  }, [draggingNodeId, getLayoutPointFromClient, layoutHeight, layoutWidth, track, width, height]);

  const handleModifyHoverSample = useCallback(
    (meta: { clientX: number; clientY: number; ratioY: number }) => {
      const now = Date.now();
      if (now - modifySampleAtRef.current < MODIFY_SAMPLE_INTERVAL_MS) return;
      modifySampleAtRef.current = now;
      const layoutPoint = getLayoutPointFromClient(meta.clientX, meta.clientY);
      if (!layoutPoint) return;
      track('canvas_interaction', {
        componentId: 'side_panel_action',
        payload: {
          x: Math.round(layoutPoint.x),
          y: Math.round(layoutPoint.y),
          source: 'modify_hover',
          area_tag: 'modify_expanded',
          modify_ratio_y: Number(meta.ratioY.toFixed(3)),
          heat_weight: MODIFY_HEAT_WEIGHT,
          layout_w: layoutWidth,
          layout_h: layoutHeight,
          canvas_w: width,
          canvas_h: height,
        },
      });
    },
    [getLayoutPointFromClient, layoutHeight, layoutWidth, track, width, height],
  );

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full overflow-hidden border border-slate-200 bg-[#F7F9FC]"
      onPointerMoveCapture={handleLayoutPointerMoveCapture}
    >
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
        <div className="absolute right-4 top-4 z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600 shadow-sm">
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
          <div className="mt-1.5 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <svg width="28" height="8" viewBox="0 0 28 8" fill="none">
                <line x1="0" y1="4" x2="22" y2="4" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" />
                <polygon points="22,1 28,4 22,7" fill="#2563eb" />
              </svg>
              <span>Structural link</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="28" height="8" viewBox="0 0 28 8" fill="none">
                <line x1="0" y1="4" x2="22" y2="4" stroke="#334155" strokeWidth="1.8" strokeDasharray="2 5" strokeLinecap="round" />
                <polygon points="22,1 28,4 22,7" fill="#334155" />
              </svg>
              <span>Reference link</span>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-4 left-4 z-10">
          <div
            ref={trashRef}
            className={`pointer-events-auto flex h-[96px] w-48 flex-col justify-center rounded-xl border bg-white px-3 py-2 text-center shadow-sm transition ${
              isOverTrash
                ? 'cursor-pointer border-red-400 bg-red-100 text-red-700'
                : draggingNodeId
                  ? 'cursor-pointer border-red-200 bg-red-50/75 text-red-500'
                  : deletableSelectedNode
                    ? 'cursor-pointer border-red-300 bg-red-50/90 text-red-600'
                    : 'cursor-not-allowed border-slate-200 text-slate-500'
            }`}
            style={{ borderStyle: 'solid' }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleDeleteSelectedNode}
          >
            <div className="flex items-center justify-center gap-2 text-sm font-semibold">
              <Trash2 size={14} />
              Drop / Click Here
            </div>
            <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-tight opacity-80">
              {deletableSelectedNode
                ? `Delete selected node: ${deletableSelectedNode.label}`
                : 'Select a node for quick delete'}
            </p>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-4 right-4 z-10">
          <div className="pointer-events-auto flex h-[96px] w-[470px] flex-col justify-center rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-[11px] text-slate-700 shadow-sm backdrop-blur-sm">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-semibold">Analysis Controls</span>
              <span className="text-slate-500">
                S {Math.round(semanticBiasStrength * 100)}% / R {Math.round(riskBiasStrength * 100)}% / T {Math.round(timeBiasStrength * 100)}%
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border border-slate-200 bg-slate-50/65 px-2 py-1">
                <div className="mb-0.5 flex items-center justify-between text-[10px] text-slate-600">
                  <span>Semantic Pull</span>
                  <span>{Math.round(semanticBiasStrength * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={semanticBiasStrength}
                  onChange={handleSemanticBiasChange}
                  onPointerUp={handleSemanticBiasCommit}
                  className="analysis-slider analysis-slider--semantic"
                />
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50/65 px-2 py-1">
                <div className="mb-0.5 flex items-center justify-between text-[10px] text-slate-600">
                  <span>Risk Pull</span>
                  <span>{Math.round(riskBiasStrength * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={riskBiasStrength}
                  onChange={handleRiskBiasChange}
                  onPointerUp={handleRiskBiasCommit}
                  className="analysis-slider analysis-slider--risk"
                />
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50/65 px-2 py-1">
                <div className="mb-0.5 flex items-center justify-between text-[10px] text-slate-600">
                  <span>Time Pull</span>
                  <span>{Math.round(timeBiasStrength * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={timeBiasStrength}
                  onChange={handleTimeBiasChange}
                  onPointerUp={handleTimeBiasCommit}
                  className="analysis-slider analysis-slider--time"
                />
              </div>
            </div>
          </div>
        </div>

        <GraphCanvas
          nodes={nodes}
          links={links}
          aggregationStrength={aggregationStrength}
          selectedNodeId={selectedNodeId}
          draggingNodeId={draggingNodeId}
          focusDepthMap={focusDepthMap}
          pathMaxRiskByNode={pathMaxRiskByNode}
          incomingNodeIds={incomingNodeIds}
          revealStage={revealStage}
          selectedNode={selectedNode}
          svgRef={svgRef}
          onSelectNode={handleSelectNode}
          onNodePointerDown={handleNodePointerDown}
          onDrop={handleDrop}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onDragOver={(event) => {
            event.preventDefault();
            if (!isDragOverCanvas) setIsDragOverCanvas(true);
          }}
          onDragLeave={() => setIsDragOverCanvas(false)}
        />

        {isDragOverCanvas && (
          <div className="pointer-events-none absolute inset-3 rounded-xl border-2 border-dashed border-cyan-300/90 bg-cyan-300/10 backdrop-blur-sm" />
        )}
      </div>

      <SidePanel
        availableTemplates={availableTemplates}
        selectedNode={selectedNode}
        aiSuggestion={aiSuggestion}
        lastAppliedAction={lastAppliedAction}
        exportState={exportState}
        sidePanelBg={sidePanelBg}
        isBulkApplying={isBulkApplying}
        bulkApplySummary={bulkApplySummary}
        bulkApplyDoneCount={bulkApplyDoneCount}
        onDragStart={handleDragStart}
        onReviseNode={handleApplySuggestion}
        onDeleteNode={handleDeleteNodeAction}
        onAddSupplement={handleAddSupplementAction}
        onBulkApply={handleBulkApply}
        onExport={handleExportContract}
        onModifyHoverSample={handleModifyHoverSample}
      />
    </div>
  );
}
