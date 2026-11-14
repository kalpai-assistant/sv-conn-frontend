#!/usr/bin/env bash
# stability-check — pre-push gate for frontend stability (SVC-478 / wave 1).
#
# Budget: <7 minutes end-to-end on a warm cache. Timing checkpoints print so
# the budget is auditable — if any stage silently blows past its slice,
# `tail -f stability-check.log` tells you which.
#
# What this covers (each stage names the regression it would catch):
#   1. typecheck  — a .ts/.tsx file that references a nonexistent type or
#                   has gone out of sync with src/types/api.ts.
#   2. vitest     — any unit-level regression across the 158 test files.
#                   Full suite, not a subset, as long as it stays <2 min.
#   3. check:assets — a string literal under src/ that points at a missing
#                     public/ file. Postmortem: SVC-286 (four-week outage).
#   4. check:routes — routeTree.gen.ts drift (SVC-476 / G8). Catches the
#                     "stale route tree serves 404 at new routes" trap.
#   5. playwright money-path smoke — the useBookAndPay chain end-to-end
#                   against a local docker-compose backend. Catches the
#                   SVC-259-class regression where create-booking + Razorpay
#                   + verify look happy in units but the integrated chain
#                   loses the user.
#
# Depends on:
#   - G1 (SVC-468) having landed the Playwright scaffold at e2e-fe/.
#   - G8 (SVC-476) having added the `check:routes` npm script.
#   - Backend repo cloned at ../backend (adjust BACKEND_DIR if it lives
#     elsewhere; docker-compose boot is the slowest step and worth caching
#     between runs).
#
# Usage: npm run stability-check   # from frontend repo root

set -euo pipefail

FRONTEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="${BACKEND_DIR:-${FRONTEND_DIR}/../backend}"
LOG_FILE="${FRONTEND_DIR}/stability-check.log"

: >"$LOG_FILE"

t0=$(date +%s)
log() {
  local now=$(date +%s)
  local elapsed=$((now - t0))
  printf '[stability-check +%03ds] %s\n' "$elapsed" "$*" | tee -a "$LOG_FILE"
}

budget_check() {
  local now=$(date +%s)
  local elapsed=$((now - t0))
  if (( elapsed > 420 )); then
    log "WARN: elapsed ${elapsed}s exceeded 7-min budget"
  fi
}

cd "$FRONTEND_DIR"

log "stage 1/5 — typecheck (tsc --noEmit)"
npx tsc --noEmit
budget_check

log "stage 2/5 — vitest (full suite, dot reporter)"
npm test -- --reporter=dot
budget_check

log "stage 3/5 — check:assets (dead public-asset refs)"
npm run check:assets
budget_check

log "stage 4/5 — check:routes (routeTree.gen.ts drift)"
# Landed by SVC-476. If the script is not yet present, warn and continue
# rather than fail — this unblocks the first-run smoke before G8 lands.
if npm run | grep -q '^  check:routes$'; then
  npm run check:routes
else
  log "NOTE: check:routes npm script not present yet (SVC-476 pending); skipping"
fi
budget_check

log "stage 5/5 — playwright money-path smoke"
if [[ ! -d "${FRONTEND_DIR}/e2e-fe" ]]; then
  log "NOTE: e2e-fe/ not present yet (SVC-468 pending); skipping Playwright"
else
  log "booting docker-compose backend at ${BACKEND_DIR}"
  (
    cd "${BACKEND_DIR}"
    docker-compose up -d api postgres redis celery-worker celery-beat
  )

  log "waiting on backend /healthz (up to 90s)"
  for i in $(seq 1 45); do
    if curl -fsS http://localhost:8000/healthz >/dev/null 2>&1; then
      log "backend ready after ${i} polls"
      break
    fi
    sleep 2
    if (( i == 45 )); then
      log "ERROR: backend /healthz never answered 2xx within 90s"
      exit 1
    fi
  done

  (
    cd "${FRONTEND_DIR}/e2e-fe"
    npm test -- --reporter=dot --grep "@stability"
  )

  log "tearing down docker-compose"
  (
    cd "${BACKEND_DIR}"
    docker-compose down
  ) || true
fi

budget_check
log "stability-check: OK"
