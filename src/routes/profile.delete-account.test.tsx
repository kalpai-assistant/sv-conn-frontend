/**
 * Both profile screens carry Delete my account (SVC-367), with the persona
 * that picks where "Open booking" goes, and below Logout — never the first
 * thing a thumb lands on. The button's own behaviour is pinned in
 * DeleteAccountButton.test.tsx; this file only checks the mounting.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteProps = vi.fn();
const proMe = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children }: React.PropsWithChildren) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock("@/components/DeleteAccountButton", () => ({
  DeleteAccountButton: (props: Record<string, unknown>) => {
    deleteProps(props);
    return <button>Delete my account</button>;
  },
}));
vi.mock("@/components/LogoutButton", () => ({ LogoutButton: () => <button>Logout</button> }));
vi.mock("@/components/BackButton", () => ({ BackButton: () => null }));
vi.mock("@/components/NotificationsRow", () => ({ NotificationsRow: () => null }));
vi.mock("@/components/AddAddressSheet", () => ({ AddAddressSheet: () => null }));
vi.mock("@/components/provider/BusinessSection", () => ({ BusinessSection: () => null }));
vi.mock("@/components/provider/ServicesPicker", () => ({ ServicesPicker: () => null }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "Asha", phone: "+919999999999", email: null, role: "consumer" },
    login: vi.fn(),
    updateUser: vi.fn(),
  }),
}));
vi.mock("@/hooks/useApi", () => ({
  useAddresses: () => ({ data: [], isLoading: false, isError: false }),
  useProviderProfile: () => ({ data: { is_online: false, payout_set: false } }),
}));
vi.mock("@/hooks/useSelectedAddress", () => ({ useSelectedAddress: () => ({ selected: null }) }));
vi.mock("@/hooks/useTeam", () => ({ useTeam: () => ({ data: [] }) }));
vi.mock("@/hooks/usePro", () => ({
  useProMe: () => ({ data: proMe() }),
  isTeamPro: (me: { is_self: boolean } | null) => !!me && !me.is_self,
}));

import { Route as ConsumerRoute } from "@/routes/profile";
import { Route as ProviderRoute } from "@/routes/provider/profile";

const pageOf = (route: unknown) => (route as { component: () => React.ReactElement }).component;

function expectBelowLogout() {
  const logout = screen.getByRole("button", { name: "Logout" });
  const del = screen.getByRole("button", { name: "Delete my account" });
  expect(logout.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

beforeEach(() => {
  vi.clearAllMocks();
  proMe.mockReturnValue(null);
});

describe("consumer profile", () => {
  it("shows the button below Logout, as a consumer", () => {
    const Page = pageOf(ConsumerRoute);
    render(<Page />);

    expectBelowLogout();
    expect(deleteProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ persona: "consumer", isTeamPro: false }),
    );
  });

  it("tells it the user is a team Pro, so their jobs open the job screen", () => {
    proMe.mockReturnValue({ is_self: false, service_provider: { business_name: "Sparkle Home" } });
    const Page = pageOf(ConsumerRoute);
    render(<Page />);

    expect(deleteProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ persona: "consumer", isTeamPro: true }),
    );
  });
});

describe("provider profile", () => {
  it("shows the button below Logout, as a provider", () => {
    const Page = pageOf(ProviderRoute);
    render(<Page />);

    expectBelowLogout();
    expect(deleteProps).toHaveBeenLastCalledWith(expect.objectContaining({ persona: "provider" }));
  });
});
