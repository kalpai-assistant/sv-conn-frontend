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
// SVC-281: the sheet resolves where to open the map, which reads the selected
// address. Mocked so these tests stay about the sheet rather than dragging in
// React Query and the address list.
const setSelectedId = vi.fn();
vi.mock("@/hooks/useSelectedAddress", () => ({
  useSelectedAddress: () => ({ selected: undefined, setSelectedId }),
}));
// SVC-287: the contact fields seed from the signed-in user. Mocked rather than
// wrapped in AuthProvider so these tests stay about the sheet.
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Tushar", phone: "+919322398902" } }),
}));
/**
 * A picker that reports whatever the test tells it to.
 *
 * The real one mounts Leaflet and reverse-geocodes over the network. What
 * these tests need is the one thing it hands back — the address string — since
 * a failed geocode arrives through exactly this channel.
 */
const pickerReports = { addr: "Lane Number 7, Karve Nagar, Pune" };
vi.mock("./MapPicker", () => ({
  MapPicker: ({
    onLocationSelected,
  }: {
    onLocationSelected: (lat: number, lng: number, address: string) => void;
  }) => (
    <div data-testid="map-picker">
      <button
        type="button"
        onClick={() => onLocationSelected(18.5204, 73.8567, pickerReports.addr)}
      >
        report pin
      </button>
    </div>
  ),
}));
vi.mock("framer-motion", () => ({
  motion: { div: (props: Record<string, unknown>) => <div {...props} /> },
}));

import { AddAddressSheet } from "@/components/AddAddressSheet";

const EDITING = {
  id: "addr-1",
  label: "home",
  full: "Karve Nagar, Pune",
  house_floor: "Flat 302, 3rd floor",
  building: "Amogh Residency",
  landmark_area: "Near D-Mart",
  pincode: "411052",
  contact_name: null,
  contact_phone: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  addAddress.mockResolvedValue({});
  updateAddress.mockResolvedValue({});
  pickerReports.addr = "Lane Number 7, Karve Nagar, Pune";
});

describe("adding (unchanged behaviour)", () => {
  it("opens on the map step", async () => {
    render(<AddAddressSheet onClose={vi.fn()} />);

    // Awaited since SVC-281: the map is not mounted until we know where to
    // open it, so it renders somewhere it might actually be rather than
    // recentring out from under a user who has already grabbed the pin.
    expect(await screen.findByTestId("map-picker")).toBeInTheDocument();
  });
});

