#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_SCRIPT="${AGENT_BUS_BACKEND_SCRIPT:-start:agent-bus}"
LOCAL_PORT="${AGENT_BUS_LOCAL_PORT:-${PORT:-3000}}"
HEALTH_PATH="${AGENT_BUS_HEALTH_PATH:-/agent-bus/inbound/health}"
STARTUP_TIMEOUT_SECONDS="${AGENT_BUS_STARTUP_TIMEOUT_SECONDS:-45}"
BACKEND_PID=""

cleanup() {
  local exit_code=$?
  if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" >/dev/null 2>&1; then
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
    wait "${BACKEND_PID}" >/dev/null 2>&1 || true
  fi
  exit "${exit_code}"
}

trap cleanup EXIT INT TERM

echo "[agent-bus] starting backend via npm run ${BACKEND_SCRIPT} on local port ${LOCAL_PORT}"

PORT="${LOCAL_PORT}" npm run "${BACKEND_SCRIPT}" &
BACKEND_PID=$!

deadline=$((SECONDS + STARTUP_TIMEOUT_SECONDS))
until curl -fsS "http://127.0.0.1:${LOCAL_PORT}${HEALTH_PATH}" >/dev/null 2>&1; do
  if ! kill -0 "${BACKEND_PID}" >/dev/null 2>&1; then
    echo "[agent-bus] backend exited before health check passed"
    wait "${BACKEND_PID}"
  fi
  if (( SECONDS >= deadline )); then
    echo "[agent-bus] timed out waiting for health endpoint http://127.0.0.1:${LOCAL_PORT}${HEALTH_PATH}"
    exit 1
  fi
  sleep 1
done

echo "[agent-bus] backend is healthy, opening reverse tunnel"
"${SCRIPT_DIR}/open-agent-bus-reverse-tunnel.sh"
