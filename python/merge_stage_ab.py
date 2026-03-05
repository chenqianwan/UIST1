#!/usr/bin/env python3
"""Merge Stage A and Stage B outputs into one intermediate artifact.

Usage:
  python python/merge_stage_ab.py docs/simple1.stage_a.json docs/simple1.stage_b.json
  python python/merge_stage_ab.py docs/simple1.stage_a.json docs/simple1.stage_b.json --output docs/simple1.stage_ab_merged.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Merge Stage A + Stage B JSON into one artifact.")
    parser.add_argument("stage_a_path", type=Path, help="Path to Stage A JSON.")
    parser.add_argument("stage_b_path", type=Path, help="Path to Stage B JSON.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("docs/simple1.stage_ab_merged.json"),
        help="Output merged JSON path (default: docs/simple1.stage_ab_merged.json).",
    )
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("nodes"), list):
        raise ValueError(f"Invalid schema in {path}: missing top-level nodes[]")
    return data


def main() -> int:
    args = parse_args()
    a = load_json(args.stage_a_path)
    b = load_json(args.stage_b_path)

    a_nodes: list[dict[str, Any]] = a["nodes"]
    b_nodes: list[dict[str, Any]] = b["nodes"]

    b_by_id = {n.get("id"): n for n in b_nodes if isinstance(n, dict) and n.get("id")}
    a_ids = [n.get("id") for n in a_nodes]
    b_ids = [n.get("id") for n in b_nodes]

    a_id_set = {i for i in a_ids if i}
    b_id_set = {i for i in b_ids if i}
    missing_in_b = sorted(a_id_set - b_id_set)
    extra_in_b = sorted(b_id_set - a_id_set)

    merged_nodes: list[dict[str, Any]] = []
    for node_a in a_nodes:
        node_id = node_a.get("id")
        node_b = b_by_id.get(node_id, {})
        merged_nodes.append(
            {
                "id": node_a.get("id"),
                "label": node_a.get("label"),
                "content": node_a.get("content"),
                "type": node_a.get("type"),
                "parentId": node_a.get("parentId"),
                "timePhase": node_a.get("timePhase"),
                "references": node_b.get("references", []),
                "riskLevel": node_b.get("riskLevel", "none"),
                "actions": node_b.get("actions", []),
            }
        )

    output = {
        "meta": {
            "stageA": str(args.stage_a_path),
            "stageB": str(args.stage_b_path),
            "nodeCount": len(merged_nodes),
            "missingInStageB": missing_in_b,
            "extraInStageB": extra_in_b,
        },
        "nodes": merged_nodes,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Merged output saved: {args.output}")
    print(f"Nodes: {len(merged_nodes)}")
    print(f"Missing in Stage B: {len(missing_in_b)}")
    print(f"Extra in Stage B: {len(extra_in_b)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
