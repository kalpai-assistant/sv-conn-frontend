#!/usr/bin/env bash
# check:api-types — fails CI if src/types/api.ts is stale (SVC-469).
#
# Regenerates src/types/api.ts from svc_connect.json and diff-asserts against
# the committed tree. Catches the SVC-469 failure mode: a backend renames a
# BookingResponse field (or flips a type), svc_connect.json is refreshed,
# nobody re-runs `npm run generate:api-types`, and the drift surfaces only
# when the tracking screen shows "N/A" in prod.
#
# This mirrors scripts/check-routes.mjs (SVC-476) at the type layer.
#
# Local use: `npm run check:api-types`. Exits 0 if the tree is up-to-date,
# 1 with instructions if not. Always restores the committed version so a
# developer's working tree isn't silently mutated.
set -euo pipefail

TARGET="src/types/api.ts"
SNAPSHOT="$(mktemp)"
trap 'rm -f "$SNAPSHOT"' EXIT

cp "$TARGET" "$SNAPSHOT"

if ! npm run --silent generate:api-types; then
  cp "$SNAPSHOT" "$TARGET"
  echo "[check:api-types] generator failed — see the error above."
  exit 2
fi

if cmp --silent "$SNAPSHOT" "$TARGET"; then
  echo "[check:api-types] src/types/api.ts is up to date."
  exit 0
fi

# Drift detected. Restore so the working tree is unchanged, then fail
# with the fix recipe.
cp "$SNAPSHOT" "$TARGET"

echo ""
echo "❌ src/types/api.ts is stale."
echo ""
echo "The generator produced different content than what's committed."
echo "svc_connect.json has drifted from the committed types."
echo ""
echo "Fix:"
echo "  1. npm run generate:api-types"
echo "  2. git add src/types/api.ts"
echo "  3. commit + push"
echo ""
exit 1
