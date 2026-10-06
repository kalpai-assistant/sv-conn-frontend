/**
 * `apiFetch` now delegates to `apiFetchWithStatus` (SVC-321). Every existing
 * caller depends on its exact behaviour, so these pin it: the parsed body on a
 * 2xx, `undefined` on a 204, an `ApiError` carrying status and code otherwise.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, apiFetchWithStatus } from "@/lib/api";

function respond(status: number, body?: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch", () => {
  it("returns the parsed body on a 200", async () => {
    respond(200, { id: "b1" });
    await expect(apiFetch("/x")).resolves.toEqual({ id: "b1" });
  });

  it("returns the body, not the status, on a 202 too", async () => {
    respond(202, { booking_id: "b1", pros: [] });
    await expect(apiFetch("/x")).resolves.toEqual({ booking_id: "b1", pros: [] });
  });

  it("returns undefined on a 204", async () => {
    respond(204);
    await expect(apiFetch("/x")).resolves.toBeUndefined();
  });

  it("throws an ApiError with the status, message and code", async () => {
    respond(409, { message: "Asha is offline.", code: "PRO_OFFLINE" });
    const error = await apiFetch("/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message: "Asha is offline.", code: "PRO_OFFLINE" });
  });

  it("passes caller headers through", async () => {
    const fetchMock = respond(200, {});
    await apiFetch("/x", { method: "PATCH", headers: { "X-Team-Pick": "1" } });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toMatchObject({ "X-Team-Pick": "1", "Content-Type": "application/json" });
  });
});

describe("apiFetchWithStatus", () => {
  it("tells a 202 from a 200", async () => {
    respond(202, { pros: [] });
    await expect(apiFetchWithStatus("/x")).resolves.toEqual({ status: 202, data: { pros: [] } });
    respond(200, { id: "b1" });
    await expect(apiFetchWithStatus("/x")).resolves.toEqual({ status: 200, data: { id: "b1" } });
  });

  it("throws on failure exactly like apiFetch", async () => {
    respond(410, { message: "This booking is no longer available" });
    await expect(apiFetchWithStatus("/x")).rejects.toMatchObject({ status: 410 });
  });
});
