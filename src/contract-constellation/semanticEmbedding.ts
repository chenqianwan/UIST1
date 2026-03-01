export interface SemanticNodeInput {
  id: string;
  label: string;
  content: string;
}

const SEMANTIC_API_BASE = import.meta.env.VITE_SEMANTIC_API_BASE ?? 'http://127.0.0.1:8008';
const embeddingCache = new Map<string, number[]>();
const LOCAL_DIM = 16;
let backendModeLogged: 'python-service' | 'built-in-fallback' | null = null;

/**
 * Built-in lightweight semantic vectors.
 * Reserved fallback when local Python service is unavailable.
 */
const TOKEN_VECTOR_TABLE: Record<string, number[]> = {
  payment: [1.0, 0.1, 0.0, 0.0],
  invoice: [1.0, 0.2, 0.0, 0.0],
  acceptance: [0.6, 0.0, 0.3, 0.2],
  criteria: [0.6, 0.0, 0.3, 0.2],
  validation: [0.5, 0.0, 0.3, 0.3],
  process: [0.4, 0.0, 0.3, 0.4],
  confidentiality: [0.0, 1.0, 0.1, 0.0],
  disclosure: [0.0, 1.0, 0.1, 0.0],
  intellectual: [0.0, 0.9, 0.2, 0.0],
  property: [0.0, 0.9, 0.2, 0.0],
  infringement: [0.0, 0.8, 0.2, 0.1],
  liability: [0.1, 0.2, 1.0, 0.2],
  indemnification: [0.1, 0.2, 1.0, 0.2],
  termination: [0.1, 0.1, 1.0, 0.3],
  settlement: [0.2, 0.1, 0.8, 0.4],
  notice: [0.2, 0.1, 0.7, 0.4],
  warranty: [0.2, 0.4, 0.5, 0.2],
  obligation: [0.3, 0.4, 0.4, 0.2],
  clause: [0.3, 0.3, 0.3, 0.3],
  contract: [0.3, 0.3, 0.3, 0.3],
};

function logBackendMode(mode: 'python-service' | 'built-in-fallback') {
  if (backendModeLogged === mode) return;
  backendModeLogged = mode;
  if (mode === 'python-service') {
    console.info(`[Semantic] backend=python-service (${SEMANTIC_API_BASE})`);
  } else {
    console.info('[Semantic] backend=built-in-fallback (python service unavailable)');
  }
}

function l2Normalize(vector: number[]): number[] {
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) sum += vector[i] * vector[i];
  const denom = Math.sqrt(sum) || 1;
  return vector.map((v) => v / denom);
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function localSemanticVector(text: string): number[] {
  const vector = new Array<number>(LOCAL_DIM).fill(0);
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);

  tokens.forEach((token) => {
    const base = TOKEN_VECTOR_TABLE[token];
    if (base) {
      for (let i = 0; i < base.length; i += 1) vector[i] += base[i];
    } else {
      const bucket = hashToken(token) % LOCAL_DIM;
      vector[bucket] += 0.25;
    }
  });
  return l2Normalize(vector);
}

