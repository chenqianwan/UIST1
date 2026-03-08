#!/usr/bin/env python3
"""Run Stage A contract structuring via xhub chat completions API.

Usage:
  python python/run_stage_a.py docs/simple1.txt
  python python/run_stage_a.py docs/simple1.txt --output docs/simple1.stage_a.json
  XHUB_API_KEY=... python python/run_stage_a.py docs/simple1.txt --model claude-3-5-sonnet-20241022
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib import error, request


DEFAULT_API_URL = "https://api3.xhub.chat/v1/chat/completions"
DEFAULT_MODEL = "claude-3-7-sonnet-20250219-thinking"

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

Output strictly valid JSON only (no prose, no markdown fences):
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Stage A structuring via xhub API.")
    parser.add_argument("contract_path", type=Path, help="Path to input contract text file.")
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output JSON path (default: <contract_path>.stage_a.json).",
    )
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Model name (default: {DEFAULT_MODEL}).")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help=f"API URL (default: {DEFAULT_API_URL}).")
    parser.add_argument("--max-tokens", type=int, default=12000, help="Maximum completion tokens.")
    parser.add_argument("--temperature", type=float, default=0.1, help="Sampling temperature.")
    parser.add_argument(
        "--chunk-max-chars",
        type=int,
        default=5200,
        help="Maximum characters per Stage A chunk before splitting.",
    )
    return parser.parse_args()


def _extract_json_block(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("{"):
        try:
            parsed = json.loads(stripped)
            if isinstance(parsed, dict):
                return stripped
        except Exception:
            pass

    fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", stripped, flags=re.DOTALL | re.IGNORECASE)
    candidate_text = fence_match.group(1).strip() if fence_match else stripped

    decoder = json.JSONDecoder()
    first_valid_obj: Optional[str] = None
    for idx, ch in enumerate(candidate_text):
        if ch != "{":
            continue
        try:
            parsed_obj, end_idx = decoder.raw_decode(candidate_text, idx)
        except Exception:
            continue
        if not isinstance(parsed_obj, dict):
            continue
        block = candidate_text[idx:end_idx].strip()
        if first_valid_obj is None:
            first_valid_obj = block
        if isinstance(parsed_obj.get("nodes"), list):
            return block

    if first_valid_obj is not None:
        return first_valid_obj

    obj_match = re.search(r"(\{.*\})", candidate_text, flags=re.DOTALL)
    if obj_match:
        block = obj_match.group(1).strip()
        json.loads(block)
        return block
    raise ValueError("No JSON object found in model response.")


def _post_json(url: str, payload: dict[str, Any], api_key: str) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=180) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Network error: {exc}") from exc


def _split_contract_text(contract_text: str, chunk_max_chars: int) -> List[str]:
    text = contract_text.strip()
    if not text:
        return []
    if len(text) <= chunk_max_chars:
        return [text]

    lines = text.splitlines()
    chunks: List[str] = []
    buffer: List[str] = []
    buffer_len = 0
    boundary_re = re.compile(r"^\s*(\d+(\.\d+)*|第[一二三四五六七八九十百零0-9]+条)\b")

    def flush_buffer():
        nonlocal buffer, buffer_len
        if not buffer:
            return
        chunk = "\n".join(buffer).strip()
        if chunk:
            chunks.append(chunk)
        buffer = []
        buffer_len = 0

    for line in lines:
        line_len = len(line) + 1
        is_boundary = bool(boundary_re.match(line))
        if buffer and (buffer_len + line_len > chunk_max_chars) and is_boundary:
            flush_buffer()
        if buffer and (buffer_len + line_len > chunk_max_chars) and not is_boundary:
            flush_buffer()
        buffer.append(line)
        buffer_len += line_len
    flush_buffer()
    return chunks if chunks else [text]


def _build_stage_a_payload(contract_text: str, args: argparse.Namespace) -> Dict[str, Any]:
    return {
        "model": args.model,
        "messages": [
            {"role": "system", "content": STAGE_A_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Run Stage A structuring for the contract below. "
                    "Output strictly valid JSON only.\n\n"
                    f"{contract_text}"
                ),
            },
        ],
        "max_tokens": args.max_tokens,
        "temperature": args.temperature,
    }


def _parse_stage_a_nodes(response: Dict[str, Any]) -> List[Dict[str, Any]]:
    if "error" in response:
        raise RuntimeError(f"API error: {json.dumps(response['error'], ensure_ascii=False)}")
    try:
        content = response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected response shape: {json.dumps(response, ensure_ascii=False)}") from exc

    json_block = _extract_json_block(content)
    parsed = json.loads(json_block)
    nodes = parsed.get("nodes") if isinstance(parsed, dict) else None
    if not isinstance(nodes, list):
        raise RuntimeError("Stage A output must be a JSON object with a top-level 'nodes' array.")
    return nodes


def _merge_chunk_nodes(chunk_nodes: List[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    merged: List[Dict[str, Any]] = []
    used_ids: set[str] = set()
    root_id = "root"
    root_seen = False

    root_template = {
        "id": root_id,
        "label": "Contract",
        "content": "Contract",
        "type": "main",
        "parentId": None,
        "timePhase": "pre_sign",
    }

    def unique_id(base: str) -> str:
        if base not in used_ids:
            return base
        idx = 1
        while f"{base}__{idx}" in used_ids:
            idx += 1
        return f"{base}__{idx}"

    for nodes in chunk_nodes:
        id_map: Dict[str, str] = {}
        for node in nodes:
            old_id = str(node.get("id", "")).strip() or "node"
            if old_id == root_id:
                id_map[old_id] = root_id
                if not root_seen:
                    root_seen = True
                    root_template["label"] = str(node.get("label") or root_template["label"])
                    root_template["content"] = str(node.get("content") or root_template["content"])
                continue
            new_id = unique_id(old_id)
            id_map[old_id] = new_id
            used_ids.add(new_id)

        for node in nodes:
            old_id = str(node.get("id", "")).strip() or "node"
            if old_id == root_id:
                continue
            parent_old = node.get("parentId")
            parent_old_str = str(parent_old).strip() if parent_old is not None else root_id
            parent_new = id_map.get(parent_old_str, root_id)
            if parent_new == id_map.get(old_id):
                parent_new = root_id
            merged.append(
                {
                    "id": id_map[old_id],
                    "label": str(node.get("label", "")),
                    "content": str(node.get("content", "")),
                    "type": "main" if str(node.get("type", "sub")) == "main" else "sub",
                    "parentId": parent_new,
                    "timePhase": str(node.get("timePhase", "execution")),
                }
            )

    used_ids.add(root_id)
    return [root_template, *merged]


def main() -> int:
    args = parse_args()
    api_key = os.getenv("XHUB_API_KEY")
    if not api_key:
        print("Missing XHUB_API_KEY environment variable.", file=sys.stderr)
        return 1

    if not args.contract_path.exists():
        print(f"Contract file not found: {args.contract_path}", file=sys.stderr)
        return 1

    contract_text = args.contract_path.read_text(encoding="utf-8")
    if not contract_text.strip():
        print(f"Contract file is empty: {args.contract_path}", file=sys.stderr)
        return 1

    output_path = args.output or args.contract_path.with_suffix(args.contract_path.suffix + ".stage_a.json")
    chunks = _split_contract_text(contract_text, args.chunk_max_chars)
    chunk_results: List[List[Dict[str, Any]]] = []
    for idx, chunk_text in enumerate(chunks, start=1):
        payload = _build_stage_a_payload(chunk_text, args)
        response = _post_json(args.api_url, payload, api_key)
        nodes = _parse_stage_a_nodes(response)
        chunk_results.append(nodes)
        print(f"Chunk {idx}/{len(chunks)} parsed nodes: {len(nodes)}")

    merged_nodes = _merge_chunk_nodes(chunk_results)
    parsed = {"nodes": merged_nodes}

    output_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Stage A output saved: {output_path}")
    print(f"Nodes: {len(merged_nodes)}")
    print(f"Chunks: {len(chunks)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
