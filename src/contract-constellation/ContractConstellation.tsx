import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from 'react';
import { Trash2 } from 'lucide-react';
import canvasBg from '../../static/canvas_bg.png';
import sidePanelBg from '../../static/side_panel.png';
import { NODE_LIBRARY } from './constants';
import { GraphCanvas, CANVAS_WIDTH, CANVAS_HEIGHT } from './GraphCanvas';
import { SidePanel } from './SidePanel';
import type { GraphNode, NodeActionType } from './types';
import { getRiskColor, getAiSuggestion } from './utils';
import { getSemanticTargetXMap } from './semanticEmbedding';
import { useGalaxyEngine } from './useGalaxyEngine';

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

export default function ContractConstellation() {
  const width = CANVAS_WIDTH;
  const height = CANVAS_HEIGHT;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const trashRef = useRef<HTMLDivElement | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDragOverCanvas, setIsDragOverCanvas] = useState(false);
  const [usedTemplateIds, setUsedTemplateIds] = useState<string[]>([]);
  const [lastAppliedAction, setLastAppliedAction] = useState<{ nodeId: string; actionId: string; actionType: NodeActionType } | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isOverTrash, setIsOverTrash] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'success'>('idle');
  const [revealStage, setRevealStage] = useState<1 | 2>(2);
  const [semanticBiasStrength, setSemanticBiasStrength] = useState(0);
  const [riskBiasStrength, setRiskBiasStrength] = useState(0);
  const [timeBiasStrength, setTimeBiasStrength] = useState(0);
  const [semanticTargetXById, setSemanticTargetXById] = useState<Record<string, number>>({});
  const [timeTargetXById, setTimeTargetXById] = useState<Record<string, number>>({});
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const exportTimerRef = useRef<number | null>(null);

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

  const removeNodeByUserAction = useCallback((nodeId: string) => {
    const targetNode = nodes.find((node) => node.id === nodeId);
    if (!targetNode || targetNode.id === 'root') return;
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
  }, [nodes, removeNodeCascade, selectedNodeId]);

  const endNodeDrag = useCallback(
    (shouldDelete: boolean) => {
      if (!draggingNodeId) return;
      if (shouldDelete) {
        removeNodeByUserAction(draggingNodeId);
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

  const handleApplySuggestion = useCallback(
    (nodeId: string, actionId: string, replacement: string) => {
      const didComplete = completeNodeAction(nodeId, actionId, replacement);
      if (didComplete) {
        setLastAppliedAction({ nodeId, actionId, actionType: 'revise' });
      }
    },
    [completeNodeAction],
  );

  const handleDeleteNodeAction = useCallback((nodeId: string, actionId: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node || node.id === 'root') return;
    removeNodeCascade(nodeId);
    if (node.templateId) {
      setUsedTemplateIds((prev) => prev.filter((id) => id !== node.templateId));
    }
    setSelectedNodeId(null);
    setLastAppliedAction({ nodeId, actionId, actionType: 'delete' });
  }, [nodes, removeNodeCascade]);

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
      }
    }
  }, [addSupplementClause, completeNodeAction, nodes]);
  const deletableSelectedNode = selectedNode && selectedNode.id !== 'root' ? selectedNode : null;
  const handleDeleteSelectedNode = useCallback(() => {
    if (!deletableSelectedNode) return;
    removeNodeByUserAction(deletableSelectedNode.id);
  }, [deletableSelectedNode, removeNodeByUserAction]);

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
                  onChange={(event) => setSemanticBiasStrength(Number(event.target.value))}
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
                  onChange={(event) => setRiskBiasStrength(Number(event.target.value))}
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
                  onChange={(event) => setTimeBiasStrength(Number(event.target.value))}
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
          onSelectNode={setSelectedNodeId}
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
        onDragStart={handleDragStart}
        onReviseNode={handleApplySuggestion}
        onDeleteNode={handleDeleteNodeAction}
        onAddSupplement={handleAddSupplementAction}
        onExport={handleExportContract}
      />
    </div>
  );
}
