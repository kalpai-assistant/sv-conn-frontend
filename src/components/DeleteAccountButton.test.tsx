/**
 * Delete my account (SVC-367). Pinned:
 *
 * - Confirm stays disabled until DELETE is typed — trimmed, any case.
 * - Success order: DELETE /users/me with the refresh token, and only on the
 *   204 `logout()`, then home, then the toast. Nothing local changes first, so
 *   a refusal leaves the user exactly as they were — push included.
 * - The tokens are dead after the 204, and `logout()`'s push-clear PATCH 401s.
 *   That must not fire a silent refresh, and must not hold up the navigation.
 * - Each 409 shows the backend's message and its way out: the live bookings
 *   (to the right screen per persona), the team screen, or just the message.
 *
 * `api.ts` is real and `fetch` is stubbed, so the refresh behaviour under test
 * is the shipping one.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const logout = vi.fn();
const navigate = vi.fn((..._a: unknown[]) => calls.push("navigate"));
const toastSuccess = vi.fn((..._a: unknown[]) => calls.push("toast"));
const toastError = vi.fn();
const useProJobs = vi.fn();

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ logout }) }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({
    to,
    params,
    children,
    className,
  }: React.PropsWithChildren<{
    to: string;
    params?: Record<string, string>;
    className?: string;
  }>) => (
    <a
      href={params?.bookingId ? to.replace("$bookingId", params.bookingId) : to}
      className={className}
    >
      {children}
    </a>
  ),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  }),
}));
vi.mock("@/hooks/usePro", () => ({
  useProJobs: (...a: unknown[]) => useProJobs(...a),
}));

import { apiFetch, clearTokens, getAccessToken, setTokens } from "@/lib/api";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";

const fetchMock = vi.fn();

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const noContent = () => new Response(null, { status: 204 });
const refusal = (code: string, message: string, details: Record<string, unknown>) =>
  json(409, { error: "Conflict", message, status_code: 409, code, details });

const urlOf = (call: unknown[]) => String(call[0]);

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  setTokens("access-1", "refresh-1");
  useProJobs.mockReturnValue({ data: undefined });
  logout.mockImplementation(() => calls.push("logout"));
});

afterEach(() => {
  clearTokens();
  vi.unstubAllGlobals();
});

async function openDialog(ui: React.ReactElement = <DeleteAccountButton persona="consumer" />) {
  const user = userEvent.setup();
  render(ui);
  await user.click(screen.getByRole("button", { name: /delete my account/i }));
  const dialog = await screen.findByRole("alertdialog");
  return { user, dialog };
}

async function typeAndConfirm(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.type(within(dialog).getByRole("textbox"), "delete");
  await user.click(within(dialog).getByRole("button", { name: /^delete account$/i }));
}

describe("the typed guard", () => {
  it("shows the ticket's copy", async () => {
    const { dialog } = await openDialog();
    expect(dialog).toHaveTextContent(
      "This cannot be undone. Your profile, addresses, and personal data will be deleted. Past bookings will remain in anonymized form for financial records.",
    );
  });

  it.each([
    ["", false],
    ["DELET", false],
    ["DELETED", false],
    ["DELETE", true],
    ["delete ", true],
    [" DELETE", true],
    ["DELETe", true],
  ])("%j → enabled %s", async (input, enabled) => {
    const { user, dialog } = await openDialog();
    if (input) await user.type(within(dialog).getByRole("textbox"), input);
    const confirm = within(dialog).getByRole("button", { name: /^delete account$/i });
    if (enabled) expect(confirm).toBeEnabled();
    else expect(confirm).toBeDisabled();
  });

  it("is disabled mid-edit, like Logout", () => {
    render(<DeleteAccountButton persona="consumer" disabled />);
    expect(screen.getByRole("button", { name: /delete my account/i })).toBeDisabled();
  });
});

describe("success", () => {
  it("deletes with the refresh token, then logs out, goes home and toasts — in that order", async () => {
    fetchMock.mockImplementation(async () => {
      calls.push("DELETE");
      return noContent();
    });
    const { user, dialog } = await openDialog();

    await typeAndConfirm(user, dialog);

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Your account has been deleted."),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/users\/me$/);
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(String(init.body))).toEqual({ refresh_token: "refresh-1" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer access-1");
    expect(calls).toEqual(["DELETE", "logout", "navigate", "toast"]);
    expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  it("logout's push-clear 401 does not trigger a refresh, and does not hold up home or the toast", async () => {
    // What the real logout() does that matters here: wipe the tokens, then fire
    // (not await) the push-clear PATCH with the JWT it snapshotted first.
    let resolvePatch: (r: Response) => void = () => {};
    logout.mockImplementation(() => {
      calls.push("logout");
      const dead = getAccessToken();
      clearTokens();
      void apiFetch("/users/me/fcm-token", {
        method: "PATCH",
        body: JSON.stringify({ fcm_token: null }),
        headers: { Authorization: `Bearer ${dead}` },
      }).catch(() => {});
    });
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (init.method === "DELETE") return noContent();
      // The PATCH hangs until we let it answer: home and the toast must not wait.
      return new Promise<Response>((r) => (resolvePatch = r));
    });
    const { user, dialog } = await openDialog();

    await typeAndConfirm(user, dialog);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true });

    resolvePatch(json(401, { detail: "Token revoked" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => urlOf(c).endsWith("/users/me/fcm-token"))).toBe(true),
    );
    // Give the 401 handler its turn, then check nothing went to refresh.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock.mock.calls.some((c) => urlOf(c).includes("/auth/refresh"))).toBe(false);
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe("refusals change nothing locally", () => {
  it("ACTIVE_BOOKINGS lists each booking with Open booking → tracking, for a consumer", async () => {
    fetchMock.mockResolvedValue(
      refusal("ACTIVE_BOOKINGS", "Finish or cancel your active bookings first.", {
        booking_ids: ["b-1", "b-2"],
      }),
    );
    const { user, dialog } = await openDialog();

    await typeAndConfirm(user, dialog);

    expect(
      await within(dialog).findByText("Finish or cancel your active bookings first."),
    ).toBeVisible();
    const links = within(dialog).getAllByRole("link", { name: /open booking/i });
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/tracking/b-1", "/tracking/b-2"]);
    expect(logout).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    // No cancel shortcut: cancelling has its own flow on the booking screen.
    expect(within(dialog).queryByText(/cancel booking/i)).toBeNull();
  });

  it("ACTIVE_BOOKINGS on the provider profile opens the provider booking screen", async () => {
    fetchMock.mockResolvedValue(
      refusal("ACTIVE_BOOKINGS", "Finish or cancel your active bookings first.", {
        booking_ids: ["b-9"],
      }),
    );
    const { user, dialog } = await openDialog(<DeleteAccountButton persona="provider" />);

    await typeAndConfirm(user, dialog);

    const link = await within(dialog).findByRole("link", { name: /open booking/i });
    expect(link).toHaveAttribute("href", "/provider/bookings/b-9");
  });

  it("ACTIVE_BOOKINGS for a team Pro: a job they're working opens the job screen, their own booking opens tracking", async () => {
    useProJobs.mockImplementation((_scope: string, enabled: boolean) => ({
      data: enabled ? { jobs: [{ id: "job-1" }], total: 1 } : undefined,
    }));
    fetchMock.mockResolvedValue(
      refusal("ACTIVE_BOOKINGS", "Finish or cancel your active bookings first.", {
        booking_ids: ["job-1", "mine-1"],
      }),
    );
    const { user, dialog } = await openDialog(<DeleteAccountButton persona="consumer" isTeamPro />);

    await typeAndConfirm(user, dialog);

    await within(dialog).findAllByRole("link", { name: /open booking/i });
    await waitFor(() =>
      expect(
        within(dialog)
          .getAllByRole("link", { name: /open booking/i })
          .map((a) => a.getAttribute("href")),
      ).toEqual(["/pro/jobs/job-1", "/tracking/mine-1"]),
    );
  });

  it("TEAM_HAS_PROS shows the message and links to My Team", async () => {
    fetchMock.mockResolvedValue(
      refusal("TEAM_HAS_PROS", "Remove your team members first.", { professional_ids: ["p-1"] }),
    );
    const { user, dialog } = await openDialog(<DeleteAccountButton persona="provider" />);

    await typeAndConfirm(user, dialog);

    expect(await within(dialog).findByText("Remove your team members first.")).toBeVisible();
    expect(within(dialog).getByRole("link", { name: /go to my team/i })).toHaveAttribute(
      "href",
      "/provider/team",
    );
    expect(logout).not.toHaveBeenCalled();
  });

  it("UNPAID_BALANCE shows the backend message and nothing else to tap", async () => {
    fetchMock.mockResolvedValue(
      refusal("UNPAID_BALANCE", "You have ₹420 still to be paid out.", { balance_paise: 42000 }),
    );
    const { user, dialog } = await openDialog(<DeleteAccountButton persona="provider" />);

    await typeAndConfirm(user, dialog);

    expect(await within(dialog).findByText("You have ₹420 still to be paid out.")).toBeVisible();
    expect(within(dialog).queryAllByRole("link")).toHaveLength(0);
    expect(logout).not.toHaveBeenCalled();
  });

  it("a network failure says nothing was deleted and keeps the user signed in", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { user, dialog } = await openDialog();

    await typeAndConfirm(user, dialog);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(logout).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("access-1");
  });
});
