/**
 * The Places search overlay on the map step (SVC-284).
 *
 * Covers the two things that would silently break the address flow if wrong:
 *   * A pick has to arrive at `onPick` fully resolved — `placeDetails` returns
 *     the coordinates the map needs to fly to, so a search-bar that only
 *     fires the primary text would drop the pin at the wrong place.
 *   * The suggestion list has to survive the input's blur long enough for the
 *     click to register. Without the `onMouseDown` preventDefault, the blur
 *     closes the dropdown before the click hits — measured on iOS + Android.
 *
 * Google Maps calls are stubbed at the module boundary; nothing here talks to
 * the real SDK.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createAutocompleteSession, queryPlaces, placeDetails } = vi.hoisted(() => ({
  createAutocompleteSession: vi.fn(),
  queryPlaces: vi.fn(),
  placeDetails: vi.fn(),
}));
vi.mock("@/lib/google-maps", () => ({
  createAutocompleteSession,
  queryPlaces,
  placeDetails,
}));

import { PlacesSearchBar } from "@/components/PlacesSearchBar";

/** A stand-in session token — the shape does not matter to the tests. */
const TOKEN = { session: "t-1" } as unknown as google.maps.places.AutocompleteSessionToken;

beforeEach(() => {
  vi.clearAllMocks();
  createAutocompleteSession.mockResolvedValue(TOKEN);
  queryPlaces.mockResolvedValue([]);
  placeDetails.mockResolvedValue(null);
});

describe("suggestions", () => {
  it("queries Google after the user has typed something", async () => {
    queryPlaces.mockResolvedValue([
      { placeId: "p1", primaryText: "Kharadi", secondaryText: "Pune, Maharashtra" },
    ]);
    const user = userEvent.setup();

    render(<PlacesSearchBar onPick={vi.fn()} />);
    await user.type(screen.getByRole("combobox"), "Kharadi");

    await waitFor(() => expect(queryPlaces).toHaveBeenCalled());
    // Debounced, so only the final query is what matters — but each keystroke
    // is separately allowed. Assert the last call has the full string.
    const lastCall = queryPlaces.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe("Kharadi");
    expect(lastCall?.[1]).toBe(TOKEN);
  });

  it("renders the returned predictions as options", async () => {
    queryPlaces.mockResolvedValue([
      { placeId: "p1", primaryText: "Kharadi", secondaryText: "Pune, Maharashtra" },
      { placeId: "p2", primaryText: "Kharadi Chowk", secondaryText: "Pune, Maharashtra" },
    ]);
    const user = userEvent.setup();

    render(<PlacesSearchBar onPick={vi.fn()} />);
    await user.type(screen.getByRole("combobox"), "Kharadi");

    expect(await screen.findByText("Kharadi")).toBeInTheDocument();
    expect(await screen.findByText("Kharadi Chowk")).toBeInTheDocument();
  });
});

describe("picking a suggestion", () => {
  it("calls placeDetails with the same session token, and fires onPick", async () => {
    queryPlaces.mockResolvedValue([
      { placeId: "p1", primaryText: "Kharadi", secondaryText: "Pune, Maharashtra" },
    ]);
    placeDetails.mockResolvedValue({
      lat: 18.5541343,
      lng: 73.9351687,
      formattedAddress: "Kharadi, Pune, Maharashtra 411014, India",
      components: [],
    });
    const onPick = vi.fn();
    const user = userEvent.setup();

    render(<PlacesSearchBar onPick={onPick} />);
    await user.type(screen.getByRole("combobox"), "Kharadi");
    const suggestion = await screen.findByText("Kharadi");
    await user.click(suggestion);

    await waitFor(() => expect(placeDetails).toHaveBeenCalledWith("p1", TOKEN));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: 18.5541343,
        lng: 73.9351687,
        formattedAddress: expect.stringContaining("Kharadi"),
      }),
    );
  });

  it("starts a fresh session so the next search is billed separately", async () => {
    // Google prices from open-session to first pick as one autocomplete
    // charge. Reusing the same token for the next search would fold two
    // sessions into one bill on their side but is not the shape they support
    // — this asserts we ask for a new one.
    queryPlaces.mockResolvedValue([
      { placeId: "p1", primaryText: "Kharadi", secondaryText: "Pune" },
    ]);
    placeDetails.mockResolvedValue({
      lat: 0,
      lng: 0,
      formattedAddress: "somewhere",
      components: [],
    });
    const user = userEvent.setup();

    render(<PlacesSearchBar onPick={vi.fn()} />);
    // First call is on mount.
    await waitFor(() => expect(createAutocompleteSession).toHaveBeenCalledTimes(1));

    await user.type(screen.getByRole("combobox"), "Kharadi");
    await user.click(await screen.findByText("Kharadi"));

    await waitFor(() => expect(createAutocompleteSession).toHaveBeenCalledTimes(2));
  });
});

describe("when the SDK cannot be reached", () => {
  it("does not throw when the session load fails", async () => {
    // A missing key or offline browser. The search bar renders inertly and
    // the map's drag/locate-me paths still work — the caller does not depend
    // on this component for the address to be entered.
    createAutocompleteSession.mockRejectedValue(new Error("no key"));

    expect(() => render(<PlacesSearchBar onPick={vi.fn()} />)).not.toThrow();
    // The input is still present so the user is not left staring at a broken
    // control.
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
