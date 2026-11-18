/**
 * MSW handlers (SVC-469 scaffold).
 *
 * Minimal seed covering the handful of endpoints a route test typically
 * reaches. Each handler returns a shape that satisfies the generated
 * `src/types/api.ts` types — if the backend renames a field, two things
 * break in the same place:
 *   1. CI's `npm run check:api-types` fails on the regenerated src/types/api.ts
 *      diff (the real safety net).
 *   2. Any route test that reads the renamed field through MSW fails its
 *      assertion — unit coverage bite on the specific flow.
 *
 * Deliberately NOT a big-bang rewrite of existing `vi.mock("@/hooks/useApi")`
 * callers. Those continue to work; MSW is additive. A spec that benefits
 * from fidelity switches over when it chooses.
 */
import { http, HttpResponse } from "msw";

const API = "**/api/v1";

export const handlers = [
  http.get(`${API}/users/me`, () =>
    HttpResponse.json({
      id: "u-msw-1",
      name: "MSW User",
      phone: "+919999999999",
      email: null,
      role: "consumer",
      preferred_language: "en",
      i18n_enabled: false,
    }),
  ),

  http.get(`${API}/categories`, () => HttpResponse.json([])),

  http.get(`${API}/services`, () => HttpResponse.json([])),

  http.get(`${API}/users/me/addresses`, () => HttpResponse.json([])),

  http.get(`${API}/bookings/`, () =>
    HttpResponse.json({ bookings: [], has_more: false, next_cursor: null }),
  ),

  http.get(`${API}/pros/me`, () =>
    HttpResponse.json({ detail: "not a pro", code: "NOT_A_PRO" }, { status: 404 }),
  ),

  http.get(`${API}/providers/me`, () =>
    HttpResponse.json({ detail: "not a provider", code: "NOT_A_PROVIDER" }, { status: 404 }),
  ),
];
