#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/.runtime/remote-study"
mkdir -p "${RUNTIME_DIR}"

BACKEND_PORT="${BACKEND_PORT:-8008}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

BACKEND_LOG="${RUNTIME_DIR}/backend.log"
FRONTEND_LOG="${RUNTIME_DIR}/frontend.log"
BACKEND_TUNNEL_LOG="${RUNTIME_DIR}/backend_tunnel.log"
FRONTEND_TUNNEL_LOG="${RUNTIME_DIR}/frontend_tunnel.log"
BACKEND_REUSED=0

cleanup() {
  set +e
  if [[ -n "${FRONTEND_TUNNEL_PID:-}" ]]; then kill "${FRONTEND_TUNNEL_PID}" 2>/dev/null; fi
  if [[ -n "${BACKEND_TUNNEL_PID:-}" ]]; then kill "${BACKEND_TUNNEL_PID}" 2>/dev/null; fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then kill "${FRONTEND_PID}" 2>/dev/null; fi
  if [[ -n "${BACKEND_PID:-}" && "${BACKEND_REUSED}" -eq 0 ]]; then kill "${BACKEND_PID}" 2>/dev/null; fi
}

trap cleanup EXIT INT TERM

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

ensure_port_free() {
  local port="$1"
  python3 - "$port" <<'PY'
import socket, sys
port = int(sys.argv[1])
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    s.bind(("127.0.0.1", port))
except OSError:
    print(f"Port {port} is already in use.")
    sys.exit(1)
finally:
    s.close()
PY
}

port_is_open() {
  local port="$1"
  python3 - "$port" <<'PY'
import socket, sys
port = int(sys.argv[1])
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(0.5)
try:
    s.connect(("127.0.0.1", port))
    print("open")
except Exception:
    print("closed")
finally:
    s.close()
PY
}

extract_url_from_log() {
  local log_file="$1"
  python3 - "$log_file" <<'PY'
import re, sys
from pathlib import Path
text = Path(sys.argv[1]).read_text(encoding="utf-8", errors="ignore")
matches = re.findall(r"https://[a-zA-Z0-9.-]+\.trycloudflare\.com", text)
print(matches[-1] if matches else "")
PY
}

wait_for_trycloudflare_url() {
  local log_file="$1"
  local timeout_sec="$2"
  local elapsed=0

  while [[ $elapsed -lt $timeout_sec ]]; do
    local url
    url="$(extract_url_from_log "$log_file")"
    if [[ -n "$url" ]]; then
      echo "$url"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  echo ""
  return 1
}

require_cmd python3
require_cmd npm
require_cmd cloudflared

ensure_port_free "${FRONTEND_PORT}"

if [[ "$(port_is_open "${BACKEND_PORT}")" == "open" ]]; then
  echo "Backend port ${BACKEND_PORT} already in use, attempting to reuse existing backend ..."
  if curl -sSf "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null 2>&1; then
    BACKEND_REUSED=1
    echo "Existing backend health check passed."
  else
    echo "Port ${BACKEND_PORT} is occupied but /health check failed. Choose another BACKEND_PORT."
    exit 1
  fi
else
  echo "Starting backend on port ${BACKEND_PORT} ..."
  PYTHON_BIN="${ROOT_DIR}/python/.venv/bin/python"
  if [[ ! -x "${PYTHON_BIN}" ]]; then
    PYTHON_BIN="python3"
  fi

  "${PYTHON_BIN}" -m uvicorn semantic_embed_server:app \
    --app-dir "${ROOT_DIR}/python" \
    --host 0.0.0.0 \
    --port "${BACKEND_PORT}" \
    >"${BACKEND_LOG}" 2>&1 &
  BACKEND_PID=$!
  sleep 2
  if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
    echo "Backend failed to start. Check ${BACKEND_LOG}"
    exit 1
  fi
fi

echo "Opening backend tunnel ..."
cloudflared tunnel --url "http://localhost:${BACKEND_PORT}" --no-autoupdate \
  >"${BACKEND_TUNNEL_LOG}" 2>&1 &
BACKEND_TUNNEL_PID=$!

BACKEND_URL="$(wait_for_trycloudflare_url "${BACKEND_TUNNEL_LOG}" 30 || true)"
if [[ -z "${BACKEND_URL}" ]]; then
  echo "Failed to get backend tunnel URL. Check ${BACKEND_TUNNEL_LOG}"
  exit 1
fi

echo "Starting frontend on port ${FRONTEND_PORT} with API ${BACKEND_URL} ..."
(
  cd "${ROOT_DIR}"
  VITE_SEMANTIC_API_BASE="${BACKEND_URL}" npm run build
) >"${FRONTEND_LOG}" 2>&1 &
FRONTEND_PID=$!
wait "${FRONTEND_PID}"
BUILD_EXIT=$?
if [[ "${BUILD_EXIT}" -ne 0 ]]; then
  echo "Frontend build failed. Check ${FRONTEND_LOG}"
  exit 1
fi

python3 -m http.server "${FRONTEND_PORT}" --directory "${ROOT_DIR}/dist" \
  >>"${FRONTEND_LOG}" 2>&1 &
FRONTEND_PID=$!
sleep 2
if ! kill -0 "${FRONTEND_PID}" 2>/dev/null; then
  echo "Frontend failed to start. Check ${FRONTEND_LOG}"
  exit 1
fi

echo "Opening frontend tunnel ..."
cloudflared tunnel --url "http://localhost:${FRONTEND_PORT}" --no-autoupdate \
  >"${FRONTEND_TUNNEL_LOG}" 2>&1 &
FRONTEND_TUNNEL_PID=$!

FRONTEND_URL="$(wait_for_trycloudflare_url "${FRONTEND_TUNNEL_LOG}" 30 || true)"
if [[ -z "${FRONTEND_URL}" ]]; then
  echo "Failed to get frontend tunnel URL. Check ${FRONTEND_TUNNEL_LOG}"
  exit 1
fi

echo ""
echo "========================================="
echo "Remote study is ready."
echo "Share this URL with participants:"
echo "  ${FRONTEND_URL}"
echo ""
echo "Backend health check:"
echo "  ${BACKEND_URL}/health"
echo ""
echo "Logs:"
echo "  ${BACKEND_LOG}"
echo "  ${FRONTEND_LOG}"
echo "  ${BACKEND_TUNNEL_LOG}"
echo "  ${FRONTEND_TUNNEL_LOG}"
echo "========================================="
echo ""
echo "Keep this terminal open. Press Ctrl+C to stop all services."

while true; do
  sleep 5
  if [[ "${BACKEND_REUSED}" -eq 0 ]] && ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
    echo "Backend process stopped unexpectedly. Check ${BACKEND_LOG}"
    exit 1
  fi
  if ! kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    echo "Frontend process stopped unexpectedly. Check ${FRONTEND_LOG}"
    exit 1
  fi
done
