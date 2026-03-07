from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
from threading import Lock
from typing import Any, Dict, List, Literal, Optional, Tuple
from urllib import error, request

try:
    from dotenv import load_dotenv
    _root = Path(__file__).resolve().parent.parent
    load_dotenv(_root / ".env")
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
try:
    from sentence_transformers import SentenceTransformer
except Exception:  # pragma: no cover - fallback for limited local Python builds
    SentenceTransformer = None  # type: ignore[assignment]


class EmbedRequest(BaseModel):
    texts: List[str]


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]


class EventRecord(BaseModel):
    eventId: str
    ts: str
    operator: str
    nodeId: str
    actionType: Literal["add", "delete", "revise"]
    before: Optional[str] = None
    after: Optional[str] = None
    reason: Optional[str] = None
    source: Optional[str] = None
    applied: bool = True
    touchVersion: Optional[int] = None


class EventBatchRequest(BaseModel):
    events: List[EventRecord]


class EventBatchResponse(BaseModel):
    accepted: int
    total: int
    stored: int


class MonitoringEventRecord(BaseModel):
    id: str
    ts: int
    session_id: str
    task_id: str
    study_id: Optional[str] = None
    participant_id: Optional[str] = None
    client_seq: Optional[int] = None
    route: Literal["main", "admin"]
    event_name: str
    component_id: Optional[str] = None
    node_id: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


class MonitoringEventBatchRequest(BaseModel):
    events: List[MonitoringEventRecord]


class MonitoringEventBatchResponse(BaseModel):
    accepted: int
    total: int
    stored: int
    deduplicated: int


class DownstreamNode(BaseModel):
    id: str
    label: str
    content: str
    type: Optional[str] = None
    parentId: Optional[str] = None
    timePhase: Optional[str] = None
    touched: Optional[bool] = None
    subtreeDirty: Optional[bool] = None
    touchVersion: Optional[int] = None
    lastOpType: Optional[str] = None
    deletedAtVersion: Optional[int] = None


class TreePayload(BaseModel):
    nodes: List[DownstreamNode]


class DiffRequest(BaseModel):
    base_tree: TreePayload
    current_tree: TreePayload
    baseVersion: Optional[str] = "v1"
    currentVersion: Optional[str] = "v1"


class DiffOp(BaseModel):
    opId: str
    type: Literal["add", "delete", "revise"]
    nodeId: str
    parentId: Optional[str] = None
    insertAfterId: Optional[str] = None
    position: Optional[int] = None
    label: Optional[str] = None
    content: Optional[str] = None
    before: Optional[str] = None
    after: Optional[str] = None
    subtree: Optional[bool] = None


class SuppressedOp(BaseModel):
    opId: str
    reason: str
    ancestorNodeId: Optional[str] = None


class DiffResponse(BaseModel):
    meta: Dict[str, Any]
    ops: List[DiffOp]
    suppressedOps: List[SuppressedOp]


class CompileRequest(BaseModel):
    original_contract_text: str
    base_tree: TreePayload
    normalized_diff: DiffResponse


class CompileResponse(BaseModel):
    normalized_diff: DiffResponse
    draft_v1: str
    ordered_clause_ids: List[str]
    compile_report: List[Dict[str, Any]]


class FinalizeRequest(BaseModel):
    original_contract_text: str
    draft_v1: str
    normalized_diff: DiffResponse
    compile_report: List[Dict[str, Any]]


class FinalizeResponse(BaseModel):
    final_text: str
    change_report: List[Dict[str, Any]]


class UpstreamBuildTemplateRequest(BaseModel):
    contract_text: str
    template_name: Optional[str] = None
    save_artifacts: bool = True


class UpstreamBuildTemplateResponse(BaseModel):
    template_id: str
    template_label: str
    stage_a_nodes: List[Dict[str, Any]]
    stage_b_nodes: List[Dict[str, Any]]
    merged_nodes: List[Dict[str, Any]]
    artifact_paths: Dict[str, str]


