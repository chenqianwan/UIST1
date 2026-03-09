import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type PointerEvent,
} from 'react';
import { Trash2 } from 'lucide-react';
import canvasBg from '../../static/canvas_bg.png';
import sidePanelBg from '../../static/side_panel.png';
import stageAData from '../../docs/simple1.stage_a.json';
import stageBData from '../../docs/simple1.stage_b.json';
import reneStageAData from '../../docs/reneHouseTemplate.stage_a.json';
import reneStageBData from '../../docs/reneHouseTemplate.stage_b.json';
import testAbStageAData from '../../docs/test_ab.stage_a.json';
import testAbStageBData from '../../docs/test_ab.stage_b.json';
import testNewStageAData from '../../docs/test_new.stage_a.json';
import testNewStageBData from '../../docs/test_new.stage_b.json';
import text2AbStageAData from '../../docs/text2_ab.stage_a.json';
import text2AbStageBData from '../../docs/text2_ab.stage_b.json';
import text2AbStageAChineseData from '../../docs/text2_ab.stage_a.chinese.json';
import text2AbStageBChineseData from '../../docs/text2_ab.stage_b.chinese.json';
import testNewStageAChineseData from '../../docs/test_new.stage_a.chinese.json';
import testNewStageBChineseData from '../../docs/test_new.stage_b.chinese.json';
import { NODE_LIBRARY } from './constants';
import { GraphCanvas, CANVAS_WIDTH, CANVAS_HEIGHT } from './GraphCanvas';
import { SidePanel } from './SidePanel';
import type { GraphNode, GraphLink, NodeActionType } from './types';
import type { NodeActionItem } from './types';
import type { TemplateItem } from './types';
import { getRiskColor, getAiSuggestion } from './utils';
import { getSemanticTargetXMap } from './semanticEmbedding';
import { useGalaxyEngine } from './useGalaxyEngine';
import { useMonitoring } from '../monitoring/useMonitoring';
import { flushMonitoringEventsNow } from '../monitoring/collector';

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
const ANALYSIS_SLIDER_COUNT = 3;
const TRASH_ZONE_WIDTH = 192;
const TRASH_ZONE_HEIGHT = 96;
const TRASH_ZONE_LEFT = 16;
const TRASH_ZONE_BOTTOM = 16;
const DOWNSTREAM_API_BASE = import.meta.env.VITE_SEMANTIC_API_BASE ?? 'http://127.0.0.1:8008';
const HOVER_SAMPLE_INTERVAL_MS = 320;
const HOVER_HEAT_WEIGHT = 0.12;
const SLIDER_SAMPLE_INTERVAL_MS = 220;
const SLIDER_HEAT_WEIGHT = 0.4;
const MODIFY_SAMPLE_INTERVAL_MS = 220;
const MODIFY_HEAT_WEIGHT = 0.45;
type GraphPresetId = string;

const BASE_GRAPH_PRESET_OPTIONS: Array<{ id: GraphPresetId; label: string }> = [
  { id: 'standard', label: 'Standard' },
  { id: 'simple1', label: 'Simple1 (Stage A + B)' },
  { id: 'reneHouseTemplate', label: 'reneHouseTemplate (Stage A + B)' },
  { id: 'test_ab', label: 'test_ab (Stage A + B)' },
  { id: 'patent', label: 'patent (Stage A + B)' },
  { id: 'housing', label: 'housing (Stage A + B)' },
  { id: 'patent_chinese', label: '专利 (中文 Stage A + B)' },
  { id: 'housing_chinese', label: '房屋租赁 (中文 Stage A + B)' },
];

type StageANode = {
  id: string;
  label: string;
  content: string;
  type: 'main' | 'sub';
  parentId?: string | null;
  timePhase?: GraphNode['timePhase'];
};

type StageBNode = {
  id: string;
  references?: string[];
  riskLevel?: GraphNode['riskLevel'];
  actions?: NodeActionItem[];
};

type UploadedPreset = {
  id: string;
  label: string;
  templates: TemplateItem[];
};

type UpstreamBuildTemplateResponse = {
  template_id: string;
  template_label: string;
  stage_a_nodes: StageANode[];
  stage_b_nodes: StageBNode[];
};

