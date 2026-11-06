import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getSessionToken, setSessionToken } from "@/lib/api";
import {
  authErrorMessage,
  getChallengeToken,
  loadCurrentAdmin,
  login,
  resetAuthState,
  signOut,
  startTotpSetup,
  verifyTotp,
} from "@/lib/auth";
import { adminUser, appError, json, mockApi } from "@/test/harness";

const ME = "GET /admin/auth/me";
const SETUP = "POST /admin/auth/totp/setup";
const LOGOUT = "POST /admin/auth/logout";

beforeEach(() => {
  resetAuthState();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("challenge token", () => {
  const session = { access_token: "s1", token_type: "bearer", expires_in: 43200 };

  it("is held after the password step and gone once it is spent", async () => {
    mockApi({
      "POST /admin/auth/login": () =>
        json({ requires_totp: true, totp_setup_required: true, challenge_token: "c1" }),
      "POST /admin/auth/totp/verify": () => json({ ...session, admin: adminUser() }),
    });

    await expect(login("a@b.c", "pw")).resolves.toEqual({ setupRequired: true });
    expect(getChallengeToken()).toBe("c1");

    await verifyTotp("c1", "123456");
    expect(getChallengeToken()).toBeNull();
    expect(getSessionToken()).toBe("s1");
  });

  it("survives a wrong code", async () => {
    mockApi({
      "POST /admin/auth/login": () =>
        json({ requires_totp: true, totp_setup_required: false, challenge_token: "c1" }),
      "POST /admin/auth/totp/verify": () => appError(401, "INVALID_TOTP_CODE"),
    });

    await login("a@b.c", "pw");
    await expect(verifyTotp("c1", "000000")).rejects.toMatchObject({ code: "INVALID_TOTP_CODE" });

    expect(getChallengeToken()).toBe("c1");
    expect(getSessionToken()).toBeNull();
  });
});

describe("startTotpSetup", () => {
  it("shares one backend call per challenge", async () => {
    const api = mockApi({ [SETUP]: () => json({ otpauth_url: "otpauth://one" }) });

    const [first, second] = await Promise.all([startTotpSetup("c1"), startTotpSetup("c1")]);

    expect(first).toBe("otpauth://one");
    expect(second).toBe("otpauth://one");
    expect(api.count(SETUP)).toBe(1);
  });

  it("makes a new call for a new challenge", async () => {
    const api = mockApi({ [SETUP]: () => json({ otpauth_url: "otpauth://x" }) });

    await startTotpSetup("c1");
    await startTotpSetup("c2");

    expect(api.count(SETUP)).toBe(2);
  });

  it("forgets a failed call, so retrying asks again", async () => {
    const api = mockApi({ [SETUP]: () => json({}, 500) });
    await expect(startTotpSetup("c1")).rejects.toBeInstanceOf(ApiError);

    api.routes[SETUP] = () => json({ otpauth_url: "otpauth://retry" });
    await expect(startTotpSetup("c1")).resolves.toBe("otpauth://retry");
    expect(api.count(SETUP)).toBe(2);
  });
});

describe("loadCurrentAdmin", () => {
  beforeEach(() => {
    setSessionToken("t1");
  });

  it("reuses the answer within five minutes and asks again after", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    const api = mockApi({ [ME]: () => json(adminUser("ops")) });

    await loadCurrentAdmin();
    now.mockReturnValue(5 * 60 * 1000 - 1);
    await loadCurrentAdmin();
    expect(api.count(ME)).toBe(1);

    now.mockReturnValue(5 * 60 * 1000);
    await loadCurrentAdmin();
    expect(api.count(ME)).toBe(2);
  });

  it("keeps the reuse working when the /me response rolled the token", async () => {
    const api = mockApi({ [ME]: () => json(adminUser(), 200, { "X-Admin-Token": "t2" }) });

    await loadCurrentAdmin();
    await loadCurrentAdmin();

    expect(getSessionToken()).toBe("t2");
    expect(api.count(ME)).toBe(1);
  });

  it("does not reuse one session's admin for another", async () => {
    const api = mockApi({ [ME]: () => json(adminUser("ops")) });
    await loadCurrentAdmin();

    setSessionToken("t2");
    api.routes[ME] = () => json(adminUser("support"));

    await expect(loadCurrentAdmin()).resolves.toMatchObject({ role: "support" });
  });

  it.each([
    ["a 5xx", () => json({}, 503)],
    [
      "a network failure",
      () => {
        throw new TypeError("Failed to fetch");
      },
    ],
  ])("falls back to the known admin on %s", async (_name, failure) => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    const api = mockApi({ [ME]: () => json(adminUser("ops")) });
    await loadCurrentAdmin();

    now.mockReturnValue(10 * 60 * 1000);
    api.routes[ME] = failure;

    await expect(loadCurrentAdmin()).resolves.toMatchObject({ role: "ops" });
  });

  it("throws when there is no known admin to fall back to", async () => {
    mockApi({ [ME]: () => json({}, 503) });
    await expect(loadCurrentAdmin()).rejects.toMatchObject({ status: 503 });
  });

  it("throws a 403 even with a known admin: the network is now blocked", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    const api = mockApi({ [ME]: () => json(adminUser()) });
    await loadCurrentAdmin();

    now.mockReturnValue(10 * 60 * 1000);
    api.routes[ME] = () => json({ error: true, message: "Restricted" }, 403);

    await expect(loadCurrentAdmin()).rejects.toMatchObject({ status: 403 });
  });
});

