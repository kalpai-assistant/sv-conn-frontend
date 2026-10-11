/**
 * SVC-331 — "I have an invite code" on the sign-in screen.
 *
 * Until this link, the only in-app way to /invite was Profile's row, which a
 * signed-out Pro cannot reach. Who sees it matters as much as where it goes: a
 * team Pro must be a customer account, so the link is offered in customer mode
 * only, never beside a provider signup and never on /invite itself.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ login: vi.fn() }),
}));

// Touches Capacitor globals that do not exist in jsdom.
vi.mock("@/lib/back-interceptor", () => ({
  pushBackInterceptor: () => () => {},
}));

import { AuthFlow } from "@/components/AuthFlow";

const LINK = /i have an invite code/i;

describe("AuthFlow invite-code link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows on the normal sign-in screen, beside the provider link", () => {
    render(<AuthFlow onComplete={() => {}} />);

    expect(screen.getByRole("button", { name: LINK })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /are you a service provider/i })).toBeInTheDocument();
  });

  it("is hidden in invite mode — the user is already on /invite", () => {
    render(<AuthFlow onComplete={() => {}} invite />);

    expect(screen.queryByRole("button", { name: LINK })).not.toBeInTheDocument();
  });

  it("is hidden once the user switches to provider signup", async () => {
    const user = userEvent.setup();
    render(<AuthFlow onComplete={() => {}} />);

    await user.click(screen.getByRole("button", { name: /are you a service provider/i }));

    expect(screen.queryByRole("button", { name: LINK })).not.toBeInTheDocument();
  });

  it("goes to /invite when tapped", async () => {
    const user = userEvent.setup();
    render(<AuthFlow onComplete={() => {}} />);

    await user.click(screen.getByRole("button", { name: LINK }));

    expect(navigate).toHaveBeenCalledWith({ to: "/invite" });
  });
});
