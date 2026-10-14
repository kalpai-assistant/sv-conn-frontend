/**
 * SVC-355 admin profile.
 *
 * Load-bearing:
 * - shows who is signed in: name, phone and an "Admin" badge, with a fallback
 *   when the admin account has no name
 * - Logout clears the session first, then lands on /admin/login with
 *   `replace`, not the customer sign-in at "/"
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logout = vi.fn();
const navigate = vi.fn();
let user: { id: string; name: string | null; phone: string } | null = null;

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user, logout }),
}));

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => navigate,
    createFileRoute: () => (opts: { component: unknown }) => opts,
  };
});

import { Route } from "@/routes/admin.profile";

const Page = (Route as unknown as { component: React.FC }).component;

beforeEach(() => {
  vi.clearAllMocks();
  user = { id: "a1", name: "Vipul Admin", phone: "+919999900001" };
});

describe("/admin/profile", () => {
  it("shows the admin's name, phone and role badge", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 2, name: "Vipul Admin" })).toBeInTheDocument();
    expect(screen.getByText("+919999900001")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("VA")).toBeInTheDocument();
  });

  it("says so when the admin has no name, still showing the phone", () => {
    user = { id: "a1", name: null, phone: "+919999900001" };
    render(<Page />);
    expect(screen.getByRole("heading", { level: 2, name: "No name on file" })).toBeInTheDocument();
    expect(screen.getByText("+919999900001")).toBeInTheDocument();
  });

  it("logs out and lands on the admin login, not the customer sign-in", async () => {
    render(<Page />);
    await userEvent.click(screen.getByRole("button", { name: "Logout" }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ to: "/admin/login", replace: true });
    expect(logout.mock.invocationCallOrder[0]).toBeLessThan(navigate.mock.invocationCallOrder[0]);
  });
});