describe("signOut", () => {
  beforeEach(() => {
    setSessionToken("t1");
  });

  it("ends the session on the server with the Bearer token, then clears it", async () => {
    const api = mockApi({ [LOGOUT]: () => new Response(null, { status: 204 }) });

    await expect(signOut()).resolves.toBe(true);

    expect(api.headers(LOGOUT).Authorization).toBe("Bearer t1");
    expect(getSessionToken()).toBeNull();
  });

  it("counts a 401 as confirmed: the session had already ended", async () => {
    mockApi({ [LOGOUT]: () => json({ detail: "Session has ended" }, 401) });

    await expect(signOut()).resolves.toBe(true);
    expect(getSessionToken()).toBeNull();
  });

  it.each([
    ["a 5xx", () => json({}, 500)],
    [
      "a network failure",
      () => {
        throw new TypeError("Failed to fetch");
      },
    ],
  ])("clears the token but reports unconfirmed on %s", async (_name, failure) => {
    mockApi({ [LOGOUT]: failure });

    await expect(signOut()).resolves.toBe(false);
    expect(getSessionToken()).toBeNull();
  });
});

describe("authErrorMessage", () => {
  it("shows the backend's own message for a login failure", () => {
    const err = new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    expect(authErrorMessage(err)).toBe("Invalid email or password");
  });

  it("shows the allowlist's message when its 403 is readable", () => {
    const err = new ApiError(403, "Admin access is restricted from this network.");
    expect(authErrorMessage(err)).toBe("Admin access is restricted from this network.");
  });

  it("explains a failed fetch, which is what a cross-origin allowlist block looks like", () => {
    expect(authErrorMessage(new TypeError("Failed to fetch"))).toBe(
      "Couldn't reach the server. Check your connection; this network may not be allowed.",
    );
  });

  it.each([
    [900, "Too many attempts. Try again in 15 minutes."],
    [61, "Too many attempts. Try again in 2 minutes."],
    [60, "Too many attempts. Try again in 1 minute."],
    [30, "Too many attempts. Try again in 30 seconds."],
    [1, "Too many attempts. Try again in 1 second."],
    [undefined, "Too many attempts. Try again later."],
  ])("words a 429 with Retry-After %s", (retryAfter, message) => {
    expect(authErrorMessage(new ApiError(429, "x", undefined, retryAfter))).toBe(message);
  });

  it("hides the raw 5xx text and validation details", () => {
    expect(authErrorMessage(new ApiError(500, "db is down"))).toBe(
      "Something went wrong on our side. Try again.",
    );
    expect(authErrorMessage(new ApiError(422, "API error: 422"))).toBe(
      "Check what you entered and try again.",
    );
  });
});
