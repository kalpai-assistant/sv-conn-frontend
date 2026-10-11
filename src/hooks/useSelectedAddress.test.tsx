/**
 * Which saved address the app is working against.
 *
 * The hook stores an id and resolves it against the fetched list, which means
 * it has to tell two situations apart that look identical from inside the
 * effect: an address that was deleted, and an address so new the cache has not
 * caught up. Getting that wrong deletes the user's choice a moment after they
 * make it — found on device (SVC-283), and the reason for `justWritten`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

const useAddresses = vi.fn();
vi.mock("@/hooks/useApi", () => ({
  useAddresses: () => useAddresses(),
}));

import { readSelectedAddressCache, useSelectedAddress } from "@/hooks/useSelectedAddress";

const KARVE = { id: "a1", label: "home", full: "Karve Nagar, Pune", lat: 18.49, lng: 73.81 };
const KHARADI = { id: "a2", label: "home", full: "Kharadi, Pune", lat: 18.55, lng: 73.93 };

/** Renders the hook and exposes its current view plus the setter. */
function Probe() {
  const { selected, setSelectedId } = useSelectedAddress();
  return (
    <div>
      <span data-testid="selected">{selected?.full ?? "(none)"}</span>
      <button onClick={() => setSelectedId(KHARADI.id)}>pick kharadi</button>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useAddresses.mockReturnValue({ data: [KARVE], isLoading: false });
});

describe("resolving the stored id", () => {
  it("falls back to the first address when nothing is stored", () => {
    render(<Probe />);

    expect(screen.getByTestId("selected")).toHaveTextContent("Karve Nagar, Pune");
  });

  it("uses the stored id when it resolves", () => {
    useAddresses.mockReturnValue({ data: [KARVE, KHARADI], isLoading: false });
    localStorage.setItem("sc_selected_address_id", KHARADI.id);

    render(<Probe />);

    expect(screen.getByTestId("selected")).toHaveTextContent("Kharadi, Pune");
  });

  it("forgets an id that was never written this session and cannot resolve", () => {
    // A genuinely deleted address. Left in place it would give the user the
    // fallback UI on every load with no way to understand why.
    localStorage.setItem("sc_selected_address_id", "deleted-long-ago");

    render(<Probe />);

    expect(localStorage.getItem("sc_selected_address_id")).toBeNull();
    expect(screen.getByTestId("selected")).toHaveTextContent("Karve Nagar, Pune");
  });
});

describe("the offline-fallback cache (SVC-351)", () => {
  it("mirrors the resolved selection to localStorage", async () => {
    useAddresses.mockReturnValue({ data: [KARVE, KHARADI], isLoading: false });
    localStorage.setItem("sc_selected_address_id", KHARADI.id);

    render(<Probe />);

    // Written on effect so the next cold start has something to paint when
    // React Query's in-memory cache is gone — the LocationBar reads this
    // on offline-boot and so does the root gate's bypass logic.
    await vi.waitFor(() => {
      expect(localStorage.getItem("sc_selected_address_cache")).not.toBeNull();
    });
    const cached = readSelectedAddressCache();
    expect(cached?.id).toBe(KHARADI.id);
    expect(cached?.full).toBe("Kharadi, Pune");
  });

  it("reads the cache even when no fetch has happened yet", () => {
    // Simulates an offline cold start before the pending React Query call
    // resolves. The read is a plain localStorage lookup, deliberately not a
    // hook: the root gate reaches for it to decide whether to short-circuit
    // the spinner for a returning user.
    localStorage.setItem(
      "sc_selected_address_cache",
      JSON.stringify({ id: "a1", label: "home", full: "Karve Nagar, Pune" }),
    );

    const cached = readSelectedAddressCache();
    expect(cached?.id).toBe("a1");
    expect(cached?.full).toBe("Karve Nagar, Pune");
  });

  it("returns null when the cache is absent or malformed", () => {
    expect(readSelectedAddressCache()).toBeNull();

    // Garbage from an older version of the schema or a half-written entry
    // must not throw: the gate branches on this, and an exception here would
    // paint a white screen on offline-boot.
    localStorage.setItem("sc_selected_address_cache", "not json");
    expect(readSelectedAddressCache()).toBeNull();

    localStorage.setItem("sc_selected_address_cache", JSON.stringify({ id: 1 }));
    expect(readSelectedAddressCache()).toBeNull();
  });
});

describe("selecting an address the list has not caught up with", () => {
  it("keeps a brand-new selection while the refetch is still in flight", () => {
    // The device bug. `useAddresses` is invalidated rather than updated, so
    // immediately after saving there is a window where the new id is real but
    // absent from the cache. The cleanup used to read that as "deleted" and
    // erase the selection — leaving the header on the previous address, which
    // is exactly what a user sees as "it ignored what I just chose".
    render(<Probe />);

    act(() => {
      screen.getByRole("button", { name: /pick kharadi/i }).click();
    });

    expect(localStorage.getItem("sc_selected_address_id")).toBe(KHARADI.id);
  });

  it("shows the new address once the refetch lands", () => {
    const { rerender } = render(<Probe />);

    act(() => {
      screen.getByRole("button", { name: /pick kharadi/i }).click();
    });
    // The refetch completes and the list now contains it.
    useAddresses.mockReturnValue({ data: [KARVE, KHARADI], isLoading: false });
    rerender(<Probe />);

    expect(screen.getByTestId("selected")).toHaveTextContent("Kharadi, Pune");
    expect(localStorage.getItem("sc_selected_address_id")).toBe(KHARADI.id);
  });
});