function buildStageTemplates(
  stageANodes: StageANode[],
  stageBNodes: StageBNode[],
  templatePrefix: string,
  importedLabel: string,
): TemplateItem[] {
  const bMap = new Map(stageBNodes.map((n) => [n.id, n]));
  const byIdA = new Map(stageANodes.map((n) => [n.id, n]));
  const childrenByParent = new Map<string, StageANode[]>();

  stageANodes.forEach((node) => {
    if (node.id === 'root') return;
    const parentKey = node.parentId ?? 'root';
    const list = childrenByParent.get(parentKey) ?? [];
    list.push(node);
    childrenByParent.set(parentKey, list);
  });

  const mapReferences = (nodeId: string) =>
    (bMap.get(nodeId)?.references ?? [])
      .filter((refId) => byIdA.has(refId))
      .map((refId) => `${templatePrefix}::${refId}`);

  const buildSatellite = (node: StageANode) => {
    const b = bMap.get(node.id);
    const grandchildren = childrenByParent.get(node.id) ?? [];
    return {
      id: `${templatePrefix}::${node.id}`,
      label: node.label,
      content: node.content,
      timePhase: node.timePhase ?? 'execution',
      references: mapReferences(node.id),
      riskLevel: b?.riskLevel ?? 'none',
      actions: b?.actions,
      details: grandchildren.map((detail) => {
        const detailB = bMap.get(detail.id);
        return {
          id: `${templatePrefix}::${detail.id}`,
          label: detail.label,
          content: detail.content,
          timePhase: detail.timePhase ?? 'execution',
          references: mapReferences(detail.id),
          riskLevel: detailB?.riskLevel ?? 'none',
          actions: detailB?.actions,
        };
      }),
    };
  };

  const mainNodes = childrenByParent.get('root') ?? [];
  return mainNodes.map((mainNode) => {
    const b = bMap.get(mainNode.id);
    const riskLevel = b?.riskLevel ?? 'none';
    const children = childrenByParent.get(mainNode.id) ?? [];
    return {
      id: `${templatePrefix}::${mainNode.id}`,
      label: mainNode.label,
      description: mainNode.content.replace(/\s+/g, ' ').slice(0, 72) || importedLabel,
      type: toTemplateType(riskLevel),
      riskLevel,
      content: mainNode.content,
      timePhase: mainNode.timePhase ?? 'execution',
      actions: b?.actions,
      satellites: children.map(buildSatellite),
    };
  });
}

function toTemplateType(riskLevel: GraphNode['riskLevel']): TemplateItem['type'] {
  if (riskLevel === 'high' || riskLevel === 'medium') return 'risk';
  if (riskLevel === 'low') return 'obligation';
  return 'asset';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toHtmlWithBreaks(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br/>');
}

function canonicalizeHeadingText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(section|article|clause)\b/g, ' ')
    .replace(/第\s*\d+(\.\d+)*\s*条/g, ' ')
    .replace(/[\u2012-\u2015]/g, '-')
    .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHeadingPrefix(raw: string): { index: string; title: string } {
  const text = raw.trim();
  if (!text) return { index: '', title: '' };
  const sectionMatch = text.match(
    /^\s*(?:section|article|clause)\s+(\d+(?:\.\d+)*)\s*(?:[-:.\u2012-\u2015]|\s)*([\s\S]*)$/i,
  );
  if (sectionMatch) {
    return {
      index: sectionMatch[1],
      title: sectionMatch[2].trim(),
    };
  }
  const plainMatch = text.match(/^\s*(\d+(?:\.\d+)*)\s*(?:[-:.\u2012-\u2015]|\s)*([\s\S]*)$/);
  if (plainMatch) {
    return {
      index: plainMatch[1],
      title: plainMatch[2].trim(),
    };
  }
  return { index: '', title: text };
}

function isEquivalentHeading(label: string, firstLine: string): boolean {
  const a = extractHeadingPrefix(label);
  const b = extractHeadingPrefix(firstLine);
  const aTitle = canonicalizeHeadingText(a.title);
  const bTitle = canonicalizeHeadingText(b.title);
  const indexMatches = a.index && b.index && a.index === b.index;
  const titleMatches =
    (aTitle && bTitle && (aTitle === bTitle || aTitle.startsWith(bTitle) || bTitle.startsWith(aTitle)))
    || (!aTitle && !bTitle);
  return Boolean(indexMatches && titleMatches);
}

function stripLeadingDuplicateHeading(label: string, content: string): string {
  const normalizedLabel = normalizeInlineText(label);
  if (!normalizedLabel) return content.trim();
  const lines = content.split(/\r?\n/);
  let start = 0;
  while (start < lines.length && !lines[start].trim()) start += 1;
  if (start >= lines.length) return '';
  const firstLine = lines[start].trim();
  const firstLineNormalized = normalizeInlineText(firstLine);
  if (firstLineNormalized !== normalizedLabel && !isEquivalentHeading(label, firstLine)) return content.trim();
  const rest = lines.slice(start + 1).join('\n').trim();
  return rest;
}

