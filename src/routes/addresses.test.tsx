/**
 * The address book (SVC-287).
 *
 * Three properties are load-bearing:
 *
 * 1. **Labels read capitalised but are stored lowercase.** The backend pins
 *    `label` to `^(home|work|other)$`, so capitalising the *value* rather than
 *    the rendering is a 422 — the bug SVC-281 hit on device.
 * 2. **Destructive actions are two steps.** Delete lives behind the `⋮` sheet
 *    and then behind a confirmation; neither alone removes anything.
 * 3. **The active address is shown, not set.** This screen manages; choosing
 *    happens in the picker. A row that looked selectable here would disagree
 *    with checkout.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const addresses = vi.fn();
const selected = vi.fn();
const isLoading = vi.fn();
const deleteMutate = vi.fn();

vi.mock("@/hooks/useSelectedAddress", () => ({
  useSelectedAddress: () => ({
    addresses: addresses(),
    selected: selected(),
    isLoading: isLoading(),
    setSelectedId: vi.fn(),
  }),
}));

vi.mock("@/hooks/useApi", () => ({
  useDeleteAddress: () => ({ mutate: deleteMutate, isPending: false }),
}));

// The add/edit sheet mounts Leaflet; this screen only needs to know it opened.
vi.mock("@/components/AddAddressSheet", () => ({
  AddAddressSheet: ({ editing }: { editing?: { id: string } }) => (
    <div data-testid="add-address-sheet">{editing ? `editing:${editing.id}` : "adding"}</div>
  ),
}));

vi.mock("framer-motion", () => ({
  motion: { div: (props: Record<string, unknown>) => <div {...props} /> },
}));
vi.mock("@/hooks/useLockBodyScroll", () => ({ useLockBodyScroll: vi.fn() }));

// The route file calls createFileRoute, which wants a live router. Only the
// page component is under test, so the router surface is stubbed.
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

import { AddressesPage } from "@/routes/addresses";

const HOME = { id: "a1", label: "home", full: "Lane 7, Karve Nagar, Pune", lat: 18.4, lng: 73.8 };
const WORK = { id: "a2", label: "work", full: "Paud Road, Kothrud, Pune", lat: 18.5, lng: 73.8 };

beforeEach(() => {
  vi.clearAllMocks();
  addresses.mockReturnValue([HOME, WORK]);
  selected.mockReturnValue(HOME);
  isLoading.mockReturnValue(false);
});

describe("address type labels", () => {
  it("renders the label capitalised without changing the stored value", () => {
    // The reported bug: rows read "home" / "work". The fix is CSS, not data —
    // uppercasing the value would fail the backend's ^(home|work|other)$ with
    // a 422.
    render(<AddressesPage />);

    const label = screen.getByText("home");
    expect(label).toBeInTheDocument();
    expect(label.className).toContain("capitalize");
    // The underlying text is untouched, which is what gets sent back on edit.
    expect(label.textContent).toBe("home");
  });
});

describe("showing which address is in use", () => {
  it("marks the selected one", () => {
    render(<AddressesPage />);

    expect(screen.getByText(/in use/i)).toBeInTheDocument();
  });

  it("marks nothing when there is no selection", () => {
    selected.mockReturnValue(undefined);
    render(<AddressesPage />);

    expect(screen.queryByText(/in use/i)).not.toBeInTheDocument();
  });

  it("does not offer the rows as a way to change it", async () => {
    // This screen manages; the picker chooses. A tappable row here would let
    // a user "select" an address and then meet a different one at checkout.
    render(<AddressesPage />);

    const optionButtons = screen.getAllByRole("button", { name: /options for/i });
    expect(optionButtons).toHaveLength(2);
    // The only other button is Add New Address — no per-row select control.
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });
});

describe("the ⋮ menu", () => {
  it("names the address it will act on", async () => {
    // The row is behind a scrim once the sheet is up. Without restating which
    // address this is, "Delete" has no subject.
    const user = userEvent.setup();
    render(<AddressesPage />);

    await user.click(screen.getByRole("button", { name: /options for work address/i }));

    expect(await screen.findByRole("dialog", { name: /work address/i })).toBeInTheDocument();
  });

  it("opens the edit sheet for that address", async () => {
    const user = userEvent.setup();
    render(<AddressesPage />);

    await user.click(screen.getByRole("button", { name: /options for work address/i }));
    await user.click(await screen.findByRole("button", { name: /^edit$/i }));

    expect(await screen.findByTestId("add-address-sheet")).toHaveTextContent("editing:a2");
  });

  it("asks before deleting, and deletes nothing on its own", async () => {
    const user = userEvent.setup();
    render(<AddressesPage />);

    await user.click(screen.getByRole("button", { name: /options for home address/i }));
    await user.click(await screen.findByRole("button", { name: /^delete$/i }));

    // The sheet only raises the question.
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(await screen.findByText(/delete this address\?/i)).toBeInTheDocument();
  });

  it("deletes once confirmed", async () => {
    const user = userEvent.setup();
    render(<AddressesPage />);

    await user.click(screen.getByRole("button", { name: /options for home address/i }));
    await user.click(await screen.findByRole("button", { name: /^delete$/i }));
    await user.click(await screen.findByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(deleteMutate).toHaveBeenCalled());
    expect(deleteMutate.mock.calls[0][0]).toBe("a1");
  });

  it("keeps the address when the confirmation is declined", async () => {
    const user = userEvent.setup();
    render(<AddressesPage />);

    await user.click(screen.getByRole("button", { name: /options for home address/i }));
    await user.click(await screen.findByRole("button", { name: /^delete$/i }));
    await user.click(await screen.findByRole("button", { name: /keep it/i }));

    expect(deleteMutate).not.toHaveBeenCalled();
  });
});

describe("adding", () => {
  it("offers Add New Address above the list", async () => {
    const user = userEvent.setup();
    render(<AddressesPage />);

    await user.click(screen.getByRole("button", { name: /add new address/i }));

    expect(await screen.findByTestId("add-address-sheet")).toHaveTextContent("adding");
  });

  it("still offers it when there is nothing saved", async () => {
    // The empty state must not be a dead end — adding is the only way out.
    addresses.mockReturnValue([]);
    selected.mockReturnValue(undefined);
    render(<AddressesPage />);

    expect(screen.getByText(/no saved addresses yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add new address/i })).toBeEnabled();
  });
});
