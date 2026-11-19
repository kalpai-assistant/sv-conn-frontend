/**
 * SVC-419: `track()`, the one way the app sends a marketplace event. The API
 * client is mocked at its boundary; ApiError is the real class, so the 4xx /
 * 5xx split is tested against what apiFetch really throws.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
const getAccessToken = vi.fn<() => string | null>();

vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>();
  return {
    ApiError: real.ApiError,
    apiFetch: (...a: unknown[]) => apiFetch(...a),
    getAccessToken: () => getAccessToken(),
  };
});

import { ApiError } from "@/lib/api";
import { newEventId, pincodeOrNull, track } from "./analytics";

const PROPS = {
  service_id: "11111111-1111-4111-8111-111111111111",
  state: "coming_soon" as const,
  user_pincode: "560001",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Let the fire-and-forget promise chain settle. */
const flush = () => new Promise((r) => setTimeout(r, 0));

const bodies = () =>
  apiFetch.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));

const apiError = (status: number) => new ApiError(status, `API error: ${status}`);

beforeEach(() => {
  apiFetch.mockReset();
  getAccessToken.mockReturnValue("token");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("track()", () => {
  it("POSTs one envelope: a v4 event_id, the name, an ISO occurred_at, the properties", async () => {
    apiFetch.mockResolvedValue(undefined);
    track("marketplace.tile_coming_soon_tapped", PROPS);
    await flush();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch.mock.calls[0][0]).toBe("/analytics/events");
    expect((apiFetch.mock.calls[0][1] as RequestInit).method).toBe("POST");
    const [body] = bodies();
    expect(Object.keys(body).sort()).toEqual(["event_id", "name", "occurred_at", "properties"]);
    expect(body.event_id).toMatch(UUID);
    expect(body.name).toBe("marketplace.tile_coming_soon_tapped");
    expect(new Date(body.occurred_at).toISOString()).toBe(body.occurred_at);
    expect(body.properties).toEqual(PROPS);
  });

  it("returns nothing, so UI code has nothing to await", () => {
    apiFetch.mockResolvedValue(undefined);
    expect(track("marketplace.tile_coming_soon_tapped", PROPS)).toBeUndefined();
  });

  it("sends nothing when there's no access token", async () => {
    getAccessToken.mockReturnValue(null);
    track("marketplace.tile_coming_soon_tapped", PROPS);
    await flush();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("retries a network error once, with the same event_id", async () => {
    apiFetch.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(undefined);
    track("marketplace.tile_coming_soon_tapped", PROPS);
    await flush();

    expect(apiFetch).toHaveBeenCalledTimes(2);
    const [first, retry] = bodies();
    expect(retry).toEqual(first);
  });

  it("retries a 500 once, with the same event_id", async () => {
    apiFetch.mockRejectedValueOnce(apiError(500)).mockResolvedValue(undefined);
    track("marketplace.tile_coming_soon_tapped", PROPS);
    await flush();

    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(bodies()[1].event_id).toBe(bodies()[0].event_id);
  });

  it("retries only once: a second failure drops the event", async () => {
    apiFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    track("marketplace.tile_coming_soon_tapped", PROPS);
    await flush();
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it.each([401, 422, 429])("drops a %i without a retry", async (status) => {
    apiFetch.mockRejectedValue(apiError(status));
    track("marketplace.tile_coming_soon_tapped", PROPS);
    await flush();
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("never throws: not when the request fails, not when the client throws synchronously", async () => {
    apiFetch.mockRejectedValue(new Error("boom"));
    expect(() => track("marketplace.tile_coming_soon_tapped", PROPS)).not.toThrow();
    getAccessToken.mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(() => track("marketplace.tile_coming_soon_tapped", PROPS)).not.toThrow();
    await flush();
  });
});

describe("newEventId()", () => {
  it("makes a v4 UUID even without crypto.randomUUID", () => {
    const randomUUID = crypto.randomUUID;
    try {
      Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
      expect(newEventId()).toMatch(UUID);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: randomUUID, configurable: true });
    }
  });
});

describe("pincodeOrNull()", () => {
  it("keeps exactly six ASCII digits", () => {
    expect(pincodeOrNull({ pincode: "560001" })).toBe("560001");
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["five digits", "56000"],
    ["seven digits", "5600011"],
    ["letters", "56A001"],
    ["non-ASCII digits", "५६०००१"],
    ["empty", ""],
  ])("is null when the pincode is %s", (_, pincode) => {
    expect(pincodeOrNull({ pincode })).toBeNull();
  });

  it("is null with no address (ranked from the device)", () => {
    expect(pincodeOrNull(undefined)).toBeNull();
    expect(pincodeOrNull(null)).toBeNull();
  });
});
