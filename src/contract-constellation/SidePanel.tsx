import { Box, DollarSign, Download, FileText, Link2, Loader2, PlusCircle, Shield, Sparkles, Trash2 } from 'lucide-react';
import type { TemplateItem } from './types';
import type { GraphNode } from './types';
import type { AiSuggestion } from './types';
import type { NodeActionItem, NodeActionType } from './types';
import { getRiskColor, getRiskText } from './utils';

function getTemplateIcon(type: TemplateItem['type']) {
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
}

interface SidePanelProps {
  availableTemplates: TemplateItem[];
  graphPresetOptions: Array<{ id: string; label: string }>;
  selectedGraphPresetId: string;
  onGraphPresetChange: (presetId: string) => void;
  selectedNode: GraphNode | null;
  aiSuggestion: AiSuggestion | null;
  lastAppliedAction: { nodeId: string; actionId: string; actionType: NodeActionType } | null;
  exportState: 'idle' | 'exporting' | 'success';
  sidePanelBg: string;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, templateId: string) => void;
  onReviseNode: (nodeId: string, actionId: string, replacement: string) => void;
  onDeleteNode: (nodeId: string, actionId: string) => void;
  onAddSupplement: (nodeId: string, actionId: string, draft?: string) => void;
  onExport: () => void;
  onModifyHoverSample?: (meta: { clientX: number; clientY: number; ratioY: number }) => void;
  isBulkApplying?: boolean;
  bulkApplySummary?: { nodeCount: number; revise: number; addClause: number; delete: number; total: number } | null;
  bulkApplyDoneCount?: number | null;
  onBulkApply?: () => void;
}

