/**
 * The sign-in screens and the guard, through the real router and under
 * StrictMode, as main.tsx mounts them. Only fetch is faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { apiFetch, getSessionToken, setSessionToken } from "@/lib/api";
import { getChallengeToken, login, resetAuthState } from "@/lib/auth";
import { adminUser, appError, json, mockApi, renderApp } from "@/test/harness";

const LOGIN = "POST /admin/auth/login";
const SETUP = "POST /admin/auth/totp/setup";
const VERIFY = "POST /admin/auth/totp/verify";
const ME = "GET /admin/auth/me";

const challenge = (setupRequired: boolean) => () =>
  json({ requires_totp: true, totp_setup_required: setupRequired, challenge_token: "c1" });

const session = () =>
  json({
    access_token: "s1",
    token_type: "bearer",
    expires_in: 43200,
    admin: adminUser(),
  });

const otpauth = (secret: string) => () =>
  json({ otpauth_url: `otpauth://totp/EazyServ%20Admin:a?secret=${secret}&issuer=EazyServ` });

const pathOf = (router: ReturnType<typeof renderApp>) => router.state.location.pathname;

async function submitLogin(email = "admin@eazyserv.local", password = "pw") {
  await userEvent.type(await screen.findByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

async function submitCode(code: string) {
  await userEvent.type(await screen.findByLabelText("6-digit code"), code);
  await userEvent.click(screen.getByRole("button", { name: "Verify" }));
}

beforeEach(() => {
  resetAuthState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/login", () => {
  it("goes to /totp for an admin who has an authenticator", async () => {
    const api = mockApi({ [LOGIN]: challenge(false) });
    const router = renderApp("/login");

    await submitLogin();

    expect(await screen.findByRole("heading", { name: "Enter your code" })).toBeInTheDocument();
    expect(pathOf(router)).toBe("/totp");
    expect(api.count(SETUP)).toBe(0);
  });

  it("goes to /totp-setup on a first login", async () => {
    mockApi({ [LOGIN]: challenge(true), [SETUP]: otpauth("ABC") });
    const router = renderApp("/login");

    await submitLogin();

    expect(
      await screen.findByRole("heading", { name: "Set up your authenticator" }),
    ).toBeInTheDocument();
    expect(pathOf(router)).toBe("/totp-setup");
  });

  it("shows a wrong password as a form error and stays put", async () => {
    mockApi({
      [LOGIN]: () => appError(401, "INVALID_CREDENTIALS", "Invalid email or password"),
    });
    const router = renderApp("/login");

    await submitLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(pathOf(router)).toBe("/login");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Email")).toHaveValue("admin@eazyserv.local");
  });

  it("does not sign out an existing token on a failed login", async () => {
    // The guard would normally keep a signed-in user off /login; this is the
    // 401-is-a-form-error rule holding even if they get here mid-expiry.
    mockApi({ [LOGIN]: () => appError(401, "INVALID_CREDENTIALS", "Invalid email or password") });
    renderApp("/login");
    await screen.findByLabelText("Email");
    setSessionToken("still-here");

    await submitLogin();

    await screen.findByRole("alert");
    expect(getSessionToken()).toBe("still-here");
  });

  it("uses the status and Retry-After for a 429, with no code to go on", async () => {
    mockApi({
      [LOGIN]: () =>
        json({ error: true, message: "Rate limit", status_code: 429 }, 429, {
          "Retry-After": "600",
        }),
    });
    renderApp("/login");

    await submitLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Try again in 10 minutes.",
    );
  });

  it("shows a readable allowlist 403 in plain words", async () => {
    mockApi({
      [LOGIN]: () =>
        json(
          {
            error: true,
            message: "Admin access is restricted from this network.",
            status_code: 403,
          },
          403,
        ),
    });
    renderApp("/login");

    await submitLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Admin access is restricted from this network.",
    );
  });

  it("explains a failed request, which is how a cross-origin allowlist block arrives", async () => {
    mockApi({
      [LOGIN]: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    renderApp("/login");

    await submitLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reach the server. Check your connection; this network may not be allowed.",
    );
  });

  it("sends a signed-in user to the home page", async () => {
    setSessionToken("t1");
    mockApi({ [ME]: () => json(adminUser()) });
    const router = renderApp("/login");

    expect(await screen.findByRole("heading", { name: "Admin console" })).toBeInTheDocument();
    expect(pathOf(router)).toBe("/");
  });

  it("ignores an unknown reason in the URL", async () => {
    renderApp("/login?reason=<b>pwned</b>");

    await screen.findByRole("heading", { name: "Sign in" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("abandons a half-finished login", async () => {
    mockApi({ [LOGIN]: challenge(false) });
    await login("a@b.c", "pw");
    expect(getChallengeToken()).toBe("c1");

    renderApp("/login");
    await screen.findByRole("heading", { name: "Sign in" });

    expect(getChallengeToken()).toBeNull();
  });
});

describe("/totp and /totp-setup without a challenge", () => {
  it.each(["/totp", "/totp-setup"])("%s sends the user back to /login", async (path) => {
    const api = mockApi({});
    const router = renderApp(path);

    expect(await screen.findByRole("alert")).toHaveTextContent("Your sign-in timed out");
    expect(pathOf(router)).toBe("/login");
    expect(api.calls).toHaveLength(0);
  });

  it.each(["/totp", "/totp-setup"])("%s sends a signed-in user home", async (path) => {
    setSessionToken("t1");
    mockApi({ [ME]: () => json(adminUser()) });
    const router = renderApp(path);

    await screen.findByRole("heading", { name: "Admin console" });
    expect(pathOf(router)).toBe("/");
  });
});

describe("/totp-setup", () => {
  async function arriveAtSetup(setupRoute: () => Response | Promise<Response>) {
    const api = mockApi({ [LOGIN]: challenge(true), [SETUP]: setupRoute });
    await login("a@b.c", "pw");
    const router = renderApp("/totp-setup");
    return { api, router };
  }

  it("calls /totp/setup exactly once under StrictMode, and shows QR and key", async () => {
    const { api } = await arriveAtSetup(otpauth("JBSWY3DP"));

    expect(await screen.findByTestId("totp-setup-key")).toHaveTextContent("JBSWY3DP");
    expect(screen.getByTitle("Authenticator QR code")).toBeInTheDocument();
    expect(api.count(SETUP)).toBe(1);
  });

  it("does not ask for a new secret after a wrong code", async () => {
    const { api } = await arriveAtSetup(otpauth("JBSWY3DP"));
    api.routes[VERIFY] = () => appError(401, "INVALID_TOTP_CODE");

    await screen.findByTestId("totp-setup-key");
    await submitCode("000000");

    expect(await screen.findByRole("alert")).toHaveTextContent("wrong or was just used");
    expect(screen.getByTestId("totp-setup-key")).toHaveTextContent("JBSWY3DP");
    expect(api.count(SETUP)).toBe(1);
  });

  it("signs in on the right code", async () => {
    const { api, router } = await arriveAtSetup(otpauth("JBSWY3DP"));
    api.routes[VERIFY] = session;
    api.routes[ME] = () => json(adminUser());

    await screen.findByTestId("totp-setup-key");
    await submitCode("123456");

    await screen.findByRole("heading", { name: "Admin console" });
    expect(pathOf(router)).toBe("/");
    expect(getSessionToken()).toBe("s1");
    expect(getChallengeToken()).toBeNull();
  });

  it("offers a retry after a failure, and the QR comes from the newest call", async () => {
    const { api } = await arriveAtSetup(() => json({}, 500));

    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(api.count(SETUP)).toBe(2));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    api.routes[SETUP] = otpauth("NEWEST");
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByTestId("totp-setup-key")).toHaveTextContent("NEWEST");
    expect(api.count(SETUP)).toBe(3);
  });

  it("returns to /login with a message when the challenge has expired", async () => {
    const { router } = await arriveAtSetup(() => appError(401, "INVALID_CHALLENGE"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your sign-in timed out");
    expect(pathOf(router)).toBe("/login");
    expect(getChallengeToken()).toBeNull();
  });

  it("moves to /totp when the authenticator is already active", async () => {
    const { router } = await arriveAtSetup(() => appError(409, "TOTP_ALREADY_ACTIVE"));

    await screen.findByRole("heading", { name: "Enter your code" });
    expect(pathOf(router)).toBe("/totp");
  });
});

describe("/totp", () => {
  async function arriveAtTotp() {
    const api = mockApi({ [LOGIN]: challenge(false) });
    await login("a@b.c", "pw");
    const router = renderApp("/totp");
    return { api, router };
  }

  it("keeps the user on the screen after a wrong code, ready for another", async () => {
    const { api, router } = await arriveAtTotp();
    api.routes[VERIFY] = () => appError(401, "INVALID_TOTP_CODE", "Code is incorrect");

    await submitCode("000000");

    expect(await screen.findByRole("alert")).toHaveTextContent("wrong or was just used");
    expect(pathOf(router)).toBe("/totp");
    expect(getChallengeToken()).toBe("c1");
    expect(screen.getByLabelText("6-digit code")).toHaveValue("");
  });

  it("returns to /login with a message when the challenge has expired", async () => {
    const { api, router } = await arriveAtTotp();
    api.routes[VERIFY] = () => appError(401, "INVALID_CHALLENGE");

    await submitCode("123456");

    expect(await screen.findByRole("alert")).toHaveTextContent("Your sign-in timed out");
    expect(pathOf(router)).toBe("/login");
    expect(getChallengeToken()).toBeNull();
  });

  it("moves to /totp-setup if the authenticator turns out not to be set up", async () => {
    const { api, router } = await arriveAtTotp();
    api.routes[VERIFY] = () => appError(409, "TOTP_SETUP_REQUIRED");
    api.routes[SETUP] = otpauth("ABC");

    await submitCode("123456");

    await screen.findByTestId("totp-setup-key");
    expect(pathOf(router)).toBe("/totp-setup");
  });

  it("stays put on a 429 and says how long to wait", async () => {
    const { api, router } = await arriveAtTotp();
    api.routes[VERIFY] = () => json({ error: true, message: "x" }, 429, { "Retry-After": "300" });

    await submitCode("123456");

    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in 5 minutes");
    expect(pathOf(router)).toBe("/totp");
  });

  it("strips non-digits from a pasted code and caps it at six", async () => {
    await arriveAtTotp();
    const input = await screen.findByLabelText("6-digit code");

    await userEvent.click(input);
    await userEvent.paste("123 456 789");

    expect(input).toHaveValue("123456");
  });

  it("keeps Verify disabled until six digits are in", async () => {
    await arriveAtTotp();
    await userEvent.type(await screen.findByLabelText("6-digit code"), "12345");

    expect(screen.getByRole("button", { name: "Verify" })).toBeDisabled();
  });
});

describe("the _authed guard", () => {
  it("sends a user with no token to /login, without calling the API", async () => {
    const api = mockApi({});
    const router = renderApp("/operator/kyc");

    await screen.findByRole("heading", { name: "Sign in" });
    expect(pathOf(router)).toBe("/login");
    expect(api.calls).toHaveLength(0);
  });

  it("lets a valid session through, sending the Bearer token", async () => {
    setSessionToken("t1");
    const api = mockApi({ [ME]: () => json(adminUser()) });
    renderApp("/operator/kyc");

    expect(
      await screen.findByRole("heading", { level: 1, name: "KYC review queue" }),
    ).toBeInTheDocument();
    expect(api.headers(ME).Authorization).toBe("Bearer t1");
  });

  it("signs out and explains when /me answers 401", async () => {
    setSessionToken("expired");
    mockApi({ [ME]: () => json({ detail: "Session has ended" }, 401) });
    const router = renderApp("/operator/kyc");

    expect(await screen.findByRole("alert")).toHaveTextContent("Your session has ended");
    expect(pathOf(router)).toBe("/login");
    expect(getSessionToken()).toBeNull();
  });

  it("keeps the token and offers a retry when /me fails with a 5xx", async () => {
    setSessionToken("t1");
    const api = mockApi({ [ME]: () => json({}, 503) });
    renderApp("/");

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(getSessionToken()).toBe("t1");

    api.routes[ME] = () => json(adminUser());
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Admin console" })).toBeInTheDocument();
  });

  it("shows the allowlist's message when /me is blocked, without signing out", async () => {
    setSessionToken("t1");
    mockApi({
      [ME]: () =>
        json({ error: true, message: "Admin access is restricted from this network." }, 403),
    });
    renderApp("/");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Admin access is restricted from this network.",
    );
    expect(getSessionToken()).toBe("t1");
  });

  it("redirects a hidden route opened by URL to the home page", async () => {
    setSessionToken("t1");
    mockApi({ [ME]: () => json(adminUser("ops")) });
    const router = renderApp("/analytics/overview");

    await screen.findByRole("heading", { name: "Admin console" });
    expect(pathOf(router)).toBe("/");
  });

  it("lets support open the same route", async () => {
    setSessionToken("t1");
    mockApi({ [ME]: () => json(adminUser("support")) });
    const router = renderApp("/analytics/overview");

    await screen.findByRole("heading", { level: 1, name: "Overview" });
    expect(pathOf(router)).toBe("/analytics/overview");
  });

  it("sends the user to /login when any later call finds the session has ended", async () => {
    setSessionToken("t1");
    const api = mockApi({ [ME]: () => json(adminUser()) });
    const router = renderApp("/");
    await screen.findByRole("heading", { name: "Admin console" });

    api.routes["GET /admin/users"] = () => json({ detail: "Session has ended" }, 401);
    await expect(apiFetch("/admin/users")).rejects.toMatchObject({ status: 401 });

    expect(await screen.findByRole("alert")).toHaveTextContent("Your session has ended");
    expect(pathOf(router)).toBe("/login");
  });
});
