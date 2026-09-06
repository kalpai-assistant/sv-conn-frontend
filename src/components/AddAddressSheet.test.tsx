/**
 * Editing a saved address (SVC-277).
 *
 * The sheet was add-only. Reusing it for Edit is what stops there being two
 * address forms that drift apart — but it introduces one hazard that is
 * invisible on screen: the sheet's `lat`/`lng` start at 0, so an edit that
 * sends them unconditionally would move the address to the Gulf of Guinea,
 * roughly 3,000km off the coast of Africa. The provider would be dispatched
 * there and the geo-fence would find nobody.
 *
 * `omits the coordinates unless the user actually re-pinned` is the test that
 * catches it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const addAddress = vi.fn();
const updateAddress = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useAddAddress: () => ({ mutateAsync: addAddress, isPending: false }),
  useUpdateAddress: () => ({ mutateAsync: updateAddress, isPending: false }),
}));
vi.mock("@/hooks/useLockBodyScroll", () => ({ useLockBodyScroll: vi.fn() }));
vi.mock("./MapPicker", () => ({
  MapPicker: () => <div data-testid="map-picker" />,
}));
vi.mock("framer-motion", () => ({
  motion: { div: (props: Record<string, unknown>) => <div {...props} /> },
}));

import { AddAddressSheet } from "@/components/AddAddressSheet";

const EDITING = { id: "addr-1", label: "home", full: "Flat 302, Karve Nagar" };

beforeEach(() => {
  vi.clearAllMocks();
  addAddress.mockResolvedValue({});
  updateAddress.mockResolvedValue({});
});

describe("adding (unchanged behaviour)", () => {
  it("opens on the map step", () => {
    render(<AddAddressSheet onClose={vi.fn()} />);

    expect(screen.getByTestId("map-picker")).toBeInTheDocument();
  });
});

describe("editing", () => {
  it("skips the map and opens on the form, prefilled", () => {
    // Someone correcting a flat number should not have to re-pin their
    // building — and re-pinning is how a text edit becomes a moved location.
    render(<AddAddressSheet editing={EDITING} onClose={vi.fn()} />);

    expect(screen.queryByTestId("map-picker")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Flat 302, Karve Nagar")).toBeInTheDocument();
  });

  it("says Edit Address, not Address Details", () => {
    render(<AddAddressSheet editing={EDITING} onClose={vi.fn()} />);

    expect(screen.getByText("Edit Address")).toBeInTheDocument();
  });

  it("updates rather than creating a second address", async () => {
    const user = userEvent.setup();
    render(<AddAddressSheet editing={EDITING} onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(updateAddress).toHaveBeenCalledOnce());
    expect(addAddress).not.toHaveBeenCalled();
    expect(updateAddress.mock.calls[0][0]).toMatchObject({ addressId: "addr-1" });
  });

  it("omits the coordinates unless the user actually re-pinned", async () => {
    // The sheet's lat/lng start at 0. Sending them on an untouched edit would
    // relocate the address to 0,0 — the Gulf of Guinea — and the backend keeps
    // the existing point only when they are absent.
    const user = userEvent.setup();
    render(<AddAddressSheet editing={EDITING} onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(updateAddress).toHaveBeenCalled());
    const payload = updateAddress.mock.calls[0][0];
    expect(payload).not.toHaveProperty("lat");
    expect(payload).not.toHaveProperty("lng");
  });

  it("sends the edited text", async () => {
    const user = userEvent.setup();
    render(<AddAddressSheet editing={EDITING} onClose={vi.fn()} />);

    const field = screen.getByDisplayValue("Flat 302, Karve Nagar");
    await user.clear(field);
    await user.type(field, "Flat 701, Baner Road");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(updateAddress).toHaveBeenCalled());
    expect(updateAddress.mock.calls[0][0]).toMatchObject({
      full_address: "Flat 701, Baner Road",
    });
  });

  it("closes on success", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AddAddressSheet editing={EDITING} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("stays open and reports the problem when saving fails", async () => {
    updateAddress.mockRejectedValue(new Error("Address is outside our service area"));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AddAddressSheet editing={EDITING} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/outside our service area/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
