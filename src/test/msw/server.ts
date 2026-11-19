/**
 * MSW node server for vitest (SVC-469).
 *
 * A spec opts in by importing { server } here and wiring the lifecycle:
 *
 *   import { server } from "@/test/msw/server";
 *   import { http, HttpResponse } from "msw";
 *   beforeAll(() => server.listen({ onUnhandledFrame: "bypass" }));
 *   afterEach(() => server.resetHandlers());
 *   afterAll(() => server.close());
 *
 * Deliberately NOT auto-started in the global setup — that would re-route
 * every pre-existing `vi.mock("@/hooks/useApi")` spec's network calls and
 * break the ~160 tests that don't ask for MSW. Opt-in keeps it safe.
 */
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
