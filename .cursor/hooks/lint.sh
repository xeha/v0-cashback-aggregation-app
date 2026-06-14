#!/bin/bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

if [ -f package.json ] && command -v pnpm >/dev/null 2>&1; then
  pnpm lint
elif [ -f package.json ] && command -v npm >/dev/null 2>&1; then
  npm run lint
fi