function buildTreeFormattedClausesHtml(
  clauses: Array<{
    id: string;
    label: string;
    content: string;
    type?: string;
    parentId?: string | null;
  }>,
  options?: {
    highlightIds?: Set<string>;
  },
): string {
  const byId = new Map(clauses.map((clause) => [clause.id, clause]));
  const depthMemo = new Map<string, number>();

  const getDepth = (id: string, visiting: Set<string> = new Set()): number => {
    if (depthMemo.has(id)) return depthMemo.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const clause = byId.get(id);
    const parentId = clause?.parentId;
    if (!parentId || parentId === 'root' || !byId.has(parentId)) {
      depthMemo.set(id, 0);
      return 0;
    }
    const depth = Math.min(4, getDepth(parentId, visiting) + 1);
    depthMemo.set(id, depth);
    return depth;
  };

  return clauses.map((clause) => {
    const depth = getDepth(clause.id);
    const indentEm = depth * 1.5;
    const isMain = clause.type === 'main' || depth === 0;
    const titleSize = isMain ? 19 : 15;
    const cleanedContent = stripLeadingDuplicateHeading(clause.label, clause.content);
    const shouldRenderContent = hasDistinctClauseBody(clause.label, cleanedContent);
    const highlight = options?.highlightIds?.has(clause.id) ?? false;
    const bodyColor = highlight ? '#d32f2f' : '#1f2937';
    return `
      <div style="margin:0 0 12px ${indentEm}em;">
        <div style="font-weight:700;font-size:${titleSize}px;line-height:1.5;margin:0 0 4px 0;color:${bodyColor};">${toHtmlWithBreaks(clause.label)}</div>
        ${shouldRenderContent
          ? `<div style="line-height:1.72;color:${bodyColor};">${toHtmlWithBreaks(cleanedContent)}</div>`
          : ''}
      </div>
    `;
  }).join('');
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function hasDistinctClauseBody(label: string, content: string): boolean {
  const normalizedContent = normalizeInlineText(content);
  if (!normalizedContent) return false;
  return normalizeInlineText(label) !== normalizedContent;
}

function buildClauseExportText(label: string, content: string): string {
  const normalizedLabel = normalizeInlineText(label);
  const normalizedContent = normalizeInlineText(content);
  if (!normalizedLabel && !normalizedContent) return '';
  if (!normalizedContent) return label.trim();
  if (normalizedLabel === normalizedContent) return content.trim();
  return `${label}\n${content}`.trim();
}

function sanitizeTemplateId(rawName: string): string {
  const normalized = rawName.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || 'uploaded_template';
}

function isUserAddedSupplementNode(node: GraphNode): boolean {
  return /^sub_.+_\d{10,}$/.test(node.id);
}

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
  const analysisControlsRef = useRef<HTMLDivElement | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDragOverCanvas, setIsDragOverCanvas] = useState(false);
  const [usedTemplateIds, setUsedTemplateIds] = useState<string[]>([]);
  const [graphPresetId, setGraphPresetId] = useState<GraphPresetId>('standard');
  const [uploadedPresets, setUploadedPresets] = useState<UploadedPreset[]>([]);
  const [showUploadPrompt, setShowUploadPrompt] = useState(true);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [templateNameInput, setTemplateNameInput] = useState('');
  const [selectedTemplateFile, setSelectedTemplateFile] = useState<File | null>(null);
  const [lastAppliedAction, setLastAppliedAction] = useState<{ nodeId: string; actionId: string; actionType: NodeActionType } | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isOverTrash, setIsOverTrash] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'success'>('idle');
  const [modifiedNodeIds, setModifiedNodeIds] = useState<string[]>([]);
  const [deletedClauses, setDeletedClauses] = useState<Array<{ id: string; label: string; content: string }>>([]);
  const [isBulkApplying, setIsBulkApplying] = useState(false);
  const [bulkApplyDoneCount, setBulkApplyDoneCount] = useState<number | null>(null);
  const bulkApplyDoneTimerRef = useRef<number | null>(null);
  const [revealStage, setRevealStage] = useState<1 | 2>(2);
  const [semanticBiasStrength, setSemanticBiasStrength] = useState(0);
  const [riskBiasStrength, setRiskBiasStrength] = useState(0);
  const [timeBiasStrength, setTimeBiasStrength] = useState(0);
  const [showAnalysisControls, setShowAnalysisControls] = useState(true);
  const [semanticTargetXById, setSemanticTargetXById] = useState<Record<string, number>>({});
  const [timeTargetXById, setTimeTargetXById] = useState<Record<string, number>>({});
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const exportTimerRef = useRef<number | null>(null);
  const hoverSampleAtRef = useRef<number>(0);
  const sliderSampleAtRef = useRef<number>(0);
  const modifySampleAtRef = useRef<number>(0);
  const taskStartAtRef = useRef<number | null>(null);
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
    const rootRect = rootRef.current.getBoundingClientRect();
    const rootWidth = Math.max(1, rootRect.width);
    const rootHeight = Math.max(1, rootRect.height);
    const y = ((clientY - rootRect.top) / rootHeight) * layoutHeight;

    let x: number;
    const canvasRect = svgRef.current?.getBoundingClientRect();
    if (canvasRect && canvasRect.width > 0) {
      if (clientX <= canvasRect.right) {
        const canvasRatio = (clientX - canvasRect.left) / canvasRect.width;
        x = Math.max(0, Math.min(1, canvasRatio)) * width;
      } else {
        const sideWidthPx = Math.max(1, rootRect.right - canvasRect.right);
        const sideRatio = (clientX - canvasRect.right) / sideWidthPx;
        x = width + Math.max(0, Math.min(1, sideRatio)) * SIDE_PANEL_WIDTH;
      }
    } else {
      const xRatio = (clientX - rootRect.left) / rootWidth;
      x = Math.max(0, Math.min(1, xRatio)) * layoutWidth;
    }
    return {
      x: Math.max(0, Math.min(layoutWidth, x)),
      y: Math.max(0, Math.min(layoutHeight, y)),
    };
  }, [height, layoutHeight, layoutWidth, width]);

  const {
    nodes,
    links,
    addNodeFromTemplate,
    completeNodeAction,
    updateNodePosition,
    removeNodeCascade,
    addSupplementClause,
    setDraggingNode,
    loadGraphPreset,
  } = useGalaxyEngine(
    width,
    height,
    semanticBiasStrength,
    semanticTargetXById,
    riskBiasStrength,
    timeBiasStrength,
    timeTargetXById,
  );

  const handleGraphPresetChange = useCallback((presetId: GraphPresetId) => {
    setGraphPresetId(presetId);
  }, []);

  const handleUseDefaultTemplate = useCallback(() => {
    const startedAt = Date.now();
    taskStartAtRef.current = startedAt;
    setGraphPresetId('standard');
    setShowUploadPrompt(false);
    setUploadError(null);
    track('canvas_interaction', {
      componentId: 'template_gate',
      payload: {
        timer_action: 'start',
        start_mode: 'default_template',
        started_at: startedAt,
      },
    });
  }, [track]);

  const handleTemplateFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedTemplateFile(file);
    if (file && !templateNameInput.trim()) {
      const rawName = file.name.replace(/\.txt$/i, '');
      setTemplateNameInput(sanitizeTemplateId(rawName));
    }
    setUploadError(null);
  }, [templateNameInput]);

  const handleUploadTemplate = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTemplateFile) {
      setUploadError('Please select a .txt file first.');
      return;
    }
    setUploadingTemplate(true);
    setUploadError(null);
    try {
      const contractText = await selectedTemplateFile.text();
      const baseName = templateNameInput.trim() || selectedTemplateFile.name.replace(/\.txt$/i, '');
      const templateName = sanitizeTemplateId(baseName);
      const resp = await fetch(`${DOWNSTREAM_API_BASE}/upstream/build-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_text: contractText,
          template_name: templateName,
          save_artifacts: true,
        }),
      });
      if (!resp.ok) {
        const raw = await resp.text();
        let detail = raw;
        try {
          const j = JSON.parse(raw) as { detail?: string };
          if (typeof j.detail === 'string') detail = j.detail;
        } catch {
          /* use raw */
        }
        throw new Error(`Build template failed: ${resp.status} ${detail}`);
      }
      const data = (await resp.json()) as UpstreamBuildTemplateResponse;
      const presetId = sanitizeTemplateId(data.template_id || templateName);
      const presetLabel = data.template_label?.trim()
        ? `${data.template_label} (Uploaded)`
        : `${presetId} (Uploaded)`;
      const templates = buildStageTemplates(
        data.stage_a_nodes ?? [],
        data.stage_b_nodes ?? [],
        presetId,
        `Imported from ${presetId}`,
      );
      setUploadedPresets((prev) => {
        const withoutSame = prev.filter((preset) => preset.id !== presetId);
        return [...withoutSame, { id: presetId, label: presetLabel, templates }];
      });
      const startedAt = Date.now();
      taskStartAtRef.current = startedAt;
      setGraphPresetId(presetId);
      setShowUploadPrompt(false);
      setTemplateNameInput('');
      setSelectedTemplateFile(null);
      track('canvas_interaction', {
        componentId: 'template_gate',
        payload: {
          timer_action: 'start',
          start_mode: 'uploaded_template',
          template_id: presetId,
          started_at: startedAt,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to build template from uploaded txt.';
      setUploadError(message);
    } finally {
      setUploadingTemplate(false);
    }
  }, [selectedTemplateFile, templateNameInput, track]);

  const markNodeModified = useCallback((nodeId: string) => {
    setModifiedNodeIds((prev) => (prev.includes(nodeId) ? prev : [...prev, nodeId]));
  }, []);

  useEffect(() => {
    loadGraphPreset('blank');
    setUsedTemplateIds([]);
    setSelectedNodeId(null);
    setModifiedNodeIds([]);
    setDeletedClauses([]);
  }, [graphPresetId, loadGraphPreset]);

  const simple1Templates = useMemo<TemplateItem[]>(() => {
    const aNodes = (stageAData as { nodes?: StageANode[] }).nodes ?? [];
    const bNodes = (stageBData as { nodes?: StageBNode[] }).nodes ?? [];
    return buildStageTemplates(aNodes, bNodes, 'simple1', 'Imported from Simple1');
  }, []);

  const reneHouseTemplates = useMemo<TemplateItem[]>(() => {
    const aNodes = (reneStageAData as { nodes?: StageANode[] }).nodes ?? [];
    const bNodes = (reneStageBData as { nodes?: StageBNode[] }).nodes ?? [];
    return buildStageTemplates(aNodes, bNodes, 'reneHouseTemplate', 'Imported from reneHouseTemplate');
  }, []);

  const testAbTemplates = useMemo<TemplateItem[]>(() => {
    const aNodes = (testAbStageAData as { nodes?: StageANode[] }).nodes ?? [];
    const bNodes = (testAbStageBData as { nodes?: StageBNode[] }).nodes ?? [];
    return buildStageTemplates(aNodes, bNodes, 'test_ab', 'Imported from test_ab');
  }, []);

  const text2AbTemplates = useMemo<TemplateItem[]>(() => {
    const aNodes = (text2AbStageAData as { nodes?: StageANode[] }).nodes ?? [];
    const bNodes = (text2AbStageBData as { nodes?: StageBNode[] }).nodes ?? [];
    return buildStageTemplates(aNodes, bNodes, 'housing', 'Imported from housing');
  }, []);

  const testNewTemplates = useMemo<TemplateItem[]>(() => {
    const aNodes = (testNewStageAData as { nodes?: StageANode[] }).nodes ?? [];
    const bNodes = (testNewStageBData as { nodes?: StageBNode[] }).nodes ?? [];
    return buildStageTemplates(aNodes, bNodes, 'patent', 'Imported from patent');
  }, []);

  const testNewChineseTemplates = useMemo<TemplateItem[]>(() => {
    const aNodes = (testNewStageAChineseData as { nodes?: StageANode[] }).nodes ?? [];
    const bNodes = (testNewStageBChineseData as { nodes?: StageBNode[] }).nodes ?? [];
    return buildStageTemplates(aNodes, bNodes, 'patent_chinese', 'Imported from patent_chinese');
  }, []);

  const text2AbChineseTemplates = useMemo<TemplateItem[]>(() => {
    const aNodes = (text2AbStageAChineseData as { nodes?: StageANode[] }).nodes ?? [];
    const bNodes = (text2AbStageBChineseData as { nodes?: StageBNode[] }).nodes ?? [];
    return buildStageTemplates(aNodes, bNodes, 'housing_chinese', 'Imported from housing_chinese');
  }, []);


  const graphPresetOptions = useMemo(
    () => [
      ...BASE_GRAPH_PRESET_OPTIONS,
      ...uploadedPresets.map((preset) => ({ id: preset.id, label: preset.label })),
    ],
    [uploadedPresets],
  );

  const activeTemplatePool = useMemo(() => {
    if (graphPresetId === 'simple1') return simple1Templates;
    if (graphPresetId === 'reneHouseTemplate') return reneHouseTemplates;
    if (graphPresetId === 'test_ab') return testAbTemplates;
    if (graphPresetId === 'patent') return testNewTemplates;
    if (graphPresetId === 'housing') return text2AbTemplates;
    if (graphPresetId === 'patent_chinese') return testNewChineseTemplates;
    if (graphPresetId === 'housing_chinese') return text2AbChineseTemplates;
    const uploaded = uploadedPresets.find((preset) => preset.id === graphPresetId);
    if (uploaded) return uploaded.templates;
    return NODE_LIBRARY;
  }, [graphPresetId, simple1Templates, reneHouseTemplates, testAbTemplates, testNewTemplates, text2AbTemplates, testNewChineseTemplates, text2AbChineseTemplates, uploadedPresets]);

  const availableTemplates = useMemo(
    () => activeTemplatePool.filter((item) => !usedTemplateIds.includes(item.id)),
    [activeTemplatePool, usedTemplateIds],
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
    if (nodes.some((node) => node.id === templateId)) return;
    const template = activeTemplatePool.find((item) => item.id === templateId);
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
    const toDelete = new Set<string>([nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      nodes.forEach((node) => {
        if (node.parentId && toDelete.has(node.parentId) && !toDelete.has(node.id)) {
          toDelete.add(node.id);
          changed = true;
        }
      });
    }
    const deletedItems = nodes
      .filter((node) => toDelete.has(node.id) && node.id !== 'root')
      .map((node) => ({ id: node.id, label: node.label, content: node.content }));
    if (deletedItems.length > 0) {
      setDeletedClauses((prev) => {
        const existing = new Set(prev.map((item) => item.id));
        return [...prev, ...deletedItems.filter((item) => !existing.has(item.id))];
      });
    }
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

  const handleExportContract = useCallback(async () => {
    if (exportState === 'exporting') return;
    if (exportTimerRef.current) {
      window.clearTimeout(exportTimerRef.current);
      exportTimerRef.current = null;
    }
    setExportState('exporting');
    track('canvas_interaction', {
      componentId: 'template_gate',
      payload: {
        timer_action: 'export_start',
        started_at: Date.now(),
      },
    });
    try {
      const root = nodes.find((node) => node.id === 'root');
      if (!root) throw new Error('Root node missing.');
      const clauses = nodes
        .filter((node) => node.id !== 'root')
        .map((node) => ({
          id: node.id,
          label: node.label,
          type: node.type,
          riskLevel: node.riskLevel,
          timePhase: node.timePhase,
          content: node.content,
          parentId: node.parentId ?? null,
        }));
      const modifiedSet = new Set(modifiedNodeIds);
      const generatedAt = new Date().toISOString();
      const addedNodeIds = new Set(
        nodes.filter((node) => node.id !== 'root' && isUserAddedSupplementNode(node)).map((node) => node.id),
      );

      const toDownstreamNode = (
        node: {
          id: string;
          label: string;
          content: string;
          type?: string;
          parentId?: string | null;
          timePhase?: string;
        },
        extra?: { touched?: boolean; lastOpType?: 'add' | 'delete' | 'revise'; deletedAtVersion?: number | null },
      ) => ({
        id: node.id,
        label: node.label,
        content: node.content,
        type: node.type,
        parentId: node.parentId ?? null,
        timePhase: node.timePhase,
        touched: extra?.touched ?? false,
        subtreeDirty: false,
        touchVersion: extra?.touched ? 1 : undefined,
        lastOpType: extra?.lastOpType,
        deletedAtVersion: extra?.deletedAtVersion ?? null,
      });

      const rootDownstream = toDownstreamNode(root, { touched: false });
      const currentTreeNodes = [
        rootDownstream,
        ...nodes
          .filter((node) => node.id !== 'root')
          .map((node) => toDownstreamNode(node, {
            touched: modifiedSet.has(node.id) || addedNodeIds.has(node.id),
            lastOpType: addedNodeIds.has(node.id) ? 'add' : (modifiedSet.has(node.id) ? 'revise' : undefined),
          })),
      ];

      const baseCoreNodes = nodes
        .filter((node) => node.id !== 'root' && !addedNodeIds.has(node.id))
        .map((node) => toDownstreamNode(node, {
          touched: modifiedSet.has(node.id),
          lastOpType: modifiedSet.has(node.id) ? 'revise' : undefined,
        }));

      const baseDeletedNodes = deletedClauses
        .filter((item) => !nodes.some((node) => node.id === item.id))
        .map((item) => toDownstreamNode({
          id: item.id,
          label: item.label,
          content: item.content,
          type: 'sub',
          parentId: 'root',
          timePhase: 'execution',
        }, {
          touched: true,
          lastOpType: 'delete',
          deletedAtVersion: 1,
        }));

      const diffResp = await fetch(`${DOWNSTREAM_API_BASE}/downstream/diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_tree: { nodes: [rootDownstream, ...baseCoreNodes, ...baseDeletedNodes] },
          current_tree: { nodes: currentTreeNodes },
          baseVersion: 'v1',
          currentVersion: 'v2',
        }),
      });
      if (!diffResp.ok) {
        const detail = await diffResp.text();
        throw new Error(`Diff API failed: ${diffResp.status} ${detail}`);
      }
      const diffData = await diffResp.json();

      const originalContractText = [rootDownstream, ...baseCoreNodes, ...baseDeletedNodes]
        .filter((node) => node.id !== 'root')
        .map((node) => buildClauseExportText(node.label, node.content))
        .filter((text) => text.length > 0)
        .join('\n\n');

      const compileResp = await fetch(`${DOWNSTREAM_API_BASE}/downstream/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_contract_text: originalContractText,
          base_tree: { nodes: [rootDownstream, ...baseCoreNodes, ...baseDeletedNodes] },
          normalized_diff: diffData,
        }),
      });
      if (!compileResp.ok) {
        const detail = await compileResp.text();
        throw new Error(`Compile API failed: ${compileResp.status} ${detail}`);
      }
      const compileData = (await compileResp.json()) as {
        draft_v1?: string;
        ordered_clause_ids?: string[];
        normalized_diff?: unknown;
        compile_report?: unknown[];
      };
      const draftV1 = typeof compileData.draft_v1 === 'string'
        ? compileData.draft_v1
        : clauses
          .map((clause) => buildClauseExportText(clause.label, clause.content))
          .filter((text) => text.length > 0)
          .join('\n\n');
      const clauseById = new Map(clauses.map((clause) => [clause.id, clause]));
      const orderedClauses = Array.isArray(compileData.ordered_clause_ids)
        ? compileData.ordered_clause_ids
          .map((id) => clauseById.get(id))
          .filter((clause): clause is (typeof clauses)[number] => Boolean(clause))
        : [];
      const displayClauses = orderedClauses.length > 0 ? orderedClauses : clauses;

      const finalizeResp = await fetch(`${DOWNSTREAM_API_BASE}/downstream/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_contract_text: originalContractText,
          draft_v1: draftV1,
          normalized_diff: compileData.normalized_diff ?? diffData,
          compile_report: compileData.compile_report ?? [],
        }),
      });
      if (!finalizeResp.ok) {
        const detail = await finalizeResp.text();
        throw new Error(`Finalize API failed: ${finalizeResp.status} ${detail}`);
      }
      const finalized = (await finalizeResp.json()) as { final_text?: string };
      void finalized;
      const treeFormattedHtml = buildTreeFormattedClausesHtml(displayClauses);
      const highlightIds = new Set(
        displayClauses
          .filter((clause) => {
            const node = nodes.find((item) => item.id === clause.id);
            return modifiedSet.has(clause.id) || (node ? isUserAddedSupplementNode(node) : false);
          })
          .map((clause) => clause.id),
      );
      const htmlRows = buildTreeFormattedClausesHtml(displayClauses, { highlightIds });
      const deletedSection = deletedClauses.length > 0
        ? `
        <hr style="margin:20px 0;border:0;border-top:1px solid #e5e7eb;"/>
        <div style="font-weight:700; margin-bottom:8px;">Deleted Clauses</div>
        ${deletedClauses.map((item) => `
          <div style="margin-bottom:10px;color:#d32f2f;line-height:1.65;">
            <div style="font-weight:700;">${toHtmlWithBreaks(item.label)}</div>
            <div>${toHtmlWithBreaks(item.content)}</div>
          </div>
        `).join('')}
        `
        : '';
      const wordHtml = `
        <html>
        <head>
          <meta charset="utf-8" />
          <title>Contract Export</title>
        </head>
        <body style="font-family: Arial, sans-serif; padding: 24px; color: #111827;">
          <h2 style="margin:0 0 8px 0;">Contract Export</h2>
          <div style="font-size:12px;color:#6b7280;margin-bottom:16px;">Generated at: ${escapeHtml(generatedAt)}</div>
          <div style="font-size:12px;color:#6b7280;margin-bottom:8px;">Finalized via downstream finalize model call; rendered with tree-based formatting from ordered clauses.</div>
          <div style="margin:0 0 14px 0;padding:10px;border:1px solid #e5e7eb;background:#fafafa;line-height:1.65;">
            ${treeFormattedHtml}
          </div>
          <hr style="margin:20px 0;border:0;border-top:1px solid #e5e7eb;"/>
          <div style="font-weight:700; margin-bottom:10px;">Clause View (Modified Clauses in Red)</div>
          ${htmlRows}
          ${deletedSection}
        </body>
        </html>
      `;
      const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const stamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
      link.href = url;
      link.download = `contract_export_${stamp}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.info('[Demo] Contract exported successfully', {
        generatedAt,
        clauses,
        displayClauses,
        links,
      });
      setExportState('success');
      track('export_success', {
        componentId: 'side_panel_export',
        payload: {
          clause_count: displayClauses.length,
          link_count: links.length,
          task_duration_ms: taskStartAtRef.current ? Math.max(0, Date.now() - taskStartAtRef.current) : null,
          task_duration_s: taskStartAtRef.current
            ? Number(((Date.now() - taskStartAtRef.current) / 1000).toFixed(2))
            : null,
          x: width + SIDE_PANEL_WIDTH / 2,
          y: height - 34,
          layout_w: layoutWidth,
          layout_h: layoutHeight,
        },
      });
      void flushMonitoringEventsNow();
      exportTimerRef.current = window.setTimeout(() => {
        setExportState('idle');
      }, 2200);
    } catch (error) {
      console.error('[Export] failed', error);
      setExportState('idle');
      window.alert('Export failed. Please check downstream backend and XHUB settings.');
    }
  }, [deletedClauses, exportState, height, layoutHeight, layoutWidth, links, modifiedNodeIds, nodes, track, width]);

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
        markNodeModified(nodeId);
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
    [completeNodeAction, height, layoutHeight, layoutWidth, markNodeModified, track, width],
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
      const didComplete = completeNodeAction(nodeId, actionId, targetNode.content);
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
    const message = `Recursive execution will apply to ${subtreeIds.length} nodes, with a total of ${totalTasks} actions (Delete: ${deletes.length}, Revise: ${revises.length}, Supplement: ${addClauses.length}). Proceed?`;
    if (!window.confirm(message)) return;
    setIsBulkApplying(true);
    const removedIds = new Set<string>();
    const run = () => {
      const applyRevise = (t: BulkTask) => {
        if (removedIds.has(t.nodeId)) return;
        completeNodeAction(t.nodeId, t.action.id, t.action.replacementText ?? t.node.content);
        markNodeModified(t.nodeId);
      };
      const applyAddClause = (t: BulkTask) => {
        if (removedIds.has(t.nodeId)) return;
        addSupplementClause(t.nodeId, t.action.supplementDraft);
        completeNodeAction(t.nodeId, t.action.id, t.node.content);
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
    markNodeModified,
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
      sliderIndex: number,
      value: number,
      force = false,
      pointer?: { clientX: number; clientY: number },
    ) => {
      const now = Date.now();
      if (!force && now - sliderSampleAtRef.current < SLIDER_SAMPLE_INTERVAL_MS) return;
      sliderSampleAtRef.current = now;
      const pointerLayoutPoint = pointer ? getLayoutPointFromClient(pointer.clientX, pointer.clientY) : null;
      const panelLeft = width - 16 - CONTROLS_PANEL_WIDTH;
      const panelTop = height - 16 - CONTROLS_PANEL_HEIGHT;
      const panelCenterY = height - 16 - CONTROLS_PANEL_HEIGHT / 2;
      const sliderCenterX = panelLeft + CONTROLS_PANEL_WIDTH * ((sliderIndex + 0.5) / ANALYSIS_SLIDER_COUNT);
      const pointX = pointerLayoutPoint ? pointerLayoutPoint.x : sliderCenterX;
      const pointY = pointerLayoutPoint ? pointerLayoutPoint.y : panelCenterY;
      let spaceU = Math.max(0, Math.min(1, (pointX - panelLeft) / CONTROLS_PANEL_WIDTH));
      let spaceV = Math.max(0, Math.min(1, (pointY - panelTop) / CONTROLS_PANEL_HEIGHT));
      if (pointer && analysisControlsRef.current) {
        const controlsRect = analysisControlsRef.current.getBoundingClientRect();
        if (controlsRect.width > 0 && controlsRect.height > 0) {
          spaceU = Math.max(0, Math.min(1, (pointer.clientX - controlsRect.left) / controlsRect.width));
          spaceV = Math.max(0, Math.min(1, (pointer.clientY - controlsRect.top) / controlsRect.height));
        }
      }
      track('canvas_interaction', {
        componentId: 'analysis_controls',
        payload: {
          x: Math.round(pointX),
          y: Math.round(pointY),
          space_id: 'dimension',
          space_u: Number(spaceU.toFixed(4)),
          space_v: Number(spaceV.toFixed(4)),
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
    [getLayoutPointFromClient, height, layoutHeight, layoutWidth, track, width],
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
    trackDimensionPanelInteraction(
      'semantic_pull',
      0,
      Number((event.target as HTMLInputElement).value),
      true,
      { clientX: event.clientX, clientY: event.clientY },
    );
  }, [trackDimensionPanelInteraction]);

  const handleRiskBiasCommit = useCallback((event: PointerEvent<HTMLInputElement>) => {
    trackDimensionPanelInteraction(
      'risk_pull',
      1,
      Number((event.target as HTMLInputElement).value),
      true,
      { clientX: event.clientX, clientY: event.clientY },
    );
  }, [trackDimensionPanelInteraction]);

  const handleTimeBiasCommit = useCallback((event: PointerEvent<HTMLInputElement>) => {
    trackDimensionPanelInteraction(
      'time_pull',
      2,
      Number((event.target as HTMLInputElement).value),
      true,
      { clientX: event.clientX, clientY: event.clientY },
    );
  }, [trackDimensionPanelInteraction]);

  const handleSemanticBiasPointerMove = useCallback((event: PointerEvent<HTMLInputElement>) => {
    trackDimensionPanelInteraction(
      'semantic_pull',
      0,
      Number((event.target as HTMLInputElement).value),
      false,
      { clientX: event.clientX, clientY: event.clientY },
    );
  }, [trackDimensionPanelInteraction]);

  const handleRiskBiasPointerMove = useCallback((event: PointerEvent<HTMLInputElement>) => {
    trackDimensionPanelInteraction(
      'risk_pull',
      1,
      Number((event.target as HTMLInputElement).value),
      false,
      { clientX: event.clientX, clientY: event.clientY },
    );
  }, [trackDimensionPanelInteraction]);

  const handleTimeBiasPointerMove = useCallback((event: PointerEvent<HTMLInputElement>) => {
    trackDimensionPanelInteraction(
      'time_pull',
      2,
      Number((event.target as HTMLInputElement).value),
      false,
      { clientX: event.clientX, clientY: event.clientY },
    );
  }, [trackDimensionPanelInteraction]);

  const handleLayoutPointerMoveCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (draggingNodeId) return;
    if (event.target instanceof Element && event.target.closest('.analysis-slider')) return;
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
          {showAnalysisControls ? (
            <div
              ref={analysisControlsRef}
              className="pointer-events-auto flex h-[96px] w-[470px] flex-col justify-center rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-[11px] text-slate-700 shadow-sm backdrop-blur-sm"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-semibold">Analysis Controls</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">
                    S {Math.round(semanticBiasStrength * 100)}% / R {Math.round(riskBiasStrength * 100)}% / T {Math.round(timeBiasStrength * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAnalysisControls(false)}
                    className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Hide
                  </button>
                </div>
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
                    onPointerMove={handleSemanticBiasPointerMove}
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
                    onPointerMove={handleRiskBiasPointerMove}
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
                    onPointerMove={handleTimeBiasPointerMove}
                    onPointerUp={handleTimeBiasCommit}
                    className="analysis-slider analysis-slider--time"
                  />
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAnalysisControls(true)}
              className="pointer-events-auto rounded-lg border border-slate-300 bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur-sm hover:bg-white"
            >
              Show Analysis Controls
            </button>
          )}
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
        graphPresetOptions={graphPresetOptions}
        selectedGraphPresetId={graphPresetId}
        onGraphPresetChange={handleGraphPresetChange}
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

      {showUploadPrompt && (
        <div className="absolute inset-0 z-[30] flex items-center justify-center bg-slate-900/45 backdrop-blur-[1px]">
          <form
            onSubmit={handleUploadTemplate}
            className="w-[480px] max-w-[92vw] rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold text-slate-900">Upload Contract TXT</h3>
            <p className="mt-1 text-xs text-slate-600">
              Upload a .txt contract to auto-build a template, or skip and use the default Standard template.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Template Name</label>
                <input
                  type="text"
                  value={templateNameInput}
                  onChange={(event) => setTemplateNameInput(event.target.value)}
                  placeholder="e.g. officeLeaseTemplate"
                  className="w-full rounded border border-slate-300 px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Contract TXT</label>
                <input
                  type="file"
                  accept=".txt,text/plain"
                  onChange={handleTemplateFileChange}
                  className="w-full rounded border border-slate-300 px-2.5 py-2 text-xs text-slate-700 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                />
              </div>
            </div>

            {uploadError && (
              <p className="mt-3 rounded border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">{uploadError}</p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleUseDefaultTemplate}
                disabled={uploadingTemplate}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Use Default Template
              </button>
              <button
                type="submit"
                disabled={uploadingTemplate}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploadingTemplate ? 'Building...' : 'Upload and Build'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