app = FastAPI(title="Semantic Embedding Service", version="0.1.0")


@app.exception_handler(RuntimeError)
def runtime_error_handler(request, exc: RuntimeError):
    return JSONResponse(status_code=500, content={"detail": str(exc)})


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
_model: SentenceTransformer | None = None
_events_store: List[EventRecord] = []
_monitoring_events_store: List[MonitoringEventRecord] = []
_monitoring_event_ids: set[str] = set()
_monitoring_session_files: Dict[str, Path] = {}
_monitoring_lock = Lock()
XHUB_API_URL = os.getenv("XHUB_API_URL", "https://api3.xhub.chat/v1/chat/completions")
XHUB_FINALIZE_MODEL = os.getenv("XHUB_FINALIZE_MODEL", "claude-3-5-sonnet-20241022-thinking")
XHUB_STAGEA_MODEL = os.getenv("XHUB_STAGEA_MODEL", "claude-3-7-sonnet-20250219-thinking")
XHUB_STAGEB_MODEL = os.getenv("XHUB_STAGEB_MODEL", "claude-3-7-sonnet-20250219-thinking")
_ROOT_DIR = Path(__file__).resolve().parents[1]
_MONITORING_DIR = _ROOT_DIR / ".runtime" / "monitoring"
_MONITORING_BY_PARTICIPANT_DIR = _MONITORING_DIR / "by_participant"

FINALIZE_SYSTEM_PROMPT = """
You are a strict legal text mapping engine.
You receive:
1) original_contract_text
2) draft_v1 (deterministic applied result)
3) normalized_diff
4) compile_report

Your task is strict mapping only:
- Output final_text aligned with draft_v1.
- Do NOT introduce any extra business changes beyond normalized_diff.
- Do NOT rewrite untouched clauses.
- Keep legal wording stable and conservative.
- Preserve Stage D clause order exactly; never append added clauses to document end if draft_v1 places them under a parent.

Output strict JSON only:
{
  "final_text": "string",
  "change_report": [
    {
      "opId": "string",
      "changeType": "add|delete|revise",
      "summary": "string",
      "affectedSections": ["string"]
    }
  ]
}
""".strip()

STAGE_A_SYSTEM_PROMPT = """
You are a legal-tech contract structuring engine.
Your task is Stage A only: transform unstructured contract text into stable structural JSON nodes.

Hard constraints:
1) LOSSLESS CONTENT:
   - "content" must be a verbatim copy from source text.
   - Do not summarize, rewrite, normalize, or correct typos.
2) HIERARCHICAL INTEGRITY:
   - Determine parentId using explicit numbering first (e.g. Chapter/Article, 1/1.1/1.1.1, (1), a), Section 1.2).
   - If numbering jumps levels, attach to nearest valid ancestor.
   - Unnumbered paragraphs should attach to nearest preceding numbered clause.
3) STRUCTURE-ONLY OUTPUT:
   - Output only these fields:
     id, label, content, type, parentId, timePhase
   - Never output risk/references/actions.
4) FIELD ALIGNMENT:
   - type: "main" | "sub"
   - timePhase: "pre_sign" | "effective" | "execution" | "acceptance" | "termination" | "post_termination"

Output strictly valid JSON only:
{
  "nodes": [
    {
      "id": "string",
      "label": "string",
      "content": "string",
      "type": "main|sub",
      "parentId": "root|string",
      "timePhase": "pre_sign|effective|execution|acceptance|termination|post_termination"
    }
  ]
}
""".strip()

