/**
 * A Pro reads the reviewer's reason on Pro Home and on the KYC screen. It's free
 * text, up to 500 characters, so one unbroken string must wrap at phone width
 * rather than push the page sideways (SVC-444). jsdom has no layout, so these pin
 * the class that does the wrapping and that the whole string is there.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { me } = vi.hoisted(() => ({ me: vi.fn() }));
const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children }: React.PropsWithChildren) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "pro1" } }) }));
vi.mock("@/components/pro/ProHeader", () => ({ ProHeader: () => null }));
vi.mock("@/components/provider/JobActions", () => ({
  CompleteStep: () => null,
  DoorstepOtpStep: () => null,
  EnRouteStep: () => null,
}));
vi.mock("@/components/CameraCapture", () => ({ CameraCapture: () => null }));
vi.mock("@/hooks/useProHeartbeat", () => ({
  recheckProLocation: vi.fn(),
  useProLocationStatus: () => "granted",
}));
vi.mock("@/hooks/usePro", () => ({
  useProMe: () => ({ data: me() }),
  useProJobs: () => ({ data: [], isLoading: false, isError: false }),
  useSetProOnline: () => mutation,
  useSubmitProKyc: () => mutation,
}));

import { Route as ProHome } from "@/routes/pro/index";
import { Route as ProKyc } from "@/routes/pro/kyc";

type Rendered = { component: () => React.JSX.Element };
const Home = (ProHome as unknown as Rendered).component;
const Kyc = (ProKyc as unknown as Rendered).component;

const REASON = "x".repeat(500);

beforeEach(() => {
  me.mockReturnValue({
    kyc_status: "rejected",
    kyc_rejection_reason: REASON,
    is_online: false,
    team_name: "Team",
  });
});

describe("a long unbroken rejection reason", () => {
  it("wraps on Pro Home", () => {
    render(<Home />);
    expect(screen.getByText(new RegExp(REASON))).toHaveClass("[overflow-wrap:anywhere]");
  });

  it("wraps on the KYC screen", () => {
    render(<Kyc />);
    expect(screen.getByText(new RegExp(REASON))).toHaveClass("[overflow-wrap:anywhere]");
  });
});
