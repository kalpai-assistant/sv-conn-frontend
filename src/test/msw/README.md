# MSW scaffold (SVC-469)

Minimal MSW node server and seed handlers for route-level vitest specs that
want backend-contract fidelity without the brittleness of hand-rolled
`vi.mock("@/hooks/useApi", ...)`.

## When to use MSW vs `vi.mock`

**Use MSW** when the test cares about the response **shape** reaching the
component through the real `useApi` → `apiFetch` → `fetch` chain —
typically route-level tests that render a screen and assert what the user
sees. Rename a backend field, both CI's `check:api-types` AND the MSW spec
fail; the component's assertion is specific to the field in question.

**Keep `vi.mock`** when the test only cares about the hook's **call
interface** — "did `useCreateBookingFromCart.mutateAsync` get called with
X?" — not about the response shape. The ~160 existing vi.mock specs stay
exactly as they are; MSW is opt-in per spec.

## Opting in

```ts
import { afterAll, afterEach, beforeAll } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";

beforeAll(() => server.listen({ onUnhandledFrame: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test("tracking renders the booking's address", async () => {
  server.use(
    http.get("**/api/v1/bookings/b1", () =>
      HttpResponse.json({ id: "b1", status: "REQUESTED" /* ... */ }),
    ),
  );
  // ...render the screen; assert on the address text...
});
```

`onUnhandledFrame: "bypass"` is deliberate — a spec that doesn't set a
handler shouldn't fail on every analytics beacon or firebase ping.

## Why no auto-start

A global setupFile that calls `server.listen()` for every vitest run would
re-route the fetch calls of every existing spec, breaking the hand-mocked
`useApi` tests that return bare objects without going through `apiFetch`.
Opt-in keeps the blast radius at zero.

## Contract drift

A sibling CI step (`npm run check:api-types`) regenerates
`src/types/api.ts` from `svc_connect.json` and diff-asserts. That's the
primary drift catcher; MSW is the companion that makes a type drift
reach a user-facing test assertion, not just a type error.