export function SidePanel({
  availableTemplates,
  graphPresetOptions,
  selectedGraphPresetId,
  onGraphPresetChange,
  selectedNode,
  aiSuggestion,
  lastAppliedAction,
  exportState,
  sidePanelBg,
  onDragStart,
  onReviseNode,
  onDeleteNode,
  onAddSupplement,
  onExport,
  onModifyHoverSample,
  isBulkApplying = false,
  bulkApplySummary = null,
  bulkApplyDoneCount = null,
  onBulkApply,
}: SidePanelProps) {
  const showActionAdvice = Boolean(selectedNode && selectedNode.id !== 'root' && selectedNode.riskLevel !== 'none');
  const actions = selectedNode?.actions ?? [];
  const completedCount = actions.filter((action) => action.status === 'completed').length;
  const pendingActions = actions.filter((action) => action.status !== 'completed');
  const actionOrder: NodeActionType[] = ['delete', 'revise', 'add_clause'];
  const actionLabel: Record<NodeActionType, string> = {
    delete: 'Delete',
    revise: 'Revise',
    add_clause: 'Add Supplement',
  };
  const actionDescription: Record<NodeActionType, string> = {
    delete: 'This clause is considered unsafe in current form and should be removed.',
    revise: 'Refine wording to tighten conditions and reduce ambiguity.',
    add_clause: 'Add a supplemental clause to close potential loopholes.',
  };
  const actionIcon: Record<NodeActionType, JSX.Element> = {
    delete: <Trash2 size={12} />,
    revise: <Sparkles size={12} />,
    add_clause: <PlusCircle size={12} />,
  };
  const actionTone: Record<NodeActionType, { box: string; border: string; bar: string; text: string; button: string }> = {
    delete: {
      box: 'border-red-200 bg-red-50',
      border: 'border-red-500',
      bar: 'text-red-700',
      text: 'text-red-700',
      button: 'border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100',
    },
    revise: {
      box: 'border-blue-200 bg-sky-50',
      border: 'border-blue-500',
      bar: 'text-blue-700',
      text: 'text-blue-700',
      button: 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100',
    },
    add_clause: {
      box: 'border-emerald-200 bg-emerald-50',
      border: 'border-emerald-500',
      bar: 'text-emerald-700',
      text: 'text-emerald-700',
      button: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100',
    },
  };
  const sortActions = (list: NodeActionItem[]) =>
    [...list].sort((a, b) => actionOrder.indexOf(a.type) - actionOrder.indexOf(b.type));

  return (
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
        <div className="mt-2">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Graph Template
          </label>
          <select
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
            value={selectedGraphPresetId}
            onChange={(event) => onGraphPresetChange(event.target.value)}
          >
            {graphPresetOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1 text-xs text-slate-500">Drag nodes into the main canvas to auto-generate links</p>
      </div>

      <div className="relative z-[1] flex-1 space-y-3 overflow-y-auto p-4">
        {availableTemplates.map((item) => (
          <div
            key={item.id}
            draggable
            onDragStart={(event) => onDragStart(event, item.id)}
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
            <div
              className="mt-2 max-h-[46vh] space-y-2 overflow-y-auto pr-1"
              onPointerMove={(event) => {
                const panelRect = event.currentTarget.getBoundingClientRect();
                const ratioY = panelRect.height > 0 ? (event.clientY - panelRect.top) / panelRect.height : 0.5;
                onModifyHoverSample?.({
                  clientX: event.clientX,
                  clientY: event.clientY,
                  ratioY: Math.max(0, Math.min(1, ratioY)),
                });
              }}
            >
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
              {showActionAdvice && actions.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
                  Action progress: {completedCount} / {actions.length} completed
                </div>
              )}
              {lastAppliedAction?.nodeId === selectedNode.id && selectedNode.riskLevel === 'none' && (
                <p className="text-[11px] font-semibold text-emerald-600">AI update applied; node is now marked as no-risk.</p>
              )}
              {showActionAdvice && bulkApplySummary && onBulkApply && (
                <>
                  <button
                    type="button"
                    onClick={onBulkApply}
                    disabled={isBulkApplying}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isBulkApplying ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>Bulk Apply ({bulkApplySummary.total} items)</>
                    )}
                  </button>
                  {bulkApplyDoneCount != null && (
                    <p className="mt-1 text-center text-[11px] font-semibold text-emerald-600">Applied {bulkApplyDoneCount} actions recursively</p>
                  )}
                </>
              )}
              {showActionAdvice && pendingActions.length > 0 && (
                <div className="max-h-[250px] overflow-y-auto pr-1">
                  {sortActions(pendingActions).map((action) => {
                    const tone = actionTone[action.type];
                    const actionReason = action.reason ?? (action.type === 'revise' ? aiSuggestion?.reason : undefined);
                    const actionConfidence = typeof action.confidence === 'number' ? action.confidence : undefined;
                    return (
                      <div
                        key={action.id}
                        className={`mt-3 rounded-lg border p-3 ${tone.box}`}
                        onPointerMove={(event) => {
                          const cardRect = event.currentTarget.getBoundingClientRect();
                          const ratioY = cardRect.height > 0 ? (event.clientY - cardRect.top) / cardRect.height : 0.5;
                          onModifyHoverSample?.({
                            clientX: event.clientX,
                            clientY: event.clientY,
                            ratioY: Math.max(0, Math.min(1, ratioY)),
                          });
                        }}
                      >
                    <div className={`mb-1 flex items-center gap-1 border-l-4 pl-2 text-xs font-semibold ${tone.border} ${tone.bar}`}>
                      {actionIcon[action.type]}
                      AI Action: {actionLabel[action.type]}
                    </div>
                    <p className="text-xs leading-relaxed text-slate-600">{actionReason ?? actionDescription[action.type]}</p>
                    {actionConfidence !== undefined && (
                      <p className="mt-1 text-[11px] text-slate-500">Confidence: {Math.round(actionConfidence * 100)}%</p>
                    )}
                    {action.type === 'revise' && (
                      <div className="mt-2 rounded border border-slate-200 bg-white p-2 text-xs leading-relaxed text-slate-700">
                        {action.replacementText ?? aiSuggestion?.replacement ?? selectedNode.content}
                      </div>
                    )}
                    {action.type === 'add_clause' && action.supplementDraft && (
                      <div className="mt-2 rounded border border-slate-200 bg-white p-2 text-xs leading-relaxed text-slate-700">
                        {action.supplementDraft}
                      </div>
                    )}
                    <button
                      className={`mt-2 w-full rounded border px-2 py-1.5 text-xs font-semibold transition ${tone.button}`}
                      onClick={() => {
                        if (action.type === 'delete') onDeleteNode(selectedNode.id, action.id);
                        if (action.type === 'revise') onReviseNode(selectedNode.id, action.id, action.replacementText ?? aiSuggestion?.replacement ?? selectedNode.content);
                        if (action.type === 'add_clause') onAddSupplement(selectedNode.id, action.id, action.supplementDraft);
                      }}
                    >
                      {action.type === 'delete' ? 'Delete Clause' : action.type === 'revise' ? 'Apply Revision' : 'Add Supplement Clause'}
                    </button>
                    {lastAppliedAction?.nodeId === selectedNode.id && lastAppliedAction.actionId === action.id && (
                      <p className="mt-1 text-center text-[11px] text-emerald-600">Action applied successfully.</p>
                    )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Click a clause node on the canvas to view details.</p>
          )}
        </div>
        <button
          onClick={onExport}
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
  );
}
