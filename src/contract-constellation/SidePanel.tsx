import { Box, DollarSign, Download, FileText, Link2, PlusCircle, Shield, Sparkles, Trash2 } from 'lucide-react';
import type { TemplateItem } from './types';
import type { GraphNode } from './types';
import type { AiSuggestion } from './types';
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
  selectedNode: GraphNode | null;
  aiSuggestion: AiSuggestion | null;
  lastAppliedNodeId: string | null;
  exportState: 'idle' | 'exporting' | 'success';
  sidePanelBg: string;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, templateId: string) => void;
  onReviseNode: (nodeId: string, replacement: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddSupplement: (nodeId: string, draft?: string) => void;
  onExport: () => void;
}

export function SidePanel({
  availableTemplates,
  selectedNode,
  aiSuggestion,
  lastAppliedNodeId,
  exportState,
  sidePanelBg,
  onDragStart,
  onReviseNode,
  onDeleteNode,
  onAddSupplement,
  onExport,
}: SidePanelProps) {
  const showActionAdvice = Boolean(selectedNode && selectedNode.id !== 'root' && selectedNode.riskLevel !== 'none');

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
              {showActionAdvice && selectedNode.actionReason && (
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5 text-[11px] leading-relaxed text-violet-700">
                  Strategy reason: {selectedNode.actionReason}
                  {typeof selectedNode.confidence === 'number' && (
                    <span className="ml-1 text-violet-500">({Math.round(selectedNode.confidence * 100)}% confidence)</span>
                  )}
                </div>
              )}
              {lastAppliedNodeId === selectedNode.id && selectedNode.riskLevel === 'none' && (
                <p className="text-[11px] font-semibold text-emerald-600">AI update applied; node is now marked as no-risk.</p>
              )}
              {showActionAdvice && selectedNode.actionType === 'delete' && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="mb-1 flex items-center gap-1 border-l-4 border-red-500 pl-2 text-xs font-semibold text-red-700">
                    <Trash2 size={12} />
                    AI Action: Delete
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600">
                    This clause is considered unsafe in current form. Recommended action is to remove it and regenerate a safer alternative.
                  </p>
                  <button
                    className="mt-2 w-full rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100"
                    onClick={() => onDeleteNode(selectedNode.id)}
                  >
                    Delete Clause
                  </button>
                </div>
              )}
              {showActionAdvice && (selectedNode.actionType === 'revise' || (!selectedNode.actionType && aiSuggestion)) && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-sky-50 p-3">
                  <div className="mb-1 flex items-center gap-1 border-l-4 border-blue-500 pl-2 text-xs font-semibold text-blue-700">
                    <Sparkles size={12} />
                    AI Action: Revise
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600">
                    {selectedNode.actionReason ?? aiSuggestion?.reason}
                  </p>
                  <div className="mt-2 rounded border border-slate-200 bg-white p-2 text-xs leading-relaxed text-slate-700">
                    {selectedNode.suggestionText ?? aiSuggestion?.replacement}
                  </div>
                  <button
                    className="mt-2 w-full rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 hover:border-blue-300"
                    onClick={() => onReviseNode(selectedNode.id, selectedNode.suggestionText ?? aiSuggestion?.replacement ?? selectedNode.content)}
                  >
                    Apply Revision
                  </button>
                  {lastAppliedNodeId === selectedNode.id && (
                    <p className="mt-1 text-center text-[11px] text-emerald-600">AI suggestion applied successfully.</p>
                  )}
                </div>
              )}
              {showActionAdvice && selectedNode.actionType === 'add_clause' && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="mb-1 flex items-center gap-1 border-l-4 border-emerald-500 pl-2 text-xs font-semibold text-emerald-700">
                    <PlusCircle size={12} />
                    AI Action: Add Supplement
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600">
                    Existing clause is acceptable, but adding a supplemental constraint can reduce future dispute risk.
                  </p>
                  {selectedNode.supplementDraft && (
                    <div className="mt-2 rounded border border-slate-200 bg-white p-2 text-xs leading-relaxed text-slate-700">
                      {selectedNode.supplementDraft}
                    </div>
                  )}
                  <button
                    className="mt-2 w-full rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                    onClick={() => onAddSupplement(selectedNode.id, selectedNode.supplementDraft)}
                  >
                    Add Supplement Clause
                  </button>
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