STAGE_B_SYSTEM_PROMPT = """
You are a contract risk and cross-reference reasoning engine (Stage B).

Objective:
Given nodes_stage_a and original_contract_text, output for each node:
- references
- riskLevel
- actions

Non-Negotiable Constraints:
1) IMMUTABLE STRUCTURE: Use existing node ids only.
2) COMPLETE COVERAGE: Output one and only one record per input node id.
3) NO-RISK POLICY: If riskLevel is none, actions must be [].
4) ACTION EXCLUSIVITY: If delete exists, do not output revise/add_clause for same node.
5) REFERENCE VALIDITY: references must only contain existing node ids and must not self-reference.
6) CONSERVATIVE INFERENCE: If uncertain, use riskLevel none.

Output strict JSON only:
{
  "nodes": [
    {
      "id": "string",
      "references": ["string"],
      "riskLevel": "none|low|medium|high",
      "actions": [
        {
          "id": "string",
          "type": "delete|revise|add_clause",
          "status": "pending",
          "suggestionText": "string",
          "supplementDraft": "string"
        }
      ]
    }
  ]
}
""".strip()


def _sanitize_filename_token(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "_", value).strip("._-")
    return cleaned or "unknown"


def _session_start_stamp(ts_ms: int) -> str:
    dt = datetime.fromtimestamp(max(0, ts_ms) / 1000, timezone.utc)
    return dt.strftime("%Y%m%d_%H%M%S")


def _participant_file_for_event(event: MonitoringEventRecord) -> Path:
    session_id = event.session_id or "session"
    existing = _monitoring_session_files.get(session_id)
    if existing is not None:
        return existing
    participant = _sanitize_filename_token(event.participant_id or "unknown")
    session = _sanitize_filename_token(session_id)
    stamp = _session_start_stamp(event.ts)
    path = _MONITORING_BY_PARTICIPANT_DIR / f"{participant}_{stamp}_{session}.ndjson"
    _monitoring_session_files[session_id] = path
    return path


def _load_monitoring_events_from_disk() -> None:
    if not _MONITORING_BY_PARTICIPANT_DIR.exists():
        return
    try:
        files = sorted(_MONITORING_BY_PARTICIPANT_DIR.glob("*.ndjson"))
    except Exception:
        return
    for path in files:
        try:
            for raw in path.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    event = MonitoringEventRecord.model_validate(data)
                except Exception:
                    continue
                if event.id in _monitoring_event_ids:
                    continue
                _monitoring_event_ids.add(event.id)
                _monitoring_events_store.append(event)
                if event.session_id and event.session_id not in _monitoring_session_files:
                    _monitoring_session_files[event.session_id] = path
        except Exception:
            # Skip corrupted files and continue loading the rest.
            continue


def _append_monitoring_events_to_disk(events: List[MonitoringEventRecord]) -> None:
    if not events:
        return
    _MONITORING_BY_PARTICIPANT_DIR.mkdir(parents=True, exist_ok=True)
    grouped: Dict[Path, List[MonitoringEventRecord]] = {}
    for event in events:
        target = _participant_file_for_event(event)
        grouped.setdefault(target, []).append(event)
    for path, chunk in grouped.items():
        with path.open("a", encoding="utf-8") as fh:
            for event in chunk:
                fh.write(json.dumps(event.model_dump(), ensure_ascii=False))
                fh.write("\n")
            fh.flush()


@app.on_event("startup")
def startup_event():
    global _model
    if SentenceTransformer is not None and _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    with _monitoring_lock:
        _load_monitoring_events_from_disk()


@app.get("/health")
def health():
    return {
        "ok": _model is not None,
        "model": MODEL_NAME,
        "events": len(_events_store),
        "monitoring_events": len(_monitoring_events_store),
        "embedding_available": SentenceTransformer is not None,
    }


