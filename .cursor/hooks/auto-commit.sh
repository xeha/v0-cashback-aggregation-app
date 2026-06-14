#!/bin/bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

if git diff --quiet && git diff --cached --quiet; then
  exit 0
fi

git add -A
git commit -m "chore: auto-commit on agent session start" || exit 0
