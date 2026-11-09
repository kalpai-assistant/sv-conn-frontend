import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiFetch,
  clearSessionToken,
  getSessionToken,
  setSessionLostHandler,
  setSessionToken,
} from "@/lib/api";
import { appError, json, mockApi } from "@/test/harness";

const TOKEN_KEY = "eazyserv-admin:session_token";

describe("session token handling", () => {
  const onLost = vi.fn();

  beforeEach(() => {
    clearSessionToken();
    onLost.mockClear();
    setSessionLostHandler(onLost);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the token in sessionStorage and never in localStorage", () => {
    setSessionToken("t1");
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe("t1");
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();

    clearSessionToken();
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("restores the token from sessionStorage when the app loads", async () => {
    window.sessionStorage.setItem(TOKEN_KEY, "from-last-load");
    vi.resetModules();
    const fresh = await import("@/lib/api");
    expect(fresh.getSessionToken()).toBe("from-last-load");
  });

  it("still holds the session in memory when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setSessionToken("t1");
    expect(getSessionToken()).toBe("t1");
  });

  it("sends the Bearer header on session-gated calls", async () => {
    setSessionToken("t1");
    const api = mockApi({ "GET /admin/auth/me": () => json({}) });

    await apiFetch("/admin/auth/me");

    expect(api.headers("GET /admin/auth/me").Authorization).toBe("Bearer t1");
  });

  it.each(["/admin/auth/login", "/admin/auth/totp/setup", "/admin/auth/totp/verify"])(
    "sends no Bearer header to %s",
    async (path) => {
      setSessionToken("t1");
      const api = mockApi({ [`POST ${path}`]: () => json({}) });

      await apiFetch(path, { method: "POST" });

      expect(api.headers(`POST ${path}`).Authorization).toBeUndefined();
    },
  );

  it("replaces the stored token when a response carries X-Admin-Token", async () => {
    setSessionToken("t1");
    mockApi({ "GET /admin/auth/me": () => json({}, 200, { "X-Admin-Token": "t2" }) });

    await apiFetch("/admin/auth/me");

    expect(getSessionToken()).toBe("t2");
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe("t2");
  });

  it("signs out on a 401 from a session-gated call", async () => {
    setSessionToken("t1");
    mockApi({ "GET /admin/users": () => json({ detail: "Session has ended" }, 401) });

    await expect(apiFetch("/admin/users")).rejects.toMatchObject({ status: 401 });

    expect(getSessionToken()).toBeNull();
    expect(onLost).toHaveBeenCalledOnce();
  });

  it.each([
    ["/admin/auth/login", "INVALID_CREDENTIALS"],
    ["/admin/auth/totp/setup", "INVALID_CHALLENGE"],
    ["/admin/auth/totp/verify", "INVALID_TOTP_CODE"],
  ])("treats a 401 from %s as a form error, not a sign-out", async (path, code) => {
    setSessionToken("t1");
    mockApi({ [`POST ${path}`]: () => appError(401, code) });

    await expect(apiFetch(path, { method: "POST" })).rejects.toMatchObject({ status: 401, code });

    expect(getSessionToken()).toBe("t1");
    expect(onLost).not.toHaveBeenCalled();
  });

  it("does not sign out on a 403", async () => {
    setSessionToken("t1");
    mockApi({ "GET /admin/users": () => json({ detail: "Requires role: admin" }, 403) });

    await expect(apiFetch("/admin/users")).rejects.toMatchObject({
      status: 403,
      message: "Requires role: admin",
    });

    expect(getSessionToken()).toBe("t1");
    expect(onLost).not.toHaveBeenCalled();
  });

  it("does not bring the token back from a response that lands after sign-out", async () => {
    setSessionToken("t1");
    let respond!: (res: Response) => void;
    mockApi({ "GET /admin/users": () => new Promise<Response>((r) => (respond = r)) });

    const inFlight = apiFetch("/admin/users");
    clearSessionToken();
    respond(json({}, 200, { "X-Admin-Token": "t2" }));
    await inFlight;

    expect(getSessionToken()).toBeNull();
  });

  it("does not end a newer session on a late 401 from an older one", async () => {
    setSessionToken("old");
    let respond!: (res: Response) => void;
    mockApi({ "GET /admin/users": () => new Promise<Response>((r) => (respond = r)) });

    const inFlight = apiFetch("/admin/users");
    setSessionToken("new");
    respond(json({ detail: "Session has ended" }, 401));
    await expect(inFlight).rejects.toBeInstanceOf(ApiError);

    expect(getSessionToken()).toBe("new");
    expect(onLost).not.toHaveBeenCalled();
  });

  it("carries Retry-After on the error", async () => {
    mockApi({
      "POST /admin/auth/login": () =>
        json({ error: true, message: "Too many" }, 429, { "Retry-After": "120" }),
    });

    await expect(apiFetch("/admin/auth/login", { method: "POST" })).rejects.toMatchObject({
      status: 429,
      retryAfter: 120,
    });
  });

  it("carries an AppException's details on the error, and nothing when there are none", async () => {
    setSessionToken("t1");
    mockApi({
      "POST /admin/pros/p1/force-remove": () =>
        json(
          {
            error: true,
            message: "Asha is on a job.",
            code: "PRO_HAS_ACTIVE_JOB",
            details: { booking_ids: ["b1"] },
          },
          409,
        ),
      "POST /admin/pros/p2/force-remove": () => appError(404, "PRO_NOT_FOUND"),
    });

    await expect(apiFetch("/admin/pros/p1/force-remove", { method: "POST" })).rejects.toMatchObject(
      { status: 409, code: "PRO_HAS_ACTIVE_JOB", details: { booking_ids: ["b1"] } },
    );
    const bare = await apiFetch("/admin/pros/p2/force-remove", { method: "POST" }).catch(
      (err: unknown) => err,
    );
    expect(bare).toBeInstanceOf(ApiError);
    expect((bare as ApiError).details).toBeUndefined();
  });
});
