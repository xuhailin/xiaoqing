#!/bin/sh
set -eu

cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {
  apiUrl: "${XQ_API_URL:-}"
};
EOF
