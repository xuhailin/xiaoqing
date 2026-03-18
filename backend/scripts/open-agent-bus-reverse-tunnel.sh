#!/usr/bin/env bash

set -euo pipefail

REMOTE_HOST="${AGENT_BUS_REMOTE_HOST:-xiaoqin-server}"
REMOTE_PORT="${AGENT_BUS_REMOTE_PORT:-18080}"
LOCAL_PORT="${AGENT_BUS_LOCAL_PORT:-${PORT:-3000}}"
REMOTE_BIND_ADDRESS="${AGENT_BUS_REMOTE_BIND_ADDRESS:-127.0.0.1}"
LOCAL_HOST="${AGENT_BUS_LOCAL_HOST:-127.0.0.1}"

echo "[agent-bus] opening reverse tunnel ${REMOTE_BIND_ADDRESS}:${REMOTE_PORT} -> ${LOCAL_HOST}:${LOCAL_PORT} via ${REMOTE_HOST}"

exec ssh \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -N \
  -R "${REMOTE_BIND_ADDRESS}:${REMOTE_PORT}:${LOCAL_HOST}:${LOCAL_PORT}" \
  "${REMOTE_HOST}"
