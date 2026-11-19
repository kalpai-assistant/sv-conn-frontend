# SVC-470 (G3) — WebSocket live-tracking client

**Parent:** SVC-467 (Stability wave 1 — frontend).
**Why plan-mode:** cross-cutting; exceeds the ≤1-2 day / ≤800 LOC threshold in shared contract §1. 3 slices below, each independently shippable.

## Failure mode this uplift catches

When the SP transitions `en_route → in_progress`, the consumer's tracking map today never updates mid-ride — she sees a static pin. `src/components/tracking/TrackingMap.tsx` has an explicit comment: "Real live provider-position streaming needs the WebSocket at `backend/app/routers/tracking.py`; that's a phase-2 wire-up, not blocking this map." Backend ships that endpoint with `?token=<jwt>` auth per backend `CLAUDE.md`. Frontend has **zero WebSocket code** today.

## Backend contract (from `backend/CLAUDE.md`)

- Endpoint: `/tracking/{bookingId}` WebSocket.
- Auth: JWT via `?token=<jwt>` query param, validated per connection.
- Access: tracking page → consumer for their own booking; provider for their accepted bookings.
- Message envelope: not captured yet — part of Slice A is to capture a real session's messages (via tester runbook) and schema it.

## Slices

### Slice A — client hook + unit tests (0.75d)

File: `src/hooks/useBookingTrack.ts`
Shape:
```ts
export function useBookingTrack(bookingId: string, opts: { enabled: boolean }): {
  position: { lat: number; lng: number; updatedAt: number } | null;
  status: "idle" | "connecting" | "open" | "reconnecting" | "fallback";
  lastError?: Error;
}
```
Behaviour:
- Opens `wss://${host}/ws/tracking/${bookingId}?token=${accessToken}` on mount when `enabled` is true.
- Exponential-backoff reconnect (1s, 2s, 4s, 8s, cap 16s) on close codes other than 1000.
- On token refresh (hook from `apiFetch`'s refresh pipeline — needs a new `onAccessTokenChange` subscriber), reconnect with the new token.
- After 3 failed reconnects, flips `status` to `"fallback"` so the route reverts to polling.

Tests (vitest + `mock-socket`):
- Connects on mount; receives one message; `position` updates.
- Server closes with 1011; client reconnects.
- 4th failed reconnect → `status === "fallback"`.
- Token refresh mid-session → new connection URL carries new token.

**PR base:** `feature/svc-stability-wave1`.

### Slice B — route wire-up + feature flag (0.5d)

Edit `src/routes/tracking.$bookingId.tsx`:
- Behind `VITE_WS_TRACKING_ENABLED` flag (default `false` for the first deploy).
- When flag is on AND booking status is `en_route`, call `useBookingTrack`.
- Feed its `position` into `TrackingMap` as a new `providerLat` / `providerLng` prop.
- On `status === "fallback"`, no-op the WS and keep polling.

Tests:
- Route test flag-off: no WS attempt (unchanged behaviour, assertion against mock-socket's no-connect).
- Route test flag-on + EN_ROUTE: WS opens, position updates render a new marker.

**PR base:** `feature/svc-stability-wave1`. Depends on Slice A merged.

### Slice C — Playwright integration smoke (0.25d)

Depends on G1 (SVC-468) Playwright scaffold. Drives a docker-compose backend, creates a booking, flips it to `en_route` via admin endpoint, pushes a position message via backend fixture, asserts the frontend marker moves.

Captures the first real position-update payload and stores as a fixture in `e2e-fe/fixtures/ws-position-update.json` — a schema shift at the backend WS boundary fails fast.

**PR base:** `feature/svc-stability-wave1`. Depends on Slice A + G1 both merged.

## Out of scope

- Provider-side WS (SP seeing consumer-side updates) — not a wave-1 money/safety path.
- Capacitor-specific WS lifecycle (foreground/background pause) — follow-up under G9's device harness ticket (SVC-477).

## Decision flag for Vipul

Before Slice A starts: confirm the WS endpoint's message envelope (position updates only? status transitions too?). If the envelope carries status transitions, this slice can also obsolete the 4s polling hook for EN_ROUTE and IN_PROGRESS — but that's a wider refactor. Ask before expanding scope.
