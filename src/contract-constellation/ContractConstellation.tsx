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
import type { GraphNode } from './types';
import { getRiskColor, getAiSuggestion } from './utils';
import { getSemanticTargetXMap } from './semanticEmbedding';
import { useGalaxyEngine } from './useGalaxyEngine';

const FALLBACK_X_BY_RISK = {
  none: 0.24,
  low: 0.42,
  medium: 0.62,
  high: 0.8,
} as const;

export default function ContractConstellation() {
  const width = CANVAS_WIDTH;
  const height = CANVAS_HEIGHT;
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
  const [semanticBiasStrength, setSemanticBiasStrength] = useState(0);
  const [riskBiasStrength, setRiskBiasStrength] = useState(0);
  const [semanticTargetXById, setSemanticTargetXById] = useState<Record<string, number>>({});
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const exportTimerRef = useRef<number | null>(null);

  const {
    nodes,
    links,
    addNodeFromTemplate,
    markNodeAsMitigated,
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
        })),
    [nodes],
  );
  const semanticSignature = useMemo(
    () =>
      semanticNodes
        .map((node) => `${node.id}::${node.label}::${node.content}::${node.riskLevel}`)
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
    [draggingNodeId, nodes, removeNodeCascade, selectedNodeId, setDraggingNode],
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
    (nodeId: string, replacement: string) => {
      markNodeAsMitigated(nodeId, replacement);
      setLastAppliedNodeId(nodeId);
    },
    [markNodeAsMitigated],
  );

  const handleDeleteNodeAction = useCallback((nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node || node.id === 'root') return;
    removeNodeCascade(nodeId);
    if (node.templateId) {
      setUsedTemplateIds((prev) => prev.filter((id) => id !== node.templateId));
    }
    setSelectedNodeId(null);
  }, [nodes, removeNodeCascade]);

  const handleAddSupplementAction = useCallback((nodeId: string, draft?: string) => {
    addSupplementClause(nodeId, draft);
    const targetNode = nodes.find((node) => node.id === nodeId);
    if (targetNode && targetNode.id !== 'root') {
      const mergedContent = draft?.trim()
        ? `${targetNode.content} ${draft.trim()}`
        : targetNode.content;
      markNodeAsMitigated(nodeId, mergedContent);
    }
    setLastAppliedNodeId(nodeId);
  }, [addSupplementClause, markNodeAsMitigated, nodes]);

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
        <div className="pointer-events-none absolute bottom-4 left-4 z-10">
          <div
            ref={trashRef}
            className={`flex h-[96px] w-48 flex-col justify-center rounded-xl border bg-white px-3 py-2 text-center text-slate-600 shadow-sm transition ${
              isOverTrash
                ? 'border-red-300 bg-red-50/90 text-red-600'
                : draggingNodeId
                  ? 'border-red-200 bg-red-50/70 text-red-500'
                  : 'border-slate-200'
            }`}
            style={{
              borderStyle: isOverTrash || draggingNodeId ? 'solid' : 'dashed',
            }}
          >
            <div className="flex items-center justify-center gap-2 text-sm font-semibold">
              <Trash2 size={14} />
              Drop Here
            </div>
            <p className="mt-1 text-[11px] leading-tight opacity-80">Sub-clause: Delete / Main clause: Remove reference</p>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex h-[96px] flex-col justify-center gap-2">
          <div className="pointer-events-auto w-[320px] rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-[11px] text-slate-700 shadow-sm backdrop-blur-sm">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-semibold">Analysis Controls</span>
              <span className="text-slate-500">S {Math.round(semanticBiasStrength * 100)}% / R {Math.round(riskBiasStrength * 100)}%</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
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
                  className="h-1.5 w-full accent-slate-500"
                />
              </div>
              <div>
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
                  className="h-1.5 w-full accent-rose-500"
                />
              </div>
            </div>
          </div>
        </div>

        <GraphCanvas
          nodes={nodes}
          links={links}
          selectedNodeId={selectedNodeId}
          draggingNodeId={draggingNodeId}
          focusDepthMap={focusDepthMap}
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
        lastAppliedNodeId={lastAppliedNodeId}
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
