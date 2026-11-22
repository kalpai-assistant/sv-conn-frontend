/**
 * /provider/profile?pricing=<service_id>, where a "variant_added" push tap
 * lands (SVC-487). The page hands the id to ServicesPicker and drops the param
 * once the picker has dealt with it, replacing the history entry, so Back or a
 * reload doesn't open the panel again. The picker's own part is pinned in
 * ServicesPicker.deepOpen.test.tsx.
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigate, search, pickerProps } = vi.hoisted(() => ({
  navigate: vi.fn(),
  search: { current: {} as { pricing?: string; variant?: string } },
  pickerProps: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children }: React.PropsWithChildren) => <a>{children}</a>,
  useNavigate: () => navigate,
  useSearch: () => search.current,
}));
vi.mock("@/components/provider/ServicesPicker", () => ({
  ServicesPicker: (props: Record<string, unknown>) => {
    pickerProps(props);
    return null;
  },
}));
vi.mock("@/components/DeleteAccountButton", () => ({ DeleteAccountButton: () => null }));
vi.mock("@/components/LogoutButton", () => ({ LogoutButton: () => null }));
vi.mock("@/components/BackButton", () => ({ BackButton: () => null }));
vi.mock("@/components/NotificationsRow", () => ({ NotificationsRow: () => null }));
vi.mock("@/components/provider/BusinessSection", () => ({ BusinessSection: () => null }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { role: "provider" } }) }));
vi.mock("@/hooks/useApi", () => ({
  useProviderProfile: () => ({ data: { is_online: false, payout_set: false } }),
}));
vi.mock("@/hooks/useTeam", () => ({ useTeam: () => ({ data: [] }) }));

import { Route } from "@/routes/provider/profile";

const Page = (Route as unknown as { component: () => React.ReactElement }).component;
const lastPickerProps = () =>
  pickerProps.mock.lastCall![0] as {
    openPricingFor?: string;
    openPricingVariant?: string;
    onPricingHandled: () => void;
  };

beforeEach(() => {
  vi.clearAllMocks();
  search.current = {};
});

describe("provider profile ?pricing= (SVC-487)", () => {
  it("accepts optional pricing and variant strings", () => {
    const validate = (Route as unknown as { validateSearch: { parse: (v: unknown) => unknown } })
      .validateSearch;
    expect(validate.parse({ pricing: "s1" })).toEqual({ pricing: "s1" });
    expect(validate.parse({ pricing: "s1", variant: "v1" })).toEqual({
      pricing: "s1",
      variant: "v1",
    });
    expect(validate.parse({})).toEqual({});
  });

  it("hands the service and option to the picker, and clears both with replace", () => {
    search.current = { pricing: "s1", variant: "v1" };
    render(<Page />);
    expect(lastPickerProps().openPricingFor).toBe("s1");
    expect(lastPickerProps().openPricingVariant).toBe("v1");

    lastPickerProps().onPricingHandled();
    expect(navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/provider/profile",
      search: {},
      replace: true,
    });
  });

  it("passes nothing without the param", () => {
    render(<Page />);
    expect(lastPickerProps().openPricingFor).toBeUndefined();
  });
});
