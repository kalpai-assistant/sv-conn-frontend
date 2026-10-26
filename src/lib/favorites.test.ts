/**
 * SVC-393: the favorites store is one-user-many-services, backed by
 * `sc_favorites_v1_<userId>` in localStorage. The `sc_` prefix matters —
 * `clearSession` (SVC-350) sweeps those keys on logout, so a shared
 * device sees no leaked favorites between users. This test proves both.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { addFavorite, hasFavorite, listFavorites, removeFavorite } from "@/lib/favorites";
import { clearSession } from "@/lib/session";

afterEach(() => {
  window.localStorage.clear();
});

describe("favorites store", () => {
  it("round-trips a service id for one user without leaking into another", () => {
    addFavorite("u-1", "svc-a");
    addFavorite("u-1", "svc-b");

    expect(hasFavorite("u-1", "svc-a")).toBe(true);
    expect(hasFavorite("u-1", "svc-b")).toBe(true);
    expect(hasFavorite("u-2", "svc-a")).toBe(false);
    expect([...listFavorites("u-1")].sort()).toEqual(["svc-a", "svc-b"]);
  });

  it("is a no-op when userId is missing (no anonymous bucket)", () => {
    // The hook calls this with user?.id, which can be undefined mid-boot.
    // Silent drop is better than scribbling an anonymous blob that would
    // never be swept by the per-user teardown.
    addFavorite(undefined, "svc-a");
    expect(hasFavorite(undefined, "svc-a")).toBe(false);
    // And nothing lands in localStorage either.
    expect(window.localStorage.length).toBe(0);
  });

  it("removeFavorite is idempotent — removing a key that isn't there is fine", () => {
    addFavorite("u-1", "svc-a");
    removeFavorite("u-1", "svc-a");
    removeFavorite("u-1", "svc-a");
    expect(hasFavorite("u-1", "svc-a")).toBe(false);
  });

  it("stores under the sc_ prefix so clearSession sweeps it on logout", () => {
    // The whole point of the `sc_` prefix — the "logout clears everything"
    // story from SVC-350 is what makes this per-user store safe on shared
    // devices. If a future refactor broke the prefix, this test is the
    // tripwire.
    addFavorite("u-1", "svc-a");
    const [key] = Object.keys(window.localStorage);
    expect(key.startsWith("sc_")).toBe(true);

    // Minimal QueryClient stand-in: clearSession only reads `.clear()`.
    const queryClient = { clear: vi.fn() } as unknown as Parameters<typeof clearSession>[0];
    clearSession(queryClient);

    expect(hasFavorite("u-1", "svc-a")).toBe(false);
    expect(window.localStorage.getItem(key)).toBeNull();
  });
});
