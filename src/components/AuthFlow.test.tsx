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

import { ApiError } from "@/lib/api";

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

  describe("Policy A role conflict", () => {
    /** Take the flow to a failed verify and return the userEvent handle. */
    async function verifyAndFail(error: unknown) {
      apiFetch.mockImplementation((path: string) => {
        if (path === "/auth/send-otp") return Promise.resolve({});
        if (path === "/auth/verify-otp") return Promise.reject(error);
        return Promise.reject(new Error(`unexpected call: ${path}`));
      });

      const user = userEvent.setup();
      render(<AuthFlow onComplete={() => {}} />);

      await user.click(screen.getByRole("button", { name: /are you a service provider/i }));
      await user.type(screen.getByPlaceholderText("98765 43210"), PHONE);
      await user.click(screen.getByRole("button", { name: /send otp/i }));
      await screen.findByText(/verify otp/i);
      await user.type(document.querySelector("input[autocomplete='one-time-code']")!, OTP);
      return user;
    }

    const REMEDY = /sign in as a customer instead/i;

    it("offers the remedy when the backend sends the ROLE_MISMATCH code", async () => {
      await verifyAndFail(new ApiError(400, "anything at all", undefined, "ROLE_MISMATCH"));

      // Message text deliberately unrecognisable: the code alone must carry it,
      // otherwise the copy is still load-bearing.
      expect(await screen.findByRole("button", { name: REMEDY })).toBeInTheDocument();
    });

    it("ignores the prose when the code is absent", async () => {
      // The inverse of the old fallback test, and the point of backend #146.
      // This message is exactly what Policy A used to say, and it must no
      // longer be enough on its own — otherwise the copy is still what drives
      // the affordance and rewording it would silently remove the button.
      await verifyAndFail(
        new ApiError(
          400,
          "This phone is already registered as consumer. Sign in with the same role.",
        ),
      );

      await screen.findByText(/already registered as consumer/i);
      expect(screen.queryByRole("button", { name: REMEDY })).not.toBeInTheDocument();
    });

    it("does not offer the remedy for an ordinary bad OTP", async () => {
      await verifyAndFail(new ApiError(400, "OTP is incorrect or has expired"));

      await screen.findByText(/OTP is incorrect/i);
      expect(screen.queryByRole("button", { name: REMEDY })).not.toBeInTheDocument();
    });

    it("clears the remedy when the role is switched back", async () => {
      const user = await verifyAndFail(
        new ApiError(400, "already registered as consumer", undefined, "ROLE_MISMATCH"),
      );
      await screen.findByRole("button", { name: REMEDY });

      // One tap: flips the role and returns for a fresh code, because the
      // rejected verify already consumed this one server-side.
      await user.click(screen.getByRole("button", { name: REMEDY }));

      // The step change crosses an `AnimatePresence mode="wait"` boundary, so
      // the phone step is not mounted synchronously.
      expect(await screen.findByText(/enter your phone number/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: REMEDY })).not.toBeInTheDocument();
      // The stale error is a verdict on the role just left behind.
      expect(screen.queryByText(/already registered/i)).not.toBeInTheDocument();
    });

    it("clears the remedy when the number is changed", async () => {
      const user = await verifyAndFail(
        new ApiError(400, "already registered as consumer", undefined, "ROLE_MISMATCH"),
      );
      await screen.findByRole("button", { name: REMEDY });

      await user.click(screen.getByRole("button", { name: /change number/i }));

      // Anchored on the input, not the heading: "Change number" deliberately
      // keeps the chosen role, so this screen still reads "Join as a service
      // provider" — correcting a typo is not a change of identity.
      await screen.findByPlaceholderText("98765 43210");
      expect(screen.getByText(/join as a service provider/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: REMEDY })).not.toBeInTheDocument();
      expect(screen.queryByText(/already registered/i)).not.toBeInTheDocument();
    });
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

describe("AuthFlow on /invite (SVC-322)", () => {
  // An invitee must end up a consumer-role account: a provider account gets
  // its own Pro-for-self at birth and can then never join a team. So the
  // invite flow offers no way to pick "provider" at all.
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

  it("says what the sign-in is for, and hides the provider link", () => {
    render(<AuthFlow onComplete={() => {}} invite />);
    expect(screen.getByRole("heading", { name: /sign in to join your team/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /are you a service provider/i }),
    ).not.toBeInTheDocument();
  });

  it("signs up as a consumer", async () => {
    const user = userEvent.setup();
    render(<AuthFlow onComplete={() => {}} invite />);

    await user.type(screen.getByPlaceholderText("98765 43210"), PHONE);
    await user.click(screen.getByRole("button", { name: /send otp/i }));
    await screen.findByText(/verify otp/i);
    await user.type(document.querySelector("input[autocomplete='one-time-code']")!, OTP);

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/auth/verify-otp", expect.anything()),
    );
    expect((await submitAndReadVerifyBody()).role).toBe("consumer");
  });

  it("tells a provider number it can't join, instead of offering to switch roles", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/auth/send-otp") return Promise.resolve({});
      if (path === "/auth/verify-otp") {
        return Promise.reject(new ApiError(400, "x", undefined, "ROLE_MISMATCH"));
      }
      return Promise.reject(new Error(`unexpected call: ${path}`));
    });
    const user = userEvent.setup();
    render(<AuthFlow onComplete={() => {}} invite />);

    await user.type(screen.getByPlaceholderText("98765 43210"), PHONE);
    await user.click(screen.getByRole("button", { name: /send otp/i }));
    await screen.findByText(/verify otp/i);
    await user.type(document.querySelector("input[autocomplete='one-time-code']")!, OTP);

    expect(await screen.findByText(/registered as a service provider/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /sign in as a service provider instead/i }),
    ).not.toBeInTheDocument();
  });
});