describe("editing", () => {
  it("skips the map and opens on the form, prefilled", () => {
    // Someone correcting a flat number should not have to re-pin their
    // building — and re-pinning is how a text edit becomes a moved location.
    render(<AddAddressSheet editing={EDITING} onClose={vi.fn()} />);

    expect(screen.queryByTestId("map-picker")).not.toBeInTheDocument();
    // Prefilled from the stored columns, not parsed out of the composed line.
    expect(screen.getByDisplayValue("Flat 302, 3rd floor")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Near D-Mart")).toBeInTheDocument();
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

  it("sends the edited field", async () => {
    const user = userEvent.setup();
    render(<AddAddressSheet editing={EDITING} onClose={vi.fn()} />);

    const field = screen.getByLabelText(/house no\. & floor/i);
    await user.clear(field);
    await user.type(field, "Flat 404, 4th floor");
    await user.click(screen.getByRole("button", { name: /save address/i }));

    await waitFor(() => expect(updateAddress).toHaveBeenCalled());
    expect(updateAddress.mock.calls[0][0].house_floor).toBe("Flat 404, 4th floor");
    // Untouched fields still travel, so the PATCH does not read as "clear them".
    expect(updateAddress.mock.calls[0][0].landmark_area).toBe("Near D-Mart");
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

describe("a geocode that failed is not an address (SVC-283)", () => {
  /** Walk the map step through to the form with whatever the picker reported. */
  const reachForm = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole("button", { name: /report pin/i }));
    await user.click(screen.getByRole("button", { name: /confirm location/i }));
  };

  it.each([
    ["Unknown Location", "the geocoder answered with nothing"],
    ["Could not fetch address", "the request failed outright"],
  ])("never pre-fills %s as the address", async (failure) => {
    // Both are long enough to satisfy the backend's min_length=5, so without
    // this they save verbatim and the user ends up with an address book entry
    // named after our failure — the same class of bug as the coordinate
    // strings this ticket removed.
    const user = userEvent.setup();
    pickerReports.addr = failure;
    render(<AddAddressSheet onClose={vi.fn()} />);

    await reachForm(user);

    // The locality line is where a geocode lands now (SVC-287), so a failed
    // one leaves it blank rather than reading "Could not fetch address".
    expect(screen.getByText(/location not set/i)).toBeInTheDocument();
  });

  it("keeps a real address exactly as the picker reported it", async () => {
    // The other half of the rule: this must not become a filter that eats
    // legitimate geocodes.
    const user = userEvent.setup();
    render(<AddAddressSheet onClose={vi.fn()} />);

    await reachForm(user);

    expect(screen.getByText("Lane Number 7, Karve Nagar, Pune")).toBeInTheDocument();
  });

  it("asks for the locality rather than sending an empty one", async () => {
    // The backend would answer min_length=5 with a bare 422, which this sheet
    // renders as "Failed to save address" — true, and useless.
    const user = userEvent.setup();
    pickerReports.addr = "Could not fetch address";
    render(<AddAddressSheet onClose={vi.fn()} />);

    await reachForm(user);
    await user.type(screen.getByLabelText(/house no\. & floor/i), "Flat 302");
    await user.click(screen.getByRole("button", { name: /save address/i }));

    expect(await screen.findByText(/add the area or locality/i)).toBeInTheDocument();
    expect(addAddress).not.toHaveBeenCalled();
  });

  it("sends the structured fields alongside the locality", async () => {
    const user = userEvent.setup();
    render(<AddAddressSheet onClose={vi.fn()} />);

    await reachForm(user);
    await user.type(screen.getByLabelText(/house no\. & floor/i), "Flat 302, 3rd floor");
    await user.type(screen.getByLabelText(/building & block/i), "Amogh Residency");
    await user.type(screen.getByLabelText(/^pin code$/i), "411014");
    await user.click(screen.getByRole("button", { name: /save address/i }));

    await waitFor(() => expect(addAddress).toHaveBeenCalled());
    const sent = addAddress.mock.calls[0][0];
    expect(sent.house_floor).toBe("Flat 302, 3rd floor");
    expect(sent.building).toBe("Amogh Residency");
    expect(sent.pincode).toBe("411014");
    // The locality still travels — the backend appends it when composing.
    expect(sent.full_address).toBe("Lane Number 7, Karve Nagar, Pune");
    expect(sent.lat).toBe(18.5204);
  });
});

describe("opening on a supplied position (SVC-283)", () => {
  it("does not claim to be guessing when handed a real fix", async () => {
    // The gate passes the position the user just waited for. Showing "this map
    // is a guess" over it would contradict what we just told them.
    render(<AddAddressSheet onClose={vi.fn()} initialCentre={[18.5204, 73.8567]} />);

    expect(await screen.findByTestId("map-picker")).toBeInTheDocument();
    expect(screen.queryByText(/this map is a guess/i)).not.toBeInTheDocument();
  });
});

describe("a saved address becomes the selected one (SVC-283)", () => {
  /** Walk the map step through to the form with whatever the picker reported. */
  const reachForm = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole("button", { name: /report pin/i }));
    await user.click(screen.getByRole("button", { name: /confirm location/i }));
  };

  it("selects what it just saved", async () => {
    // Found on device. The sheet saved and closed without touching the
    // selection, which is stored by id — so after confirming a location in
    // Kharadi the header still read Karve Nagar, and the next booking would
    // have gone to the old address.
    //
    // Invisible from the profile screen, where adding an address is just
    // adding one. Glaring from the location gate, where the user has just
    // answered "where are you?" and watched the answer be ignored.
    const user = userEvent.setup();
    addAddress.mockResolvedValue({ id: "new-addr-1" });
    render(<AddAddressSheet onClose={vi.fn()} />);

    await reachForm(user);
    await user.type(screen.getByLabelText(/house no\. & floor/i), "Flat 302");
    await user.click(screen.getByRole("button", { name: /save address/i }));

    await waitFor(() => expect(setSelectedId).toHaveBeenCalledWith("new-addr-1"));
  });

  it("does not change the selection when editing an existing address", async () => {
    // Editing corrects a flat number on an address that may not be the
    // selected one. Silently switching the user's delivery address because
    // they fixed a typo would be a surprise, and a costly one.
    const user = userEvent.setup();
    render(<AddAddressSheet editing={EDITING} onClose={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /save address/i }));

    await waitFor(() => expect(updateAddress).toHaveBeenCalled());
    expect(setSelectedId).not.toHaveBeenCalled();
  });

  it("survives a response with no id rather than throwing", async () => {
    // The save itself succeeded; only the selection is unavailable. Closing
    // normally is the right outcome — the address exists either way.
    const user = userEvent.setup();
    addAddress.mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<AddAddressSheet onClose={onClose} />);

    await reachForm(user);
    await user.type(screen.getByLabelText(/house no\. & floor/i), "Flat 302");
    await user.click(screen.getByRole("button", { name: /save address/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(setSelectedId).not.toHaveBeenCalled();
  });
});

describe("the PIN code OSM gets wrong (SVC-283)", () => {
  it("is not saved with the address", async () => {
    // Nominatim answers 411001 for Kharadi, which is 411014, at every zoom.
    // A wrong PIN code reaches the provider reading the address on their way
    // to the job; an absent one costs nothing, since dispatch matches on
    // coordinates.
    const user = userEvent.setup();
    pickerReports.addr =
      "Lane Number 1, Kharadi, Pune, Pune City Subdistrict, Pune District, Maharashtra, 411001, India";
    render(<AddAddressSheet onClose={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /report pin/i }));
    await user.click(screen.getByRole("button", { name: /confirm location/i }));
    await user.type(screen.getByLabelText(/house no\. & floor/i), "Flat 302");
    await user.click(screen.getByRole("button", { name: /save address/i }));

    await waitFor(() => expect(addAddress).toHaveBeenCalled());
    const saved = addAddress.mock.calls[0][0].full_address;
    expect(saved).not.toContain("411001");
    // The parts that are correct all survive.
    expect(saved).toContain("Lane Number 1");
    expect(saved).toContain("Kharadi");
    expect(saved).toContain("India");
  });
});

describe("only one way to ask the device where you are (SVC-287)", () => {
  it("offers no locate button of its own", async () => {
    // Three existed in one flow: the gate's Enable, one in this sheet's
    // fallback banner, and MapPicker's own. So a user who tapped "we can't
    // find you → enter it manually" was asked the same failed question twice
    // more.
    //
    // MapPicker's is the one that stays — it sits where the pin it moves is.
    // This asserts the sheet adds none, which is what makes "enter address
    // manually" mean something other than "here is another map".
    render(<AddAddressSheet onClose={vi.fn()} />);

    await screen.findByTestId("map-picker");
    expect(screen.queryByRole("button", { name: /use my current location/i })).toBeNull();
    expect(screen.queryByText(/locating/i)).toBeNull();
  });

  it("still names a guessed map, which is a different job", async () => {
    // The banner is the SVC-281 fix and stays: a wrong-city map used to be
    // silent, and a user who does not know the pin is 840km out has no reason
    // to move it. Removing the duplicate button must not take the warning
    // with it.
    render(<AddAddressSheet onClose={vi.fn()} />);

    expect(await screen.findByText(/this map is a guess/i)).toBeInTheDocument();
  });
});

describe("editing an address saved before the structured fields (SVC-287)", () => {
  // Every address in the database today. `full_address` holds a geocoded line
  // and all six columns are null — there is no flat number in there to find,
  // because the old flow never asked for one.
  const LEGACY = {
    id: "old-1",
    label: "home",
    full: "Lane Number 1, Kharadi, Pune, Pune City Subdistrict, Maharashtra, India",
  };

  it("leaves the fields empty rather than guessing at them", () => {
    // The tempting alternative is to split the stored line on commas and use
    // the first part. That would offer "Lane Number 1" — a *street* — as the
    // flat number, the user taps Save, and a provider is sent to a door that
    // nobody ever wrote down. An empty box is the honest rendering of a null
    // column.
    render(<AddAddressSheet editing={LEGACY} onClose={vi.fn()} />);

    expect(screen.getByLabelText(/house no\. & floor/i)).toHaveValue("");
    expect(screen.getByLabelText(/building & block/i)).toHaveValue("");
    expect(screen.queryByDisplayValue(/lane number 1/i)).toBeNull();
  });

  it("still shows where the address is", () => {
    // The boxes are empty, so without this the screen says nothing about which
    // place is being edited.
    render(<AddAddressSheet editing={LEGACY} onClose={vi.fn()} />);

    expect(screen.getByText(/lane number 1, kharadi, pune/i)).toBeInTheDocument();
  });

  it("does not demand a flat number to change the label", async () => {
    // The whole reason House & Floor is required on create but not on edit.
    // Requiring it here turns "rename this to Work" into an upgrade prompt for
    // a field the user was never asked for.
    const user = userEvent.setup();
    render(<AddAddressSheet editing={LEGACY} onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Work" }));
    await user.click(screen.getByRole("button", { name: /save address/i }));

    await waitFor(() => expect(updateAddress).toHaveBeenCalled());
    expect(updateAddress.mock.calls[0][0].label).toBe("work");
  });
});

describe("what the form will not send (SVC-287)", () => {
  const reach = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole("button", { name: /report pin/i }));
    await user.click(screen.getByRole("button", { name: /confirm location/i }));
  };

  it("requires a flat number on a new address", async () => {
    // It is the one field a provider cannot do without: a pin finds the
    // building, not the door.
    const user = userEvent.setup();
    render(<AddAddressSheet onClose={vi.fn()} />);

    await reach(user);
    await user.click(screen.getByRole("button", { name: /save address/i }));

    expect(await screen.findByText(/flat or house number/i)).toBeInTheDocument();
    expect(addAddress).not.toHaveBeenCalled();
  });

  it("rejects a half-typed PIN code", async () => {
    // Worse than none: it reaches the provider looking authoritative. The
    // backend would answer a bare 422; this says which field and why.
    const user = userEvent.setup();
    render(<AddAddressSheet onClose={vi.fn()} />);

    await reach(user);
    await user.type(screen.getByLabelText(/house no\. & floor/i), "Flat 302");
    await user.type(screen.getByLabelText(/^pin code$/i), "4110");
    await user.click(screen.getByRole("button", { name: /save address/i }));

    expect(await screen.findByText(/six digits/i)).toBeInTheDocument();
    expect(addAddress).not.toHaveBeenCalled();
  });

  it("omits an untouched optional field rather than clearing it", async () => {
    // `undefined`, not `""`. On a PATCH the two differ: one means "this edit
    // did not mention the landmark", the other asks the backend to erase one
    // the user never looked at.
    const user = userEvent.setup();
    render(<AddAddressSheet onClose={vi.fn()} />);

    await reach(user);
    await user.type(screen.getByLabelText(/house no\. & floor/i), "Flat 302");
    await user.click(screen.getByRole("button", { name: /save address/i }));

    await waitFor(() => expect(addAddress).toHaveBeenCalled());
    expect(addAddress.mock.calls[0][0].landmark_area).toBeUndefined();
  });

  it("sends the contact number in the stored form", async () => {
    // The field shows ten digits beside a +91; `users.phone` is E.164, and a
    // tap-to-call link should not care which of the two it came from.
    const user = userEvent.setup();
    render(<AddAddressSheet onClose={vi.fn()} />);

    await reach(user);
    await user.type(screen.getByLabelText(/house no\. & floor/i), "Flat 302");
    await user.click(screen.getByRole("button", { name: /save address/i }));

    await waitFor(() => expect(addAddress).toHaveBeenCalled());
    // Seeded from the signed-in user, stored as +91XXXXXXXXXX.
    expect(addAddress.mock.calls[0][0].contact_phone).toBe("+919322398902");
  });
});
