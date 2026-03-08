#!/bin/bash
set -euo pipefail

python3 -m http.server 8080 &
SERVER_PID=$!
trap "kill $SERVER_PID" EXIT

find . -name "*.md" -o -name "*.html" -o -name "*.css" \
  | grep -v ".git" \
  | entr -s "./build.sh"
