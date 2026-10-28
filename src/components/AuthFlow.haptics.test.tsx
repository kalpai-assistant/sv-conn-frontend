/**
 * SVC-398: OTP verified fires a Light impact — once, on the success path only.
 *
 * The ticket calls OTP verified out as a primary success moment; a wrong code
 * must leave the user with the error state and nothing more. The test asserts
 * both directions so a future tweak to the handler can't flip them silently.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
const login = vi.fn();
const hapticImpactLight = vi.fn();

vi.mock("@/lib/api", async () => {
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

vi.mock("@/lib/back-interceptor", () => ({
  pushBackInterceptor: () => () => {},
}));

vi.mock("@/lib/haptics", () => ({
  hapticImpactLight: (...args: unknown[]) => hapticImpactLight(...args),
}));

import { AuthFlow } from "@/components/AuthFlow";

const PHONE = "9876500001";
const OTP = "123456";

function stubProfileFetch() {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      id: "u1",
      name: null,
      phone: `+91${PHONE}`,
      email: null,
      role: "consumer",
    }),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function advanceToOtpStep() {
  const user = userEvent.setup();
  render(<AuthFlow onComplete={() => {}} />);
  await user.type(screen.getByPlaceholderText("98765 43210"), PHONE);
  await user.click(screen.getByRole("button", { name: /send otp/i }));
  await screen.findByText(/verify otp/i);
  return user;
}

describe("AuthFlow haptics", () => {
  it("fires a Light impact on OTP verified", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/auth/send-otp") return Promise.resolve({});
      if (path === "/auth/verify-otp") {
        return Promise.resolve({ access_token: "a", refresh_token: "r", is_new_user: true });
      }
      return Promise.reject(new Error(`unexpected: ${path}`));
    });
    stubProfileFetch();

    const user = await advanceToOtpStep();
    await user.type(document.querySelector("input[autocomplete='one-time-code']")!, OTP);

    await waitFor(() => expect(login).toHaveBeenCalled());
    expect(hapticImpactLight).toHaveBeenCalledOnce();
  });

  it("stays silent when the code is wrong", async () => {
    // No "landed" tap for an InvalidOTP — the error state is the whole user
    // signal, and buzzing on failure would read as success.
    apiFetch.mockImplementation((path: string) => {
      if (path === "/auth/send-otp") return Promise.resolve({});
      if (path === "/auth/verify-otp") {
        return Promise.reject(new Error("Invalid OTP"));
      }
      return Promise.reject(new Error(`unexpected: ${path}`));
    });

    const user = await advanceToOtpStep();
    await user.type(document.querySelector("input[autocomplete='one-time-code']")!, OTP);

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/auth/verify-otp", expect.anything()),
    );
    expect(login).not.toHaveBeenCalled();
    expect(hapticImpactLight).not.toHaveBeenCalled();
  });
});