async function embedBatchFromPython(texts: string[]): Promise<number[][]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2200);
  try {
    const response = await fetch(`${SEMANTIC_API_BASE}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Semantic service failed: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as { embeddings?: number[][] };
    if (!data.embeddings || !Array.isArray(data.embeddings)) {
      throw new Error('Semantic service response missing embeddings.');
    }
    if (data.embeddings.length !== texts.length) {
      throw new Error(`Semantic service returned ${data.embeddings.length} embeddings for ${texts.length} texts.`);
    }
    return data.embeddings.map((vector) => l2Normalize(vector));
  } finally {
    clearTimeout(timeout);
  }
}

function cosineSimilarity(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (n === 0) return -1;

  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  const denom = Math.sqrt(aa) * Math.sqrt(bb);
  if (!denom) return -1;
  return dot / denom;
}

function meanVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const out = new Array<number>(dim).fill(0);
  vectors.forEach((vector) => {
    for (let i = 0; i < dim; i += 1) out[i] += vector[i] ?? 0;
  });
  for (let i = 0; i < dim; i += 1) out[i] /= vectors.length;
  return out;
}

function kmeans(vectors: number[][], k: number, iterations = 8): number[] {
  if (vectors.length === 0) return [];
  const actualK = Math.max(1, Math.min(k, vectors.length));
  const centroids = vectors.slice(0, actualK).map((v) => [...v]);
  const assign = new Array<number>(vectors.length).fill(0);

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < vectors.length; i += 1) {
      let bestIdx = 0;
      let bestScore = -Infinity;
      for (let c = 0; c < centroids.length; c += 1) {
        const score = cosineSimilarity(vectors[i], centroids[c]);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = c;
        }
      }
      assign[i] = bestIdx;
    }

    for (let c = 0; c < centroids.length; c += 1) {
      const members: number[][] = [];
      for (let i = 0; i < vectors.length; i += 1) {
        if (assign[i] === c) members.push(vectors[i]);
      }
      if (members.length > 0) centroids[c] = meanVector(members);
    }
  }

  return assign;
}

export async function getSemanticTargetXMap(
  nodes: SemanticNodeInput[],
): Promise<Record<string, number>> {
  if (nodes.length === 0) return {};

  const texts = nodes.map((node) => `${node.label}. ${node.content}`.trim());
  const matrix: number[][] = new Array(texts.length);
  const missingTexts: string[] = [];
  const missingIndices: number[] = [];

  texts.forEach((text, index) => {
    const cached = embeddingCache.get(text);
    if (cached) {
      matrix[index] = cached;
    } else {
      missingTexts.push(text);
      missingIndices.push(index);
    }
  });

  if (missingTexts.length > 0) {
    try {
      const vectors = await embedBatchFromPython(missingTexts);
      vectors.forEach((vector, i) => {
        const idx = missingIndices[i];
        embeddingCache.set(texts[idx], vector);
        matrix[idx] = vector;
      });
      logBackendMode('python-service');
    } catch (error) {
      console.warn('[Semantic] Python service unavailable, fallback to built-in vectors.', error);
      missingTexts.forEach((text, i) => {
        const idx = missingIndices[i];
        const local = localSemanticVector(text);
        embeddingCache.set(text, local);
        matrix[idx] = local;
      });
      logBackendMode('built-in-fallback');
    }
  } else {
    // All vectors from cache; keep previous mode if known.
    if (!backendModeLogged) {
      logBackendMode('built-in-fallback');
    }
  }

  const clusterIds = kmeans(matrix, 4, 8);
  const clusterToMemberIndices: Record<number, number[]> = {};
  clusterIds.forEach((clusterId, idx) => {
    if (!clusterToMemberIndices[clusterId]) clusterToMemberIndices[clusterId] = [];
    clusterToMemberIndices[clusterId].push(idx);
  });

  const orderedClusters = Object.entries(clusterToMemberIndices)
    .map(([clusterId, memberIndices]) => {
      const meanX =
        memberIndices.reduce((acc, idx) => acc + idx / Math.max(1, nodes.length - 1), 0) /
        memberIndices.length;
      return { clusterId: Number(clusterId), meanX };
    })
    .sort((a, b) => a.meanX - b.meanX);

  const lanes = [0.2, 0.4, 0.6, 0.8];
  const clusterLane = new Map<number, number>();
  orderedClusters.forEach((cluster, index) => {
    const laneIdx = Math.min(index, lanes.length - 1);
    clusterLane.set(cluster.clusterId, lanes[laneIdx]);
  });

  const result: Record<string, number> = {};
  nodes.forEach((node, index) => {
    const clusterId = clusterIds[index] ?? 0;
    const xNorm = clusterLane.get(clusterId) ?? 0.5;
    result[node.id] = xNorm;
  });
  return result;
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
    logBackendMode('python-service');
    return { ok: true };
  } catch (error) {
    logBackendMode('built-in-fallback');
    return { ok: false, error };
  }
}
