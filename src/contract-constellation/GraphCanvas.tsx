import { useMemo, type PointerEvent } from 'react';
import { motion } from 'framer-motion';
import type { GraphLink, GraphNode } from './types';
import {
  getEdgePath,
  getRiskColor,
  getRiskText,
  getRiskNodeStrokeColor,
  getRiskNodeGradientId,
  getRiskNodeInnerStroke,
  getNodeHighlightParams,
} from './utils';

const CANVAS_WIDTH = 760;
const CANVAS_HEIGHT = 620;
const MAX_NODE_LABEL_CHARS = 30;
const PHASE_LABEL_BY_KEY: Record<GraphNode['timePhase'], string> = {
  pre_sign: 'Pre-sign Phase',
  effective: 'Effective Phase',
  execution: 'Execution Phase',
  acceptance: 'Acceptance Phase',
  termination: 'Termination Phase',
  post_termination: 'Post-termination Phase',
};
const TIME_FALLBACK_X_BY_PHASE: Record<GraphNode['timePhase'], number> = {
  pre_sign: 0.12,
  effective: 0.27,
  execution: 0.46,
  acceptance: 0.62,
  termination: 0.8,
  post_termination: 0.92,
};

function getTagWidth(label: string): number {
  return label.length * 6.2 + 16;
}

function getPartyOrientationLabel(norm?: number): string {
  if (typeof norm !== 'number') return 'Party Orientation';
  if (norm <= 0.38) return 'Party A-oriented';
  if (norm >= 0.68) return 'Party B-oriented';
  if (norm >= 0.48 && norm <= 0.58) return 'Mutual / Shared';
  return 'Party-leaning';
}

function getDisplayLabel(label: string, selected: boolean): string {
  if (selected) return label;
  const compact = label.trim();
  const numericPrefix = compact.match(/^([0-9]+(?:\.[0-9]+)*)\b/);
  if (numericPrefix) return numericPrefix[1];
  if (label.length <= MAX_NODE_LABEL_CHARS) return label;
  return label.slice(0, MAX_NODE_LABEL_CHARS);
}

interface GraphCanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
  aggregationStrength: number;
  semanticBiasStrength: number;
  riskBiasStrength: number;
  timeBiasStrength: number;
  semanticTargetNormById: Record<string, number>;
  timeTargetNormById: Record<string, number>;
  selectedNodeId: string | null;
  draggingNodeId: string | null;
  focusDepthMap: Map<string, number> | null;
  pathMaxRiskByNode: Map<string, GraphNode['riskLevel']> | null;
  incomingNodeIds: Set<string>;
  revealStage: 1 | 2;
  selectedNode: GraphNode | null;
  collapsedNodeIds: Set<string>;
  collapsibleNodeIds: Set<string>;
  zoomScale: number;
  panOffset: { x: number; y: number };
  svgRef: React.RefObject<SVGSVGElement | null>;
  onSelectNode: (
    nodeId: string | null,
    meta?: { clientX: number; clientY: number; source: 'canvas_click' | 'node_click' },
  ) => void;
  onNodePointerDown: (event: PointerEvent<SVGGElement>, node: GraphNode) => void;
  onToggleNodeCollapse: (nodeId: string) => void;
  onDrop: (event: React.DragEvent<SVGSVGElement>) => void;
  onCanvasPointerDown: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasWheel: (event: React.WheelEvent<SVGSVGElement>) => void;
  onDragOver: (event: React.DragEvent<SVGSVGElement>) => void;
  onDragLeave: () => void;
}