@app.post("/embed", response_model=EmbedResponse)
def embed(payload: EmbedRequest):
    texts = payload.texts or []
    if len(texts) == 0:
        return EmbedResponse(embeddings=[])

    if SentenceTransformer is None:
        raise RuntimeError("SentenceTransformer dependency is unavailable in this Python runtime.")
    if _model is None:
        raise RuntimeError("SentenceTransformer model is not initialized.")

    vectors = _model.encode(
        texts,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    return EmbedResponse(embeddings=vectors.tolist())


def _post_json(url: str, payload: dict[str, Any], api_key: str, timeout: int = 180) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        url,
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Network error: {exc}") from exc


def _extract_json_block(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return stripped
    fence_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", stripped, flags=re.DOTALL | re.IGNORECASE)
    if fence_match:
        return fence_match.group(1).strip()
    obj_match = re.search(r"(\{.*\})", stripped, flags=re.DOTALL)
    if obj_match:
        return obj_match.group(1).strip()
    raise ValueError("No JSON object found in model response.")


def _xhub_json_completion(
    model: str,
    system_prompt: str,
    user_content: str,
    max_tokens: int = 9000,
    temperature: float = 0.0,
) -> dict[str, Any]:
    api_key = os.getenv("XHUB_API_KEY")
    if not api_key:
        raise RuntimeError("Missing XHUB_API_KEY for upstream model call.")
    req_payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    response = _post_json(XHUB_API_URL, req_payload, api_key, timeout=240)
    if "error" in response:
        raise RuntimeError(f"Upstream API error: {json.dumps(response['error'], ensure_ascii=False)}")
    try:
        content = response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected upstream response shape: {json.dumps(response, ensure_ascii=False)}") from exc
    return json.loads(_extract_json_block(content))


def _sanitize_template_name(value: Optional[str]) -> Tuple[str, str]:
    base = (value or "uploaded_template").strip()
    if not base:
        base = "uploaded_template"
    safe = re.sub(r"[^a-zA-Z0-9_-]+", "_", base).strip("_")
    if not safe:
        safe = "uploaded_template"
    return safe, base


def _normalize_stage_b_nodes(stage_a_nodes: List[Dict[str, Any]], stage_b_nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out_by_id: Dict[str, Dict[str, Any]] = {}
    for node in stage_b_nodes:
        node_id = node.get("id")
        if not isinstance(node_id, str) or not node_id:
            continue
        refs = node.get("references")
        actions = node.get("actions")
        risk = node.get("riskLevel")
        out_by_id[node_id] = {
            "id": node_id,
            "references": refs if isinstance(refs, list) else [],
            "riskLevel": risk if risk in {"none", "low", "medium", "high"} else "none",
            "actions": actions if isinstance(actions, list) else [],
        }
    out: List[Dict[str, Any]] = []
    valid_ids = {n.get("id") for n in stage_a_nodes if isinstance(n.get("id"), str)}
    for node in stage_a_nodes:
        node_id = node.get("id")
        if not isinstance(node_id, str) or not node_id:
            continue
        item = out_by_id.get(node_id, {"id": node_id, "references": [], "riskLevel": "none", "actions": []})
        item["references"] = [
            ref for ref in item.get("references", [])
            if isinstance(ref, str) and ref in valid_ids and ref != node_id
        ][:5]
        out.append(item)
    return out


def _merge_stage_nodes(stage_a_nodes: List[Dict[str, Any]], stage_b_nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    b_by_id = {n.get("id"): n for n in stage_b_nodes if isinstance(n.get("id"), str)}
    merged: List[Dict[str, Any]] = []
    for a in stage_a_nodes:
        node_id = a.get("id")
        b = b_by_id.get(node_id, {})
        merged.append(
            {
                "id": node_id,
                "label": a.get("label", ""),
                "content": a.get("content", ""),
                "type": a.get("type", "sub"),
                "parentId": a.get("parentId", "root"),
                "timePhase": a.get("timePhase", "execution"),
                "references": b.get("references", []),
                "riskLevel": b.get("riskLevel", "none"),
                "actions": b.get("actions", []),
            }
        )
    return merged


@app.post("/downstream/events", response_model=EventBatchResponse)
def append_events(payload: EventBatchRequest):
    accepted = 0
    for event in payload.events:
        _events_store.append(event)
        accepted += 1
    return EventBatchResponse(accepted=accepted, total=len(payload.events), stored=len(_events_store))


@app.get("/downstream/events")
def list_events():
    return {"events": [event.model_dump() for event in _events_store], "total": len(_events_store)}


@app.post("/monitoring/events/batch", response_model=MonitoringEventBatchResponse)
def append_monitoring_events(payload: MonitoringEventBatchRequest):
    accepted = 0
    deduplicated = 0
    to_persist: List[MonitoringEventRecord] = []
    with _monitoring_lock:
        for event in payload.events:
            if event.id in _monitoring_event_ids:
                deduplicated += 1
                continue
            _monitoring_event_ids.add(event.id)
            _monitoring_events_store.append(event)
            to_persist.append(event)
            accepted += 1
        _append_monitoring_events_to_disk(to_persist)
        stored = len(_monitoring_events_store)
    return MonitoringEventBatchResponse(
        accepted=accepted,
        total=len(payload.events),
        stored=stored,
        deduplicated=deduplicated,
    )


@app.get("/monitoring/events")
def list_monitoring_events(
    since_ts: Optional[int] = Query(default=None),
    limit: int = Query(default=3000, ge=1, le=10000),
    participant_id: Optional[str] = Query(default=None),
    session_id: Optional[str] = Query(default=None),
    study_id: Optional[str] = Query(default=None),
):
    with _monitoring_lock:
        events = _monitoring_events_store
        if since_ts is not None:
            events = [event for event in events if event.ts > since_ts]
        if participant_id:
            events = [event for event in events if event.participant_id == participant_id]
        if session_id:
            events = [event for event in events if event.session_id == session_id]
        if study_id:
            events = [event for event in events if event.study_id == study_id]
        sliced = events[-limit:]
        data = [event.model_dump() for event in sliced]
    return {"events": data, "total": len(data)}


@app.post("/upstream/build-template", response_model=UpstreamBuildTemplateResponse)
def build_upstream_template(payload: UpstreamBuildTemplateRequest):
    contract_text = (payload.contract_text or "").strip()
    if not contract_text:
        raise RuntimeError("contract_text is empty.")

    template_id, template_label = _sanitize_template_name(payload.template_name)
    stage_a_resp = _xhub_json_completion(
        model=XHUB_STAGEA_MODEL,
        system_prompt=STAGE_A_SYSTEM_PROMPT,
        user_content=(
            "Run Stage A structuring for the contract below. Output strictly valid JSON only.\n\n"
            f"{contract_text}"
        ),
        max_tokens=9000,
        temperature=0.1,
    )
    stage_a_nodes = stage_a_resp.get("nodes")
    if not isinstance(stage_a_nodes, list):
        raise RuntimeError("Stage A output must include a top-level nodes array.")

    stage_b_resp = _xhub_json_completion(
        model=XHUB_STAGEB_MODEL,
        system_prompt=STAGE_B_SYSTEM_PROMPT,
        user_content=(
            "Run Stage B enrichment. Output JSON only.\n\n"
            f"{json.dumps({'nodes_stage_a': stage_a_nodes, 'original_contract_text': contract_text}, ensure_ascii=False)}"
        ),
        max_tokens=10000,
        temperature=0.0,
    )
    raw_stage_b_nodes = stage_b_resp.get("nodes")
    if not isinstance(raw_stage_b_nodes, list):
        raise RuntimeError("Stage B output must include a top-level nodes array.")
    stage_b_nodes = _normalize_stage_b_nodes(stage_a_nodes, raw_stage_b_nodes)
    merged_nodes = _merge_stage_nodes(stage_a_nodes, stage_b_nodes)

    artifact_paths = {"stage_a": "", "stage_b": "", "merged": ""}
    if payload.save_artifacts:
        docs_dir = Path(__file__).resolve().parents[1] / "docs"
        docs_dir.mkdir(parents=True, exist_ok=True)
        stage_a_path = docs_dir / f"{template_id}.stage_a.json"
        stage_b_path = docs_dir / f"{template_id}.stage_b.json"
        merged_path = docs_dir / f"{template_id}.stage_ab_merged.json"
        stage_a_path.write_text(json.dumps({"nodes": stage_a_nodes}, ensure_ascii=False, indent=2), encoding="utf-8")
        stage_b_path.write_text(json.dumps({"nodes": stage_b_nodes}, ensure_ascii=False, indent=2), encoding="utf-8")
        merged_path.write_text(
            json.dumps(
                {
                    "meta": {
                        "templateId": template_id,
                        "stageA": str(stage_a_path.relative_to(Path(__file__).resolve().parents[1])),
                        "stageB": str(stage_b_path.relative_to(Path(__file__).resolve().parents[1])),
                        "mergedAt": datetime.now(timezone.utc).isoformat(),
                    },
                    "nodes": merged_nodes,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        artifact_paths = {
            "stage_a": str(stage_a_path),
            "stage_b": str(stage_b_path),
            "merged": str(merged_path),
        }

    return UpstreamBuildTemplateResponse(
        template_id=template_id,
        template_label=template_label,
        stage_a_nodes=stage_a_nodes,
        stage_b_nodes=stage_b_nodes,
        merged_nodes=merged_nodes,
        artifact_paths=artifact_paths,
    )


def _parent_map(nodes: List[DownstreamNode]) -> Dict[str, Optional[str]]:
    return {node.id: node.parentId for node in nodes}


def _has_ancestor(node_id: str, ancestor_id: str, parent_map: Dict[str, Optional[str]]) -> bool:
    current = parent_map.get(node_id)
    seen: set[str] = set()
    while current:
        if current == ancestor_id:
            return True
        if current in seen:
            return False
        seen.add(current)
        current = parent_map.get(current)
    return False


def _depth(node_id: str, parent_map: Dict[str, Optional[str]]) -> int:
    d = 0
    current = parent_map.get(node_id)
    seen: set[str] = set()
    while current:
        if current in seen:
            break
        seen.add(current)
        d += 1
        current = parent_map.get(current)
    return d


def _candidate_ids(nodes: List[DownstreamNode]) -> set[str]:
    touched = {
        node.id
        for node in nodes
        if node.touched
        or node.subtreeDirty
        or node.deletedAtVersion is not None
        or node.lastOpType in {"add", "delete", "revise"}
    }
    return touched


@app.post("/downstream/diff", response_model=DiffResponse)
def generate_diff(payload: DiffRequest):
    base_nodes = payload.base_tree.nodes
    current_nodes = payload.current_tree.nodes
    base_by_id = {node.id: node for node in base_nodes}
    current_by_id = {node.id: node for node in current_nodes}
    base_parent = _parent_map(base_nodes)
    current_parent = _parent_map(current_nodes)
    combined_parent = {**base_parent, **current_parent}

    candidates = _candidate_ids(base_nodes) | _candidate_ids(current_nodes)
    if not candidates:
        candidates = set(base_by_id.keys()) | set(current_by_id.keys())

    ops: List[DiffOp] = []
    op_seq = 1

    # Additions
    for node in current_nodes:
        if node.id in base_by_id or node.id not in candidates:
            continue
        siblings = [n for n in current_nodes if n.parentId == node.parentId]
        position = next((idx for idx, sib in enumerate(siblings) if sib.id == node.id), 0)
        insert_after_id = siblings[position - 1].id if position > 0 else None
        ops.append(
            DiffOp(
                opId=f"op_{op_seq:03d}",
                type="add",
                nodeId=node.id,
                parentId=node.parentId,
                insertAfterId=insert_after_id,
                position=position,
                label=node.label,
                content=node.content,
            )
        )
        op_seq += 1

    # Deletions
    for node in base_nodes:
        if node.id in current_by_id or node.id not in candidates:
            continue
        ops.append(
            DiffOp(
                opId=f"op_{op_seq:03d}",
                type="delete",
                nodeId=node.id,
                subtree=True,
            )
        )
        op_seq += 1

    # Revisions
    for node in current_nodes:
        base_node = base_by_id.get(node.id)
        if not base_node or node.id not in candidates:
            continue
        if base_node.content != node.content:
            ops.append(
                DiffOp(
                    opId=f"op_{op_seq:03d}",
                    type="revise",
                    nodeId=node.id,
                    before=base_node.content,
                    after=node.content,
                )
            )
            op_seq += 1

    delete_ops = [op for op in ops if op.type == "delete"]
    delete_ops.sort(key=lambda op: _depth(op.nodeId, combined_parent))
    deleted_ancestors: set[str] = set()
    suppressed: List[SuppressedOp] = []
    normalized: List[DiffOp] = []

    for op in sorted(ops, key=lambda x: (0 if x.type == "delete" else 1, _depth(x.nodeId, combined_parent))):
        ancestor_hit = next((a for a in deleted_ancestors if _has_ancestor(op.nodeId, a, combined_parent)), None)
        if ancestor_hit:
            suppressed.append(
                SuppressedOp(
                    opId=op.opId,
                    reason="discarded_by_ancestor_delete",
                    ancestorNodeId=ancestor_hit,
                )
            )
            continue
        if op.type == "delete":
            if op.nodeId in deleted_ancestors:
                suppressed.append(
                    SuppressedOp(
                        opId=op.opId,
                        reason="discarded_by_ancestor_delete",
                        ancestorNodeId=op.nodeId,
                    )
                )
                continue
            deleted_ancestors.add(op.nodeId)
        normalized.append(op)

    return DiffResponse(
        meta={
            "baseVersion": payload.baseVersion,
            "currentVersion": payload.currentVersion,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
        ops=normalized,
        suppressedOps=suppressed,
    )


def _build_ordered_children(nodes: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    children: Dict[str, List[str]] = {}
    for node in nodes:
        nid = node.get("id")
        if not nid:
            continue
        parent = node.get("parentId")
        key = parent if parent else "__TOP__"
        children.setdefault(key, []).append(nid)
    return children


def _collect_subtree_ids(node_id: str, children: Dict[str, List[str]]) -> set[str]:
    remove_ids = {node_id}
    stack = [node_id]
    while stack:
        cur = stack.pop()
        for child in children.get(cur, []):
            if child not in remove_ids:
                remove_ids.add(child)
                stack.append(child)
    return remove_ids


def _remove_ids_from_children(children: Dict[str, List[str]], remove_ids: set[str]) -> Dict[str, List[str]]:
    next_children: Dict[str, List[str]] = {}
    for key, ids in children.items():
        if key in remove_ids:
            continue
        filtered = [nid for nid in ids if nid not in remove_ids]
        if filtered:
            next_children[key] = filtered
    return next_children


def _ordered_clause_ids(nodes_by_id: Dict[str, Dict[str, Any]], children: Dict[str, List[str]]) -> List[str]:
    ordered: List[str] = []
    visited: set[str] = set()

    def dfs(nid: str):
        if nid in visited:
            return
        visited.add(nid)
        if nid != "root":
            ordered.append(nid)
        for child in children.get(nid, []):
            if child == nid:
                continue
            if child in nodes_by_id:
                dfs(child)

    for rid in children.get("root", []):
        if rid in nodes_by_id:
            dfs(rid)

    for rid in children.get("__TOP__", []):
        if rid in nodes_by_id and rid != "root":
            dfs(rid)

    for nid in list(nodes_by_id.keys()):
        if nid != "root":
            dfs(nid)

    return ordered


def _build_draft_text_from_order(nodes_by_id: Dict[str, Dict[str, Any]], ordered_ids: List[str]) -> str:
    lines: List[str] = []
    for nid in ordered_ids:
        node = nodes_by_id.get(nid)
        if not node:
            continue
        label = node.get("label", "")
        content = node.get("content", "")
        lines.append(f"{label}\n{content}".strip())
    return "\n\n".join([line for line in lines if line.strip()])


@app.post("/downstream/compile", response_model=CompileResponse)
def compile_draft(payload: CompileRequest):
    base_nodes = [node.model_dump() for node in payload.base_tree.nodes]
    nodes_by_id: Dict[str, Dict[str, Any]] = {node["id"]: deepcopy(node) for node in base_nodes}
    children = _build_ordered_children(base_nodes)
    report: List[Dict[str, Any]] = []

    for op in payload.normalized_diff.ops:
        if op.type == "delete":
            if op.nodeId not in nodes_by_id:
                report.append({"opId": op.opId, "status": "skipped", "reason": "node_not_found"})
                continue
            remove_ids = _collect_subtree_ids(op.nodeId, children)
            for rid in remove_ids:
                nodes_by_id.pop(rid, None)
            children = _remove_ids_from_children(children, remove_ids)
            report.append({"opId": op.opId, "status": "applied", "type": "delete"})
        elif op.type == "revise":
            node = nodes_by_id.get(op.nodeId)
            if not node:
                report.append({"opId": op.opId, "status": "skipped", "reason": "node_not_found"})
                continue
            node["content"] = op.after or node.get("content", "")
            report.append({"opId": op.opId, "status": "applied", "type": "revise"})
        elif op.type == "add":
            if op.nodeId in nodes_by_id:
                report.append({"opId": op.opId, "status": "skipped", "reason": "node_exists"})
                continue
            parent_key = op.parentId if op.parentId else "__TOP__"
            nodes_by_id[op.nodeId] = {
                "id": op.nodeId,
                "label": op.label or op.nodeId,
                "content": op.content or "",
                "parentId": op.parentId,
                "type": "sub",
            }
            sibling_ids = children.get(parent_key, [])
            insert_index = len(sibling_ids)
            if op.insertAfterId and op.insertAfterId in sibling_ids:
                insert_index = sibling_ids.index(op.insertAfterId) + 1
            elif op.position is not None:
                insert_index = max(0, min(op.position, len(sibling_ids)))
            sibling_ids = sibling_ids[:insert_index] + [op.nodeId] + sibling_ids[insert_index:]
            children[parent_key] = sibling_ids
            report.append({"opId": op.opId, "status": "applied", "type": "add"})

    ordered_ids = _ordered_clause_ids(nodes_by_id, children)
    draft_v1 = _build_draft_text_from_order(nodes_by_id, ordered_ids)
    return CompileResponse(
        normalized_diff=payload.normalized_diff,
        draft_v1=draft_v1,
        ordered_clause_ids=ordered_ids,
        compile_report=report,
    )


@app.post("/downstream/finalize", response_model=FinalizeResponse)
def finalize_text(payload: FinalizeRequest):
    api_key = os.getenv("XHUB_API_KEY")
    if not api_key:
        raise RuntimeError("Missing XHUB_API_KEY for downstream finalize model call.")

    user_payload = {
        "original_contract_text": payload.original_contract_text,
        "draft_v1": payload.draft_v1,
        "normalized_diff": payload.normalized_diff.model_dump(),
        "compile_report": payload.compile_report,
    }
    req_payload = {
        "model": XHUB_FINALIZE_MODEL,
        "messages": [
            {"role": "system", "content": FINALIZE_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Apply strict mapping finalize. Return JSON only.\n\n"
                    f"{json.dumps(user_payload, ensure_ascii=False)}"
                ),
            },
        ],
        "temperature": 0,
        "max_tokens": 8000,
    }
    response = _post_json(XHUB_API_URL, req_payload, api_key, timeout=240)
    if "error" in response:
        raise RuntimeError(f"Finalize API error: {json.dumps(response['error'], ensure_ascii=False)}")
    try:
        content = response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected finalize response shape: {json.dumps(response, ensure_ascii=False)}") from exc
    parsed = json.loads(_extract_json_block(content))
    final_text = parsed.get("final_text")
    change_report = parsed.get("change_report")
    if not isinstance(final_text, str):
        raise RuntimeError("Finalize output missing string field: final_text")
    if not isinstance(change_report, list):
        raise RuntimeError("Finalize output missing list field: change_report")
    return FinalizeResponse(final_text=final_text, change_report=change_report)
