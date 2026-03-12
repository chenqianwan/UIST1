import { getRuntimeApiBase } from '../config/runtimeApiBase';

export interface SemanticNodeInput {
  id: string;
  label: string;
  content: string;
  timePhase?: 'pre_sign' | 'effective' | 'execution' | 'acceptance' | 'termination' | 'post_termination';
}

type PartyOwner = 'A' | 'B' | 'both' | 'neutral';

const SEMANTIC_API_BASE = getRuntimeApiBase();
const PARTY_AXIS_LANE: Record<PartyOwner, number> = {
  A: 0.10,
  B: 0.90,
  both: 0.38,
  neutral: 0.62,
};
const PARTY_AXIS_CONFIDENCE_FLOOR = 0.5;
const PARTY_AXIS_PHASE_OFFSET: Record<NonNullable<SemanticNodeInput['timePhase']>, number> = {
  pre_sign: -0.02,
  effective: -0.012,
  execution: 0,
  acceptance: 0.012,
  termination: 0.02,
  post_termination: 0.028,
};
let backendModeLogged: 'party-axis-service' | 'built-in-fallback' | null = null;

function logBackendMode(mode: 'party-axis-service' | 'built-in-fallback') {
  if (backendModeLogged === mode) return;
  backendModeLogged = mode;
  if (mode === 'party-axis-service') {
    console.info(`[PartyAxis] backend=python-service (${SEMANTIC_API_BASE})`);
  } else {
    console.info('[PartyAxis] backend=built-in-fallback (python service unavailable)');
  }
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function laneWithSmallJitter(nodeId: string, baseLane: number): number {
  const jitter = ((hashToken(nodeId) % 21) - 10) / 1000; // [-0.01, +0.01]
  return clamp01(baseLane + jitter);
}

function applyPhaseSpread(baseLane: number, timePhase?: SemanticNodeInput['timePhase']): number {
  if (!timePhase) return baseLane;
  const offset = PARTY_AXIS_PHASE_OFFSET[timePhase];
  if (typeof offset !== 'number') return baseLane;
  return clamp01(baseLane + offset);
}

function toWeightedLane(baseLane: number, confidence?: number): number {
  const c = typeof confidence === 'number' ? clamp01(confidence) : 0.5;
  return 0.5 + (baseLane - 0.5) * Math.max(PARTY_AXIS_CONFIDENCE_FLOOR, c);
}

function inferPartyOwnerFallback(label: string, content: string): PartyOwner {
  const text = `${label}\n${content}`.toLowerCase();
  const hasA = /\bparty\s*a\b|\bfirst\s+party\b|\blicensor\b|\blandlord\b|\bsupplier\b|\bprovider\b|甲方/u.test(text);
  const hasB = /\bparty\s*b\b|\bsecond\s+party\b|\blicensee\b|\btenant\b|\bcustomer\b|\bclient\b|乙方/u.test(text);
  const hasBoth = /\bboth parties\b|\bthe parties\b|\bmutual(?:ly)?\b|双方|各方/u.test(text);

  if ((hasA && hasB) || (hasBoth && (hasA || hasB))) return 'both';
  if (hasA) return 'A';
  if (hasB) return 'B';
  return 'neutral';
}

function fallbackPartyAxisTargetXMap(nodes: SemanticNodeInput[]): Record<string, number> {
  const out: Record<string, number> = {};
  nodes.forEach((node) => {
    const owner = inferPartyOwnerFallback(node.label, node.content);
    const weighted = toWeightedLane(PARTY_AXIS_LANE[owner], 0.75);
    const phased = applyPhaseSpread(weighted, node.timePhase);
    out[node.id] = laneWithSmallJitter(node.id, phased);
  });
  return out;
}

async function partyAxisTargetXMapFromPython(nodes: SemanticNodeInput[]): Promise<Record<string, number>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2800);
  try {
    const response = await fetch(`${SEMANTIC_API_BASE}/semantic/party-axis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: nodes.map((node) => ({
          id: node.id,
          label: node.label,
          content: node.content,
        })),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Party axis service failed: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as {
      items?: Array<{ id?: string; partyOwner?: PartyOwner; confidence?: number }>;
    };
    if (!Array.isArray(data.items)) {
      throw new Error('Party axis service response missing items array.');
    }
    const byId = new Map<string, { partyOwner: PartyOwner; confidence: number }>();
    data.items.forEach((item) => {
      if (!item || typeof item.id !== 'string') return;
      const owner = item.partyOwner;
      if (owner !== 'A' && owner !== 'B' && owner !== 'both' && owner !== 'neutral') return;
      const confidence = typeof item.confidence === 'number' ? clamp01(item.confidence) : 0.5;
      byId.set(item.id, { partyOwner: owner, confidence });
    });

    const out: Record<string, number> = {};
    nodes.forEach((node) => {
      const item = byId.get(node.id);
      const owner = item?.partyOwner ?? inferPartyOwnerFallback(node.label, node.content);
      const base = PARTY_AXIS_LANE[owner];
      const weighted = toWeightedLane(base, item?.confidence);
      const phased = applyPhaseSpread(weighted, node.timePhase);
      out[node.id] = laneWithSmallJitter(node.id, phased);
    });
    return out;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getSemanticTargetXMap(
  nodes: SemanticNodeInput[],
): Promise<Record<string, number>> {
  if (nodes.length === 0) return {};

  try {
    const map = await partyAxisTargetXMapFromPython(nodes);
    logBackendMode('party-axis-service');
    return map;
  } catch (error) {
    console.warn('[PartyAxis] Python service unavailable, fallback to built-in rules.', error);
    logBackendMode('built-in-fallback');
    return fallbackPartyAxisTargetXMap(nodes);
  }
}

export async function warmupSemanticModel(): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    try {
      const response = await fetch(`${SEMANTIC_API_BASE}/health`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Semantic service health check failed: ${response.status}`);
    } finally {
      clearTimeout(timeout);
    }
    logBackendMode('party-axis-service');
    return { ok: true };
  } catch (error) {
    logBackendMode('built-in-fallback');
    return { ok: false, error };
  }
}
