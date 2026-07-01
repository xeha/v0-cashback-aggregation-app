#!/usr/bin/env bash
# Compare legacy vs pipeline on screenshots.
# Copy step requires Terminal.app (Desktop privacy) OR pre-populated test-screenshots/.
set -euo pipefail

WORKTREE="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="${PYTHON:-$WORKTREE/../../backend/.venv/bin/python}"
DESKTOP_BASE="${DESKTOP_BASE:-$HOME/Desktop/project_cashback_keeper}"
BANKS_SRC="$DESKTOP_BASE/скриншоты банков"
MARKETS_SRC="$DESKTOP_BASE/скриншоты супермаркетов"
BANKS_DST="$WORKTREE/test-screenshots/banks"
MARKETS_DST="$WORKTREE/test-screenshots/markets"

mkdir -p "$BANKS_DST" "$MARKETS_DST" "$WORKTREE/test-results"

copy_if_needed() {
  local src="$1" dst="$2" label="$3"
  local count
  count="$(find "$dst" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' -o -iname '*.heic' \) 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$count" -gt 0 ]; then
    echo "$label: using $count existing file(s) in $dst"
    return 0
  fi
  echo "$label: copying from $src ..."
  if cp -R "$src/." "$dst/"; then
  echo "$label: copy OK"
  else
    echo "ERROR: cannot copy $label from Desktop (Operation not permitted)." >&2
    echo "Run this in Terminal.app, then re-run this script:" >&2
    echo "  cp -R \"$src/.\" \"$dst/\"" >&2
    return 1
  fi
}

copy_if_needed "$BANKS_SRC" "$BANKS_DST" "Banks" || COPY_FAILED=1
copy_if_needed "$MARKETS_SRC" "$MARKETS_DST" "Markets" || COPY_FAILED=1

if [ "${COPY_FAILED:-0}" = 1 ]; then
  exit 1
fi

BASE_URL="${BASE_URL:-http://127.0.0.1:8001}"
MANIFEST="$WORKTREE/test-screenshots/manifest.json"
MANIFEST_ARG=""
if [ -f "$MANIFEST" ]; then
  MANIFEST_ARG="--manifest $MANIFEST"
fi

echo "Health check ($BASE_URL)..."
curl -sf "$BASE_URL/health" | python3 -m json.tool

echo ""
echo "Comparing banks (may take ~30-90s per screenshot)..."
"$PYTHON" "$WORKTREE/backend/scripts/compare_pipeline_paths.py" \
  "$BANKS_DST" \
  --base-url "$BASE_URL" \
  --kind bank \
  --walk-subdirs \
  $MANIFEST_ARG \
  --output "$WORKTREE/test-results/banks-compare.json"

echo ""
echo "Comparing markets..."
"$PYTHON" "$WORKTREE/backend/scripts/compare_pipeline_paths.py" \
  "$MARKETS_DST" \
  --base-url "$BASE_URL" \
  --kind market \
  --walk-subdirs \
  $MANIFEST_ARG \
  --output "$WORKTREE/test-results/markets-compare.json"

echo ""
echo "Done:"
echo "  $WORKTREE/test-results/banks-compare.json"
echo "  $WORKTREE/test-results/markets-compare.json"
