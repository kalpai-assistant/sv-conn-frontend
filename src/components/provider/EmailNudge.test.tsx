/**
 * The SP's email nudge and email sheet (SVC-486). Only apiFetch, the auth
 * context and the toast are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const apiFetch = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const updateUser = vi.fn();
const auth: { user: { id: string; email: string | null } | null } = { user: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: auth.user, updateUser }),
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a) } }));

import { ApiError } from "@/lib/api";
import { EmailNudge } from "@/components/provider/EmailNudge";
import { EmailSheet } from "@/components/provider/EmailSheet";
import { isEmailNudgeSnoozed } from "@/lib/email-nudge";

const COPY = "Add your email to get pricing notices by email";

beforeEach(() => {
  apiFetch.mockReset();
  updateUser.mockReset();
  toastSuccess.mockReset();
  auth.user = { id: "u1", email: null };
});
afterEach(() => {
  window.localStorage.clear();
});

describe("the email nudge", () => {
  it("shows for an SP with no email", () => {
    render(<EmailNudge />);
    expect(screen.getByText(COPY)).toBeInTheDocument();
  });

  it("stays hidden for an SP with an email", () => {
    auth.user = { id: "u1", email: "sp@example.com" };
    render(<EmailNudge />);
    expect(screen.queryByText(COPY)).toBeNull();
  });

  it("Not now hides it and starts the 7 days", async () => {
    render(<EmailNudge />);
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByText(COPY)).toBeNull();
    expect(isEmailNudgeSnoozed("u1")).toBe(true);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("stays hidden while snoozed", async () => {
    const { unmount } = render(<EmailNudge />);
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    unmount();
    render(<EmailNudge />);
    expect(screen.queryByText(COPY)).toBeNull();
  });

  it("Add saves the email and updates the user", async () => {
    const saved = { id: "u1", email: "sp@example.com", name: "SP" };
    apiFetch.mockResolvedValue(saved);
    render(<EmailNudge />);
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await userEvent.type(await screen.findByLabelText("Email"), "  SP@Example.com ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(saved));
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith("/users/me", {
      method: "PATCH",
      body: JSON.stringify({ email: "SP@Example.com" }),
    });
    expect(toastSuccess).toHaveBeenCalledWith("Email saved");
  });

  it("shows a 422 inline and keeps the sheet open", async () => {
    apiFetch.mockRejectedValue(new ApiError(422, "API error: 422 Unprocessable Entity"));
    render(<EmailNudge />);
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    const field = await screen.findByLabelText("Email");
    await userEvent.type(field, "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("shows other failures as a save error", async () => {
    apiFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<EmailNudge />);
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await userEvent.type(await screen.findByLabelText("Email"), "sp@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "false");
  });
});

describe("the email sheet from the profile row", () => {
  it("clears a saved email with an empty string", async () => {
    auth.user = { id: "u1", email: "sp@example.com" };
    apiFetch.mockResolvedValue({ id: "u1", email: null });
    render(<EmailSheet open onOpenChange={() => {}} />);
    const field = screen.getByLabelText("Email");
    expect(field).toHaveValue("sp@example.com");
    expect(screen.getByText("Leave it empty to remove your email.")).toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith("/users/me", {
      method: "PATCH",
      body: JSON.stringify({ email: "" }),
    });
    expect(toastSuccess).toHaveBeenCalledWith("Email removed");
  });

  it("an unchanged email sends nothing", async () => {
    auth.user = { id: "u1", email: "sp@example.com" };
    const onOpenChange = vi.fn();
    render(<EmailSheet open onOpenChange={onOpenChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
