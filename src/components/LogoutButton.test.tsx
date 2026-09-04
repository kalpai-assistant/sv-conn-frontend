/**
 * Sign out, shared by both profiles (SVC-269).
 *
 * Two properties here are load-bearing and neither is visible on screen:
 *
 * 1. **A provider goes offline before the tokens are cleared.** `logout()`
 *    wipes the JWT, and the status call needs it — get the order wrong and the
 *    request 401s, leaving the provider `is_online` forever. The app would look
 *    identical either way.
 * 2. **Signing out completes even when that call fails.** Logout is entirely
 *    local and works offline today (verified on a device with wifi and mobile
 *    data disabled). Blocking it on a network call would trap someone in an
 *    account on a handed-back phone.
 *
 * The confirm step is only asked of a provider who is actually online, since
 * they are the only ones losing anything by signing out.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logout = vi.fn();
const navigate = vi.fn();
const mutateAsync = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ logout }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@/hooks/useApi", () => ({ useSetOnlineStatus: () => ({ mutateAsync }) }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: (...a: unknown[]) => toastError(...a), success: vi.fn() }),
}));

import { LogoutButton } from "@/components/LogoutButton";

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue(undefined);
});

describe("consumer", () => {
  it("signs out in one tap, with no status call", async () => {
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(screen.getByRole("button", { name: /logout/i }));

    await waitFor(() => expect(logout).toHaveBeenCalled());
    // No is_online concept for a consumer — calling it would 403 or worse.
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  it("is disabled mid-edit so unsaved profile changes aren't lost", async () => {
    render(<LogoutButton disabled />);

    expect(screen.getByRole("button", { name: /logout/i })).toBeDisabled();
  });
});

describe("provider — offline already", () => {
  it("signs out in one tap and skips the warning", async () => {
    const user = userEvent.setup();
    render(<LogoutButton isOnline={false} />);

    await user.click(screen.getByRole("button", { name: /logout/i }));

    await waitFor(() => expect(logout).toHaveBeenCalled());
    // Nothing to change, and nothing to warn about — they are already offline.
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

describe("provider — online", () => {
  it("warns before signing out, and cancelling really cancels", async () => {
    const user = userEvent.setup();
    render(<LogoutButton isOnline />);

    await user.click(screen.getByRole("button", { name: /logout/i }));
    expect(await screen.findByText(/You're online/i)).toBeInTheDocument();
    expect(screen.getByText(/stop job requests/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /stay signed in/i }));

    expect(logout).not.toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("goes offline BEFORE clearing the session", async () => {
    // The ordering that matters. `logout()` clears the JWT the status call
    // needs, so a reversed order silently 401s and the provider stays online.
    const order: string[] = [];
    mutateAsync.mockImplementation(async () => {
      order.push("offline");
    });
    logout.mockImplementation(() => {
      order.push("logout");
    });
    const user = userEvent.setup();
    render(<LogoutButton isOnline />);

    await user.click(screen.getByRole("button", { name: /logout/i }));
    await user.click(await screen.findByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith(false);
    expect(order).toEqual(["offline", "logout"]);
  });

  it("still signs out when the device has no connection", async () => {
    // Verified on a real device: logout is entirely local and works offline.
    // Blocking it on this call would strand someone on a handed-back phone.
    mutateAsync.mockRejectedValue(new Error("Network request failed"));
    const user = userEvent.setup();
    render(<LogoutButton isOnline />);

    await user.click(screen.getByRole("button", { name: /logout/i }));
    await user.click(await screen.findByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  it("says so when it could not take them offline", async () => {
    // Silence here would recreate the exact bug this fixes: the provider walks
    // away believing they are fully signed out while the broadcast keeps
    // matching them.
    mutateAsync.mockRejectedValue(new Error("Network request failed"));
    const user = userEvent.setup();
    render(<LogoutButton isOnline />);

    await user.click(screen.getByRole("button", { name: /logout/i }));
    await user.click(await screen.findByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/still show as online/i);
  });
});
