/**
 * SVC-252 — the role a signup creates.
 *
 * This file exists because `AuthFlow` hardcoded `role: "consumer"` in the
 * verify-otp body for months without anyone noticing: every account made
 * through the app was a consumer, and every provider on beta had to be flipped
 * by hand in the database. Nothing failed loudly. Nothing went red.
 *
 * The load-bearing assertion is therefore the payload — what actually reaches
 * `/auth/verify-otp` — not what the screen says. The heading swap is the part a
 * human would notice regressing; the role field is the part they would not.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
const login = vi.fn();

vi.mock("@/lib/api", async () => {
  // ApiError is real: the component branches on `instanceof ApiError` and on
  // `.status`, so a stub would test the stub.
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    API_BASE_URL: "/api/v1",
    apiFetch: (...args: unknown[]) => apiFetch(...args),
  };
});

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ login }),
}));

// Claims the Android hardware back button. Irrelevant here, and it touches
// Capacitor globals that do not exist in jsdom.
vi.mock("@/lib/back-interceptor", () => ({
  pushBackInterceptor: () => () => {},
}));

import { AuthFlow } from "@/components/AuthFlow";

const PHONE = "9876500001";
const OTP = "123456";

/** The `/users/me` probe AuthFlow makes with the fresh token — a raw fetch, not
 *  apiFetch, because the tokens are not in the api module yet at that point. */
function stubProfileFetch(role: string) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: "u1", name: null, phone: `+91${PHONE}`, email: null, role }),
  }) as unknown as typeof fetch;
}

/** Drive the flow to a completed verify and return the verify-otp request body. */
async function submitAndReadVerifyBody() {
  const verifyCall = apiFetch.mock.calls.find(([path]) => path === "/auth/verify-otp");
  expect(verifyCall, "verify-otp was never called").toBeDefined();
  return JSON.parse(verifyCall![1].body as string);
}

describe("AuthFlow role selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockImplementation((path: string) => {
      if (path === "/auth/send-otp") return Promise.resolve({});
      if (path === "/auth/verify-otp") {
        return Promise.resolve({ access_token: "a", refresh_token: "r", is_new_user: true });
      }
      return Promise.reject(new Error(`unexpected call: ${path}`));
    });
    stubProfileFetch("consumer");
  });

  it("sends role=consumer by default", async () => {
    const user = userEvent.setup();
    render(<AuthFlow onComplete={() => {}} />);

    await user.type(screen.getByPlaceholderText("98765 43210"), PHONE);
    await user.click(screen.getByRole("button", { name: /send otp/i }));

    await screen.findByText(/verify otp/i);
    await user.type(document.querySelector("input[autocomplete='one-time-code']")!, OTP);

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/auth/verify-otp", expect.anything()),
    );
    expect((await submitAndReadVerifyBody()).role).toBe("consumer");
  });

  it("sends role=provider after the provider link is tapped", async () => {
    stubProfileFetch("provider");
    const user = userEvent.setup();
    render(<AuthFlow onComplete={() => {}} />);

    // The only entry point into provider signup.
    await user.click(screen.getByRole("button", { name: /are you a service provider/i }));

    // The commitment is restated in front of the user while they type the
    // number it will bind — that framing is the reason this is a link and not
    // a toggle, so it is worth pinning.
    expect(screen.getByText(/join as a service provider/i)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("98765 43210"), PHONE);
    await user.click(screen.getByRole("button", { name: /send otp/i }));

    await screen.findByText(/verify otp/i);
    await user.type(document.querySelector("input[autocomplete='one-time-code']")!, OTP);

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/auth/verify-otp", expect.anything()),
    );
    expect((await submitAndReadVerifyBody()).role).toBe("provider");
  });

  it("returns to consumer when the provider choice is reversed", async () => {
    const user = userEvent.setup();
    render(<AuthFlow onComplete={() => {}} />);

    await user.click(screen.getByRole("button", { name: /are you a service provider/i }));
    await user.click(screen.getByRole("button", { name: /switch to booking a service/i }));

    expect(screen.getByText(/enter your phone number/i)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("98765 43210"), PHONE);
    await user.click(screen.getByRole("button", { name: /send otp/i }));

    await screen.findByText(/verify otp/i);
    await user.type(document.querySelector("input[autocomplete='one-time-code']")!, OTP);

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/auth/verify-otp", expect.anything()),
    );
    expect((await submitAndReadVerifyBody()).role).toBe("consumer");
  });

  it("labels the user with the role that was signed up for when the profile omits one", async () => {
    // Older accounts predate SVC-41 and have no `role` on the profile. Falling
    // back to "consumer" here would relabel a brand-new provider one line after
    // fixing the bug — safe only because Policy A means verify-otp returns 200
    // solely when the stored role matches the one we asked for.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "u1", name: null, phone: `+91${PHONE}`, email: null }),
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    render(<AuthFlow onComplete={() => {}} />);

    await user.click(screen.getByRole("button", { name: /are you a service provider/i }));
    await user.type(screen.getByPlaceholderText("98765 43210"), PHONE);
    await user.click(screen.getByRole("button", { name: /send otp/i }));

    await screen.findByText(/verify otp/i);
    await user.type(document.querySelector("input[autocomplete='one-time-code']")!, OTP);

    await waitFor(() => expect(login).toHaveBeenCalled());
    expect(login.mock.calls[0][2].role).toBe("provider");
  });
});
