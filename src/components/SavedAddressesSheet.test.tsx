/**
 * The one address sheet (SVC-287).
 *
 * There used to be two — `AddressPickerSheet` from the Home bar and the Cart,
 * and this one from the location gate. Same job, two implementations, and they
 * had already drifted: one drew a tick and no ⋮, the other a badge and a menu.
 * That is the same class of divergence that had the gate drawing a pin where
 * the Addresses screen drew a house.
 *
 * One component now, and the only thing that varies by caller is whether
 * leaving without choosing is allowed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const addresses = vi.fn();
const selected = vi.fn();

vi.mock("@/hooks/useSelectedAddress", () => ({
  useSelectedAddress: () => ({
    addresses: addresses(),
    selected: selected(),
    setSelectedId: vi.fn(),
  }),
}));
vi.mock("@/hooks/useApi", () => ({
  useDeleteAddress: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/AddAddressSheet", () => ({
  AddAddressSheet: () => <div data-testid="add-address-sheet" />,
}));
vi.mock("framer-motion", () => ({
  motion: { div: (props: Record<string, unknown>) => <div {...props} /> },
}));
vi.mock("@/hooks/useLockBodyScroll", () => ({ useLockBodyScroll: vi.fn() }));

import { SavedAddressesSheet } from "@/components/SavedAddressesSheet";

const HOME = { id: "a1", label: "home", full: "Lane 7, Karve Nagar, Pune", lat: 18.4, lng: 73.8 };
const WORK = { id: "a2", label: "work", full: "Paud Road, Kothrud, Pune", lat: 18.5, lng: 73.8 };

beforeEach(() => {
  vi.clearAllMocks();
  addresses.mockReturnValue([HOME, WORK]);
  selected.mockReturnValue(HOME);
});

describe("leaving without choosing", () => {
  it("offers a way back when there is somewhere to go", async () => {
    // From the Home bar or the Cart: a location is already set and the screen
    // underneath is usable, so backing out changes nothing.
    const onClose = vi.fn();
    render(<SavedAddressesSheet onClose={onClose} onPick={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("offers none over the gate", () => {
    // The gate underneath is what blocks the app. A back arrow here would
    // offer an escape that does not exist — tapping it would return the user
    // to the screen they were trying to get past.
    render(<SavedAddressesSheet onClose={vi.fn()} onPick={vi.fn()} dismissible={false} />);

    expect(screen.queryByRole("button", { name: /back/i })).toBeNull();
  });

  it("does not let the scrim dismiss it over the gate either", async () => {
    // The scrim is the same escape as the header control, and has to follow
    // the same rule — otherwise the arrow is gone but tapping beside the sheet
    // still slips past.
    const onClose = vi.fn();
    const { container } = render(
      <SavedAddressesSheet onClose={onClose} onPick={vi.fn()} dismissible={false} />,
    );

    const scrim = container.querySelector(".fixed.inset-0");
    if (scrim) await userEvent.click(scrim);

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("what the sheet says it is", () => {
  it("is named for the choice, not the contents", () => {
    // "Select location" over "Saved addresses": the sheet exists to make a
    // choice, and the saved list is only one of the ways to make it.
    render(<SavedAddressesSheet onClose={vi.fn()} onPick={vi.fn()} />);

    expect(screen.getByRole("heading", { name: /select location/i })).toBeInTheDocument();
    expect(screen.getByText(/saved addresses/i)).toBeInTheDocument();
  });
});

describe("picking", () => {
  it("reports the address that was tapped", async () => {
    const onPick = vi.fn();
    render(<SavedAddressesSheet onClose={vi.fn()} onPick={onPick} />);

    await userEvent.click(screen.getByText("Paud Road, Kothrud, Pune"));

    expect(onPick).toHaveBeenCalledWith("a2");
  });

  it("marks only the address in use", () => {
    render(<SavedAddressesSheet onClose={vi.fn()} onPick={vi.fn()} />);

    expect(screen.getAllByText(/in use/i)).toHaveLength(1);
  });

  it("keeps the ⋮ available for every row", () => {
    // Management lives here rather than on the gate itself: a thumb aiming for
    // "get me past this" should not be able to land on Delete.
    render(<SavedAddressesSheet onClose={vi.fn()} onPick={vi.fn()} />);

    expect(screen.getAllByRole("button", { name: /options for/i })).toHaveLength(2);
  });
});
