#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import random
import time
from typing import Any, Dict, List, Optional
from urllib import parse, request


def _http_get_json(url: str, timeout: int = 15) -> Dict[str, Any]:
    req = request.Request(url, method="GET")
    with request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _http_post_json(url: str, payload: Dict[str, Any], timeout: int = 15) -> Dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def _is_timer_start(event: Dict[str, Any]) -> bool:
    payload = event.get("payload") or {}
    return event.get("component_id") == "template_gate" and payload.get("timer_action") == "start"


def _is_export_start(event: Dict[str, Any]) -> bool:
    payload = event.get("payload") or {}
    return event.get("component_id") == "template_gate" and payload.get("timer_action") == "export_start"


def _is_export_success(event: Dict[str, Any]) -> bool:
    return event.get("event_name") == "export_success"


def _build_force_success_event(base: Dict[str, Any], reason: str) -> Dict[str, Any]:
    now_ms = int(time.time() * 1000)
    rid = random.randint(100000, 999999)
    return {
        "id": f"force_stop_export_{now_ms}_{rid}",
        "ts": now_ms,
        "session_id": base.get("session_id", "forced_session"),
        "task_id": base.get("task_id", "forced_task"),
        "study_id": base.get("study_id"),
        "participant_id": base.get("participant_id"),
        "client_seq": None,
        "route": "main",
        "event_name": "export_success",
        "component_id": "side_panel_export",
        "node_id": None,
        "payload": {
            "forced_stop": True,
            "source_script": "python/force_stop_export_timer.py",
            "reason": reason,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Force-close a stuck export timer by injecting export_success monitoring event.",
    )
    parser.add_argument(
        "--api-base",
        default="http://127.0.0.1:8008",
        help="Runtime API base, default: http://127.0.0.1:8008",
    )
    parser.add_argument(
        "--participant-id",
        default=None,
        help="Optional participant filter to scope the target task.",
    )
    parser.add_argument(
        "--reason",
        default="manual_emergency_stop",
        help="Reason attached to forced stop event.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only print target task, do not post event.",
    )
    args = parser.parse_args()

    api_base = args.api_base.rstrip("/")
    query = {"limit": "10000"}
    if args.participant_id:
        query["participant_id"] = args.participant_id
    events_url = f"{api_base}/monitoring/events?{parse.urlencode(query)}"
    batch_url = f"{api_base}/monitoring/events/batch"

    try:
        payload = _http_get_json(events_url, timeout=20)
    except Exception as exc:
        print(f"[force-stop] failed to fetch events: {exc}")
        return 1

    events = payload.get("events")
    if not isinstance(events, list) or len(events) == 0:
        print("[force-stop] no monitoring events found.")
        return 1

    sorted_events: List[Dict[str, Any]] = sorted(
        [event for event in events if isinstance(event, dict)],
        key=lambda event: int(event.get("ts", 0)),
    )
    starts = [event for event in sorted_events if _is_timer_start(event)]
    if not starts:
        print("[force-stop] no task timer start event found.")
        return 1

    latest_start = starts[-1]
    start_ts = int(latest_start.get("ts", 0))
    tail = [event for event in sorted_events if int(event.get("ts", 0)) >= start_ts]
    has_export_start = any(_is_export_start(event) for event in tail)
    has_export_success = any(_is_export_success(event) for event in tail)

    print(
        "[force-stop] target:",
        json.dumps(
            {
                "session_id": latest_start.get("session_id"),
                "task_id": latest_start.get("task_id"),
                "participant_id": latest_start.get("participant_id"),
                "start_ts": start_ts,
                "has_export_start": has_export_start,
                "has_export_success": has_export_success,
            },
            ensure_ascii=False,
        ),
    )

    if has_export_success:
        print("[force-stop] already closed by existing export_success, no-op.")
        return 0

    force_event = _build_force_success_event(latest_start, reason=args.reason)
    print(f"[force-stop] prepared event id={force_event['id']}")

    if args.dry_run:
        print("[force-stop] dry-run enabled, not posting event.")
        return 0

    try:
        resp = _http_post_json(batch_url, {"events": [force_event]}, timeout=20)
    except Exception as exc:
        print(f"[force-stop] failed to post forced event: {exc}")
        return 1

    print(
        "[force-stop] posted:",
        json.dumps(
            {
                "accepted": resp.get("accepted"),
                "total": resp.get("total"),
                "stored": resp.get("stored"),
                "deduplicated": resp.get("deduplicated"),
            },
            ensure_ascii=False,
        ),
    )
    print("[force-stop] done. Refresh Admin page to see timeline closed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

