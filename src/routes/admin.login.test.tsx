/**
 * SVC-345 admin login tests.
 *
 * Shape-matched to AuthFlow.test.tsx so the two auth entry points stay
 * recognisable as a pair. Load-bearing assertions:
 *
 * - the POST body goes to /auth/admin/* (not the consumer path)
 * - the role claim on the stored user is "admin" even if /users/me omits it
 * - a 404 from the backend reads as "not registered as admin" — the
 *   role-enumeration leak is deliberately not exposed as a 403 or specific
 *   wording the user could pattern-match on
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

const apiFetch = vi.fn();
const login = vi.fn();
const navigate = vi.fn();

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

// Replace the real router navigate — the test runs the component outside the
// router tree, so a real navigate() would crash. Only the call shape matters.
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => navigate,
    // createFileRoute is used at module scope; it must still return something
    // that reads back as a route stub with a `.component`.
    createFileRoute: () => (opts: { component: unknown }) => opts,
  };
});

import { Route as AdminLoginRoute } from "@/routes/admin.login";

// The module's default export is the route config object; the component is
// hung off `.component` by TanStack's createFileRoute.
const AdminLoginPage = (AdminLoginRoute as unknown as { component: React.FC }).component;

const PHONE = "9999900001";
const OTP = "123456";

function stubProfileFetch(role: string | undefined = "admin") {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      id: "u1",
      name: "Vipul",
      phone: `+91${PHONE}`,
      email: null,
      // Deliberately omit when `undefined` is passed, so the admin.login.tsx
      // default-to-"admin" branch is exercised.
      ...(role ? { role } : {}),
    }),
  }) as unknown as typeof fetch;
}

describe("admin login flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockImplementation((path: string) => {
      if (path === "/auth/admin/send-otp") return Promise.resolve({});
      if (path === "/auth/admin/verify-otp") {
        return Promise.resolve({ access_token: "a", refresh_token: "r", is_new_user: false });
      }
      return Promise.reject(new Error(`unexpected call: ${path}`));
    });
    stubProfileFetch("admin");
  });

  it("posts to the admin endpoints, not the consumer ones", async () => {
    const user = userEvent.setup();
    render(<AdminLoginPage />);

    await user.type(screen.getByPlaceholderText("98765 43210"), PHONE);
    await user.click(screen.getByRole("button", { name: /send otp/i }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/auth/admin/send-otp", expect.anything()),
    );

    // Progresses to the OTP step and typing six digits fires verify.
    await screen.findByText(/enter the 6-digit code/i);
    await user.type(document.querySelector("input[autocomplete='one-time-code']")!, OTP);

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/auth/admin/verify-otp", expect.anything()),
    );

    // Neither consumer path got called — a regression on this is the whole
    // point of SVC-345.
    expect(apiFetch).not.toHaveBeenCalledWith("/auth/send-otp", expect.anything());
    expect(apiFetch).not.toHaveBeenCalledWith("/auth/verify-otp", expect.anything());

    await waitFor(() => expect(login).toHaveBeenCalled());
    // SVC-346: post-verify now lands on the admin dashboard, not the deep-link
    // to KYC the SVC-345 implementation shipped with.
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/admin", replace: true }));
  });

  it("renders the 'not registered as admin' message on 404 from send-otp", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/auth/admin/send-otp") {
        return Promise.reject(new ApiError(404, "No admin account exists for this phone."));
      }
      return Promise.reject(new Error(`unexpected call: ${path}`));
    });

    const user = userEvent.setup();
    render(<AdminLoginPage />);

    await user.type(screen.getByPlaceholderText("98765 43210"), PHONE);
    await user.click(screen.getByRole("button", { name: /send otp/i }));

    expect(await screen.findByText(/not registered as an admin/i)).toBeInTheDocument();
    // Must NOT suggest switching to another role — there is no other role to
    // switch to on the /admin surface.
    expect(screen.queryByText(/sign in as a customer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sign in as a service provider/i)).not.toBeInTheDocument();
  });

  it("renders a rate-limit message on 429", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/auth/admin/send-otp") {
        return Promise.reject(new ApiError(429, "Too many requests", 60));
      }
      return Promise.reject(new Error(`unexpected call: ${path}`));
    });

    const user = userEvent.setup();
    render(<AdminLoginPage />);

    await user.type(screen.getByPlaceholderText("98765 43210"), PHONE);
    await user.click(screen.getByRole("button", { name: /send otp/i }));

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
  });

  it("renders a wrong-code message on 400 InvalidOTP from verify-otp", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/auth/admin/send-otp") return Promise.resolve({});
      if (path === "/auth/admin/verify-otp") {
        return Promise.reject(new ApiError(400, "OTP is incorrect or has expired"));
      }
      return Promise.reject(new Error(`unexpected call: ${path}`));
    });

    const user = userEvent.setup();
    render(<AdminLoginPage />);

    await user.type(screen.getByPlaceholderText("98765 43210"), PHONE);
    await user.click(screen.getByRole("button", { name: /send otp/i }));
    await screen.findByText(/enter the 6-digit code/i);
    await user.type(document.querySelector("input[autocomplete='one-time-code']")!, OTP);

    expect(await screen.findByText(/OTP is incorrect/i)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("defaults the stored user to role=admin when /users/me omits the field", async () => {
    // Older `/users/me` builds don't carry `role` — the admin login default
    // must kick in, otherwise the AppGate would bounce them off /admin on
    // the very next render.
    stubProfileFetch(undefined);

    const user = userEvent.setup();
    render(<AdminLoginPage />);

    await user.type(screen.getByPlaceholderText("98765 43210"), PHONE);
    await user.click(screen.getByRole("button", { name: /send otp/i }));
    await screen.findByText(/enter the 6-digit code/i);
    await user.type(document.querySelector("input[autocomplete='one-time-code']")!, OTP);

    await waitFor(() => expect(login).toHaveBeenCalled());
    const [, , stored] = login.mock.calls[0];
    expect(stored.role).toBe("admin");
  });
});
