from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import json
import os
import re
from typing import Any, Dict, List, Literal, Optional, Tuple
from urllib import error, request

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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


app = FastAPI(title="Semantic Embedding Service", version="0.1.0")
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
XHUB_API_URL = os.getenv("XHUB_API_URL", "https://api3.xhub.chat/v1/chat/completions")
XHUB_FINALIZE_MODEL = os.getenv("XHUB_FINALIZE_MODEL", "claude-3-5-sonnet-20241022-thinking")

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


@app.on_event("startup")
def startup_event():
    global _model
    if SentenceTransformer is not None and _model is None:
        _model = SentenceTransformer(MODEL_NAME)


@app.get("/health")
def health():
    return {
        "ok": _model is not None,
        "model": MODEL_NAME,
        "events": len(_events_store),
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
