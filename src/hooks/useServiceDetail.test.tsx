/**
 * The service sheet's detail fetch (SVC-292, SVC-341, SVC-392).
 *
 * The sheet hides each section on an empty list / null field, so the one
 * job here is that every "nothing to show" the backend can send — `null`,
 * `[]`, or no field at all from a build before each of SVC-340 / SVC-392 —
 * arrives as `[]` / `null`. Anything else would either crash the sheet or
 * draw an empty heading.
 *
 * SVC-392 enriches `steps` to accept rich objects (`{title, duration_minutes,
 * icon}`) while keeping backward compat with the plain-string shape SVC-340
 * shipped; the mapper normalises to the rich shape so the sheet only ever
 * handles one representation.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiFetch = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

import { useServiceDetail } from "@/hooks/useApi";

const ID = "303a8dc8-50dc-44ad-b619-2c77c0729ea0";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function detailFor(payload: Record<string, unknown>) {
  apiFetch.mockResolvedValue({ id: ID, name: "Men's haircut", ...payload });
  const { result } = renderHook(() => useServiceDetail(ID), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return result.current.data!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useServiceDetail", () => {
  it("is the single GET /services/{id} the sheet makes", async () => {
    await detailFor({});
    expect(apiFetch).toHaveBeenCalledOnce();
    expect(apiFetch).toHaveBeenCalledWith(`/services/${ID}`);
  });

  it("passes populated steps and exclusions through in order", async () => {
    const detail = await detailFor({
      steps: ["Consult", "Wash", "Cut"],
      exclusions: ["Beard trim"],
    });
    // Plain-string steps (SVC-340 shape) get normalised to `{title}` objects —
    // this is the mapper's compatibility promise for older backends.
    expect(detail.steps).toEqual([{ title: "Consult" }, { title: "Wash" }, { title: "Cut" }]);
    expect(detail.exclusions).toEqual(["Beard trim"]);
  });

  it("passes rich SVC-392 step objects through, keeping duration + icon", async () => {
    const detail = await detailFor({
      steps: [
        { title: "Consult", duration_minutes: 10, icon: "search" },
        { title: "Wash", duration_minutes: 15 },
      ],
    });
    expect(detail.steps).toEqual([
      { title: "Consult", durationMinutes: 10, icon: "search" },
      { title: "Wash", durationMinutes: 15 },
    ]);
  });

  it.each([
    ["null", { steps: null, exclusions: null }],
    ["an empty array", { steps: [], exclusions: [] }],
    ["a missing field (pre-SVC-340 backend)", {}],
  ])("treats %s as nothing to show", async (_label, payload) => {
    const detail = await detailFor(payload);
    expect(detail.steps).toEqual([]);
    expect(detail.exclusions).toEqual([]);
  });

  it("drops blank entries rather than drawing an empty row", async () => {
    const detail = await detailFor({ steps: ["Consult", "  ", ""], exclusions: [""] });
    expect(detail.steps).toEqual([{ title: "Consult" }]);
    expect(detail.exclusions).toEqual([]);
  });

  it("still maps the related bucket alongside", async () => {
    const detail = await detailFor({
      related: { hook: [{ id: "h1", name: "Facial", base_price: 499, sort_order: 1 }] },
    });
    expect(detail.related).toEqual({
      hook: [{ id: "h1", name: "Facial", price: 499, sortOrder: 1 }],
      upsell: [],
      related: [],
    });
  });
});