export function GraphCanvas({
  nodes,
  links,
  aggregationStrength,
  semanticBiasStrength,
  riskBiasStrength,
  timeBiasStrength,
  semanticTargetNormById,
  timeTargetNormById,
  selectedNodeId,
  draggingNodeId,
  focusDepthMap,
  pathMaxRiskByNode,
  incomingNodeIds,
  revealStage,
  selectedNode,
  collapsedNodeIds,
  collapsibleNodeIds,
  zoomScale,
  panOffset,
  svgRef,
  onSelectNode,
  onNodePointerDown,
  onToggleNodeCollapse,
  onDrop,
  onCanvasPointerDown,
  onPointerMove,
  onPointerUp,
  onCanvasWheel,
  onDragOver,
  onDragLeave,
}: GraphCanvasProps) {
  const width = CANVAS_WIDTH;
  const height = CANVAS_HEIGHT;
  const nodeById = useMemo(() => {
    const map = new Map<string, GraphNode>();
    nodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [nodes]);
  const clampedAggregation = Math.max(0, Math.min(1, aggregationStrength));
  const aggregationFade = 1 - 0.72 * clampedAggregation;
  const placementCue = useMemo(() => {
    if (!selectedNode || selectedNode.id === 'root') return null;
    const riskLaneX: Record<GraphNode['riskLevel'], number> = {
      none: 0.24,
      low: 0.42,
      medium: 0.62,
      high: 0.8,
    };
    const riskNorm = riskLaneX[selectedNode.riskLevel];
    const timeNorm = timeTargetNormById[selectedNode.id] ?? TIME_FALLBACK_X_BY_PHASE[selectedNode.timePhase];
    const partyNorm = semanticTargetNormById[selectedNode.id];
    const timeLabel = PHASE_LABEL_BY_KEY[selectedNode.timePhase];
    return {
      node: selectedNode,
      riskX: width * riskNorm,
      riskLabel: getRiskText(selectedNode.riskLevel),
      timeX: width * timeNorm,
      timeLabel,
      partyY: typeof partyNorm === 'number' ? height * partyNorm : null,
      partyLabel: getPartyOrientationLabel(partyNorm),
    };
  }, [height, selectedNode, semanticTargetNormById, timeTargetNormById, width]);
  const cueStrength = useMemo(
    () => ({
      risk: Math.max(0, Math.min(1, riskBiasStrength)),
      time: Math.max(0, Math.min(1, timeBiasStrength)),
      party: Math.max(0, Math.min(1, semanticBiasStrength)),
    }),
    [riskBiasStrength, semanticBiasStrength, timeBiasStrength],
  );
  const labelLayerItems = useMemo(() => {
    return nodes
      .map((node) => {
        const selected = node.id === selectedNodeId;
        const isRoot = node.id === 'root';
        const isLeaf = node.type === 'sub';
        const parentNode = node.parentId ? nodeById.get(node.parentId) : null;
        const isFirstLevelLeaf = isLeaf && parentNode?.type === 'main';
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
                ? 0.22
                : revealStage === 1 && depth > 1
                  ? 0.24
                  : depth === 1
                    ? 0.9
                    : depth === 2
                      ? 0.66
                      : 0.42;
        const nodeTone = !selectedNodeId
          ? 1
          : selected
            ? 1
            : isFocused
              ? Math.max(0.56, depthOpacity * lensFactor)
              : 0.26;
        const shouldShowLabelBase =
          !isLeaf
            ? true
            : selected || (selectedNodeId && depth !== undefined) || isIncoming || (!selectedNodeId && isFirstLevelLeaf);
        const shouldShowLabel = shouldShowLabelBase;
        if (!shouldShowLabel) return null;
        return {
          id: node.id,
          text: getDisplayLabel(node.label, selected),
          x: node.x,
          y: node.y + node.r + 16,
          fontSize: isLeaf ? 10 : 11,
          fill: isRoot ? '#374151' : '#1f2937',
          fillOpacity: Math.min(1, nodeTone + 0.08),
        };
      })
      .filter((item): item is {
        id: string;
        text: string;
        x: number;
        y: number;
        fontSize: number;
        fill: string;
        fillOpacity: number;
      } => Boolean(item));
  }, [
    clampedAggregation,
    focusDepthMap,
    incomingNodeIds,
    nodeById,
    nodes,
    revealStage,
    selectedNode,
    selectedNodeId,
  ]);
  const actionBadge = (node: GraphNode) => {
    const pending = (node.actions ?? []).filter((action) => action.status !== 'completed');
    if (pending.length === 0) return null;
    if (pending.length > 1) return { text: `${pending.length}`, fill: '#8b5cf6' };
    const actionType = pending[0].type;
    if (actionType === 'delete') return { text: 'D', fill: '#ef4444' };
    if (actionType === 'revise') return { text: 'R', fill: '#3b82f6' };
    if (actionType === 'add_clause') return { text: 'A', fill: '#10b981' };
    return null;
  };

  return (
    <svg
      ref={svgRef as React.RefObject<SVGSVGElement>}
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      onPointerDown={onCanvasPointerDown}
      onClick={(event) =>
        onSelectNode(null, { clientX: event.clientX, clientY: event.clientY, source: 'canvas_click' })
      }
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onCanvasWheel}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
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
        <marker
          id="reference-arrow"
          viewBox="0 0 10 10"
          markerWidth="7"
          markerHeight="7"
          refX="10"
          refY="5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="#334155" />
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

      <g transform={`translate(${panOffset.x} ${panOffset.y}) translate(${width / 2} ${height / 2}) scale(${zoomScale}) translate(${-width / 2} ${-height / 2})`}>
      {placementCue && (
        <g className="pointer-events-none">
          {cueStrength.risk > 0.01 && (
            <>
              <rect
                x={placementCue.riskX - 18}
                y={16}
                width={36}
                height={height - 32}
                rx={12}
                fill="#ef4444"
                fillOpacity={0.03 + cueStrength.risk * 0.1}
              />
              <line
                x1={placementCue.riskX}
                y1={16}
                x2={placementCue.riskX}
                y2={height - 16}
                stroke="#ef4444"
                strokeWidth={1.2}
                strokeOpacity={0.2 + cueStrength.risk * 0.3}
                strokeDasharray="4 8"
              />
            </>
          )}
          {cueStrength.party > 0.01 && placementCue.partyY != null && (
            <>
              <rect
                x={18}
                y={placementCue.partyY - 14}
                width={width - 36}
                height={28}
                rx={12}
                fill="#3b82f6"
                fillOpacity={0.03 + cueStrength.party * 0.08}
              />
              <line
                x1={18}
                y1={placementCue.partyY}
                x2={width - 18}
                y2={placementCue.partyY}
                stroke="#3b82f6"
                strokeWidth={1.1}
                strokeOpacity={0.16 + cueStrength.party * 0.24}
                strokeDasharray="3 7"
              />
            </>
          )}
          {cueStrength.time > 0.01 && (
            <>
              <line
                x1={70}
                y1={24}
                x2={width - 70}
                y2={24}
                stroke="#7c3aed"
                strokeWidth={1.1}
                strokeOpacity={0.2 + cueStrength.time * 0.25}
              />
              <circle
                cx={placementCue.timeX}
                cy={24}
                r={4.1}
                fill="#7c3aed"
                fillOpacity={0.32 + cueStrength.time * 0.5}
                stroke="#ffffff"
                strokeWidth={1}
              />
            </>
          )}
          <line
            x1={placementCue.node.x}
            y1={placementCue.node.y}
            x2={placementCue.timeX}
            y2={24}
            stroke="#7c3aed"
            strokeWidth={1}
            strokeOpacity={0.2 + cueStrength.time * 0.3}
            strokeDasharray="3 6"
          />
          {placementCue.partyY != null && (
            <line
              x1={placementCue.node.x}
              y1={placementCue.node.y}
              x2={placementCue.node.x}
              y2={placementCue.partyY}
              stroke="#3b82f6"
              strokeWidth={1}
              strokeOpacity={0.2 + cueStrength.party * 0.28}
              strokeDasharray="3 6"
            />
          )}
          <line
            x1={placementCue.node.x}
            y1={placementCue.node.y}
            x2={placementCue.riskX}
            y2={placementCue.node.y}
            stroke="#ef4444"
            strokeWidth={1}
            strokeOpacity={0.2 + cueStrength.risk * 0.28}
            strokeDasharray="3 6"
          />
          {(() => {
            const stackX = Math.min(width - 170, placementCue.node.x + placementCue.node.r + 14);
            const stackY = Math.max(40, placementCue.node.y - placementCue.node.r - 34);
            const riskChip = placementCue.riskLabel;
            const timeChip = placementCue.timeLabel;
            const partyChip = placementCue.partyLabel;
            const riskWidth = getTagWidth(riskChip);
            const timeWidth = getTagWidth(timeChip);
            const partyWidth = getTagWidth(partyChip);
            return (
              <g transform={`translate(${stackX}, ${stackY})`}>
                <rect x={0} y={0} width={riskWidth} height={18} rx={9} fill="#fee2e2" fillOpacity={0.88} />
                <text x={8} y={12.5} fontSize={10} fill="#991b1b" className="select-none font-semibold">
                  {riskChip}
                </text>
                <rect x={0} y={21} width={timeWidth} height={18} rx={9} fill="#ede9fe" fillOpacity={0.9} />
                <text x={8} y={33.5} fontSize={10} fill="#5b21b6" className="select-none font-semibold">
                  {timeChip}
                </text>
                <rect x={0} y={42} width={partyWidth} height={18} rx={9} fill="#dbeafe" fillOpacity={0.9} />
                <text x={8} y={54.5} fontSize={10} fill="#1d4ed8" className="select-none font-semibold">
                  {partyChip}
                </text>
              </g>
            );
          })()}
        </g>
      )}
      {links.map((link) => {
        const source = nodeById.get(link.source);
        const target = nodeById.get(link.target);
        if (!source || !target) return null;
        if (draggingNodeId && (link.source === draggingNodeId || link.target === draggingNodeId)) {
          return null;
        }
        const reference = link.type === 'reference-link';
        const child = link.type === 'child-link';
        const detail = link.type === 'detail-link';
        const sourceDepth = focusDepthMap?.get(link.source);
        const isIncomingToSelected = Boolean(selectedNodeId) && link.target === selectedNodeId && link.source !== selectedNodeId;
        const isOutgoingFromSelected = Boolean(selectedNodeId) && link.source === selectedNodeId;
        const sourceEffectiveR = source.id === 'root' ? source.r : (source.r * 227) / 256;
        const targetEffectiveR = target.id === 'root' ? target.r : (target.r * 227) / 256;
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
        const shouldRenderReference =
          !reference ||
          (Boolean(selectedNodeId) && (isIncomingToSelected || isOutgoingFromSelected));
        if (!shouldRenderReference) return null;
        const edgeCenterX = (source.x + target.x) / 2;
        const edgeCenterY = (source.y + target.y) / 2;
        const distToSelected = selectedNode
          ? Math.hypot(edgeCenterX - selectedNode.x, edgeCenterY - selectedNode.y)
          : 0;
        const lensFactor = !selectedNode ? 1 : distToSelected > 320 ? 0.65 : distToSelected > 250 ? 0.82 : 1;
        const baseOpacity =
          !shouldRevealEdge
            ? 0.08
            : reference
              ? 0.34
            : isIncomingToSelected
              ? 0.52
              : detail
                ? 0.44
                : child
                  ? 0.56
                  : 0.44;
        const minEdgeOpacity = isIncomingToSelected || isOutgoingFromSelected ? 0.22 : 0.08;
        const edgeOpacity = Math.max(minEdgeOpacity, baseOpacity * lensFactor * aggregationFade);
        const pulseLowOpacity = Math.max(0.12, 0.45 * aggregationFade);
        const pulseHighOpacity = Math.max(0.25, 0.9 * aggregationFade);
        const shouldAnimateStructuralFlow =
          Boolean(selectedNodeId) &&
          !reference &&
          shouldRevealEdge &&
          sourceDepth !== undefined &&
          !isIncomingToSelected;
        const sourceRiskStroke =
          link.type === 'root-link'
            ? '#2563eb'
            : getRiskColor(source.riskLevel);
        const propagatedRisk = pathMaxRiskByNode?.get(link.source);
        const structuralStroke =
          link.type !== 'root-link' && propagatedRisk
            ? getRiskColor(propagatedRisk)
            : sourceRiskStroke;
        return (
          <g key={`${link.source}-${link.target}-${link.type}`}>
            <motion.path
              initial={reference ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
              animate={
                reference
                  ? { opacity: edgeOpacity }
                  : {
                      pathLength: 1,
                      opacity: edgeOpacity,
                    }
              }
              transition={{ duration: 0.35, ease: 'easeOut' }}
              d={edgePath}
              stroke={
                reference
                  ? '#334155'
                  : structuralStroke
              }
              strokeWidth={
                reference
                  ? 1.8
                  : selectedNodeId && sourceDepth !== undefined && sourceDepth <= 1
                    ? 1.9
                    : 1.2
              }
              strokeDasharray={reference ? '10 8' : detail ? '2 2' : '0'}
              strokeLinecap={reference ? 'round' : 'round'}
              fill="none"
              markerEnd={reference ? 'url(#reference-arrow)' : 'url(#auto-arrow)'}
            />
            {shouldAnimateStructuralFlow && (
              <motion.path
                d={edgePath}
                stroke={structuralStroke}
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray="7 10"
                fill="none"
                animate={{ strokeDashoffset: [0, -38], opacity: [pulseLowOpacity, pulseHighOpacity, pulseLowOpacity] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
              />
            )}
          </g>
        );
      })}

      {nodes.map((node) => {
        const selected = node.id === selectedNodeId;
        const isRoot = node.id === 'root';

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
                ? 0.22
                : revealStage === 1 && depth > 1
                  ? 0.24
                  : depth === 1
                    ? 0.9
                    : depth === 2
                      ? 0.66
                      : 0.42;
        const nodeTone = !selectedNodeId
          ? 1
          : selected
            ? 1
            : isFocused
              ? Math.max(0.56, depthOpacity * lensFactor)
              : 0.26;
        const isDragging = node.id === draggingNodeId;
        const badge = actionBadge(node);
        const canCollapse = collapsibleNodeIds.has(node.id);
        const isCollapsed = collapsedNodeIds.has(node.id);

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
              x: isDragging ? { type: 'tween', duration: 0 } : { type: 'spring', stiffness: 170, damping: 18, mass: 0.7 },
              y: isDragging ? { type: 'tween', duration: 0 } : { type: 'spring', stiffness: 170, damping: 18, mass: 0.7 },
              scale: { type: 'spring', stiffness: 220, damping: 16 },
              opacity: { duration: 0.2 },
            }}
            onClick={(event) => {
              event.stopPropagation();
              onSelectNode(node.id, {
                clientX: event.clientX,
                clientY: event.clientY,
                source: 'node_click',
              });
            }}
            onPointerDown={(event) => onNodePointerDown(event, node)}
            className={node.id === 'root' ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}
            style={{
              filter: !isFocused
                ? 'saturate(0.84) brightness(1)'
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
              <circle r={3.8} fill="#6b7280" fillOpacity={nodeTone} />
            )}
            {!isRoot && badge && (
              <g
                transform={`translate(${node.r * 0.72}, ${-node.r * 0.72})`}
                opacity={Math.max(0.08, Math.min(1, nodeTone))}
              >
                <circle r={6.6} fill={badge.fill} stroke="#ffffff" strokeWidth={1.3} />
                <text
                  x={0}
                  y={2.8}
                  textAnchor="middle"
                  fontSize={7.5}
                  fill="#ffffff"
                  className="pointer-events-none select-none font-bold"
                >
                  {badge.text}
                </text>
              </g>
            )}
            {canCollapse && (
              <g
                transform={`translate(${-(node.r * 0.78)}, ${-(node.r * 0.78)})`}
                opacity={Math.max(0.12, Math.min(1, nodeTone))}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleNodeCollapse(node.id);
                }}
                className="cursor-pointer"
              >
                <circle r={6.4} fill="#ffffff" stroke="#94a3b8" strokeWidth={1.2} />
                <text
                  x={0}
                  y={2.3}
                  textAnchor="middle"
                  fontSize={8}
                  fill="#334155"
                  className="pointer-events-none select-none font-bold"
                >
                  {isCollapsed ? '+' : '-'}
                </text>
              </g>
            )}
          </motion.g>
        );
      })}
      <g className="pointer-events-none">
        {labelLayerItems.map((item) => (
          <text
            key={`${item.id}-label`}
            x={item.x}
            y={item.y}
            textAnchor="middle"
            fontSize={item.fontSize}
            fill={item.fill}
            fillOpacity={item.fillOpacity}
            stroke="#f8fafc"
            strokeOpacity={Math.min(1, item.fillOpacity * 0.92)}
            strokeWidth={2}
            paintOrder="stroke"
            className="pointer-events-none select-none font-semibold"
          >
            {item.text}
          </text>
        ))}
      </g>
      </g>
    </svg>
  );
}

export { CANVAS_WIDTH, CANVAS_HEIGHT };
