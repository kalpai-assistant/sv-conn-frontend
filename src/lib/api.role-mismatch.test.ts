/**
 * SVC-472: `apiFetch` detail-field shape contract.
 *
 * `api.ts` lines 209-231 unwrap FastAPI's `{"detail": "..."}` into the
 * user-facing error message for 4xx responses. The rule is explicit:
 * **strings only**. FastAPI's 422 validation errors put an array here,
 * which would render as "[object Object]" or worse — and a backend
 * regression that shipped a `detail: {msg, type}` dict (not unheard of)
 * would also silently reach the user as broken copy.
 *
 * The tests below pin the three non-string shapes we might see: array
 * (422 validation), dict, and null. In every case `errorMsg` must stay
 * on the generic placeholder, not render the raw payload.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, clearTokens } from "./api";

function mockFetchJson(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  clearTokens();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch detail-shape contract (SVC-472)", () => {
  it("unwraps a string detail into the user-visible message (SVC-253 / Policy A)", async () => {
    // Failure mode: a refactor drops the `typeof detail === "string"` guard
    // and swallows the detail. The ROLE_MISMATCH screen (and ~20 other raw
    // HTTPException call sites) loses their user-safe copy and users see
    // "API error: 400" instead.
    vi.stubGlobal(
      "fetch",
      mockFetchJson(400, { detail: "This phone is already registered as consumer" }),
    );
    await expect(apiFetch("/auth/verify-otp")).rejects.toThrow(
      "This phone is already registered as consumer",
    );
  });

  it("does NOT unwrap an array detail (FastAPI 422 validation errors)", async () => {
    // Failure mode: FastAPI's validation-error payload is
    //   { "detail": [{ "loc": [...], "msg": "...", "type": "..." }] }
    // Rendering that as an error message would show "[object Object]" to
    // the user. The guard here is `typeof === "string"` — this test locks
    // it against a well-meaning refactor that calls JSON.stringify on
    // non-strings "to be safe".
    vi.stubGlobal(
      "fetch",
      mockFetchJson(422, {
        detail: [
          { loc: ["body", "phone"], msg: "value is not a valid phone", type: "value_error" },
        ],
      }),
    );
    try {
      await apiFetch("/auth/send-otp");
      throw new Error("apiFetch should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe("API error: 422 ");
      expect((err as ApiError).message).not.toContain("[object Object]");
      expect((err as ApiError).message).not.toContain("value_error");
    }
  });

  it("does NOT unwrap a dict detail (hypothetical backend regression)", async () => {
    // Failure mode: a new HTTPException ships `detail={"msg": "...", "code": "..."}`
    // rather than a plain string, and the unwrap renders `[object Object]`.
    vi.stubGlobal(
      "fetch",
      mockFetchJson(400, {
        detail: { msg: "role mismatch", code: "ROLE_MISMATCH" },
      }),
    );
    await expect(apiFetch("/auth/verify-otp")).rejects.toThrow(/^API error: 400/);
  });

  it("does NOT unwrap for 5xx — infrastructure detail stays internal", async () => {
    // Failure mode: a sync of the detail-unwrap logic incorrectly includes 5xx,
    // leaking "db shard 2 timeout" (true, useless to a provider, tells an
    // attacker about topology) to the user-visible toast.
    vi.stubGlobal("fetch", mockFetchJson(503, { detail: "db shard 2 timeout" }));
    await expect(apiFetch("/users/me")).rejects.toThrow(/^API error: 503/);
  });

  it("preserves the backend error `code` for callers that need to branch", async () => {
    // Failure mode: isRoleMismatch() in AuthFlow.tsx keys on ApiError.code,
    // not the message text (deliberately, per the comment there). A refactor
    // that drops .code from ApiError strands the "switch role" affordance.
    vi.stubGlobal(
      "fetch",
      mockFetchJson(400, {
        detail: "This phone is already registered as consumer",
        code: "ROLE_MISMATCH",
      }),
    );
    try {
      await apiFetch("/auth/verify-otp");
      throw new Error("apiFetch should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("ROLE_MISMATCH");
      expect((err as ApiError).status).toBe(400);
    }
  });
});
