# e2e-fe — frontend Playwright

Scaffold for SVC-468 / wave-1 G1. The admin console has its own Playwright
suite at `admin/e2e/`; **this directory is for the consumer-facing app**.

## Running locally

```bash
npm run test:e2e              # headed off, chromium only
npm run test:e2e -- --ui      # Playwright's UI runner, watch mode
npm run test:e2e <spec-name>  # single file
```

The config boots `vite --config vite.mobile.config.ts` on port 5173 and tears
it down when the suite finishes. No backend is needed — each spec mocks the
API via `page.route('**/api/v1/**', ...)`.

## What's here

- `playwright.config.ts` (at repo root) — serves the **mobile** SPA build to
  match what Capacitor ships, not the TanStack Start SSR dev server (which
  falls over on Leaflet; see `CLAUDE.md` "Two things that block browser
  testing today").
- `fixtures/backend.ts` — minimal mock backend: `/users/me`, `/services`,
  `/addresses`, booking + payment endpoints, with shapes matching
  `svc_connect.json` OpenAPI. Each test picks what it needs.
- `fixtures/razorpay.ts` — stubs `window.Razorpay` with a test double that
  honours the `handler` + `modal.ondismiss` callbacks.
- `fixtures/session.ts` — seeds `localStorage` with tokens + user + cart so
  tests that aren't about the auth flow can land directly on `/cart`.
- `smoke.spec.ts` — the first smoke: app bootstraps, AuthFlow renders.
- `money-path.spec.ts` — the SVC-468 target: `useBookAndPay` chain
  end-to-end with Razorpay stubbed.

## Why mocks and not docker-compose

The SVC-468 failure mode is **integration regression in the frontend
chain**: `useBookAndPay`, the Razorpay success handler, `/payments/verify`,
and booking-creation navigation each pass their unit tests but drift against
one another. That's a client-side correctness concern; a real backend adds
flake (DB migrations, Celery workers, docker boot time) without adding
coverage of the regression we're hunting. A follow-up ticket (parent-level
recommendation, filed under SVC-467) can add a docker-compose variant once
the mock layer is stable.

Vendor boundary is where mocks genuinely matter:

- **Razorpay checkout** stays stubbed forever — it's the hard "don't
  send real money" line.
- **Backend webhook payloads** have their own contract harness at
  `backend/tests/test_webhook_contracts.py`.

## Adding a new spec

1. Import from `./fixtures/backend`, `./fixtures/razorpay`, `./fixtures/session`.
2. Register routes BEFORE `page.goto()`.
3. Name the failure mode in the test's doc comment — same rule as
   vitest/pytest in this wave. If you can't name one, don't write the test.
