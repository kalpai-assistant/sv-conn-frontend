/**
 * Who's on the job, and changing it (SVC-324). Pinned:
 *
 * - "nobody" (after a team Pro declined) always shows, with Assign someone;
 * - a named Pro shows only for an SP with a team, never for a solo SP;
 * - Change/Assign only while ACCEPTED (/assign refuses later);
 * - an older backend (field absent) shows nothing;
 * - the picker opens in re-pick mode, without the Pro already on the job;
 * - SVC-361: the list comes from the booking-filtered team (no decliner), the
 *   card from the whole team, and a failed filtered fetch falls back to it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Booking } from "@/lib/mock-data";
import { mapProfessional } from "@/hooks/useApi";

const { teamQuery, pickerProps } = vi.hoisted(() => ({
  teamQuery: vi.fn(),
  pickerProps: { current: null as null | Record<string, unknown> },
}));

vi.mock("@/hooks/useTeam", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useTeam")>();
  return { ...actual, useTeam: (...args: unknown[]) => teamQuery(...args) };
});
vi.mock("@/components/provider/TeamPicker", () => ({
  TeamPicker: (props: Record<string, unknown>) => {
    pickerProps.current = props;
    return <div data-testid="picker" />;
  },
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));

import { AssignedPro } from "@/components/provider/AssignedPro";

const member = (id: string, is_self = false, accepts_direct_jobs = true) => ({
  id,
  display_name: id,
  profile_photo_url: null,
  is_self,
  is_online: true,
  kyc_status: "verified",
  accepts_direct_jobs,
});
const SOLO = [member("Tush", true)];
const TEAM = [member("Tush", true), member("Rohan"), member("Asha")];

const booking = (over: Partial<Booking> = {}) =>
  ({ id: "b1", status: "ACCEPTED", ...over }) as Booking;
const rohan = { id: "Rohan", displayName: "Rohan", photoUrl: null, isSelf: false };

const refetch = vi.fn();

/**
 * The whole team, and what `?booking_id=` sends back for the re-pick list.
 * `afterRefetch`: what it sends once the picker's open refetches it.
 */
function teams(
  whole: unknown[],
  filtered: Record<string, unknown> = { data: whole },
  afterRefetch = filtered,
) {
  let current = filtered;
  refetch.mockImplementation(async () => {
    current = afterRefetch;
  });
  teamQuery.mockImplementation((_enabled?: boolean, opts?: { bookingId?: string }) =>
    opts?.bookingId ? { ...current, refetch } : { data: whole },
  );
}

/** Tap the button, wait out the refetch, and return the list the picker got. */
async function openPicker(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
  await waitFor(() => expect(pickerProps.current).not.toBeNull());
  return (pickerProps.current!.pros as Array<{ id: string }>).map((p) => p.id);
}

beforeEach(() => {
  vi.clearAllMocks();
  pickerProps.current = null;
  teams(TEAM);
});

describe("after a decline (nobody on the job)", () => {
  it("warns and offers Assign someone", async () => {
    render(<AssignedPro booking={booking({ professional: null })} />);
    expect(screen.getByText("Nobody is on this job")).toBeInTheDocument();
    expect(await openPicker(/assign someone/i)).toEqual(["Tush", "Rohan", "Asha"]);
    expect(pickerProps.current).toMatchObject({ mode: "repick", bookingId: "b1" });
  });
});

describe("with a Pro on the job", () => {
  it("names them and offers Change, without them in the list", async () => {
    render(<AssignedPro booking={booking({ professional: rohan })} />);
    expect(screen.getByText("Doing this job")).toBeInTheDocument();
    expect(screen.getByText("Rohan")).toBeInTheDocument();
    expect(await openPicker(/change/i)).toEqual(["Tush", "Asha"]);
  });

  it("passes a switched-off SP's own flag to the picker (SVC-326)", async () => {
    teams([member("Tush", true, false), member("Rohan")]);
    render(<AssignedPro booking={booking({ professional: null })} />);
    await openPicker(/assign someone/i);

    const pros = pickerProps.current!.pros as Array<{ id: string; accepts_direct_jobs: boolean }>;
    expect(pros.find((p) => p.id === "Tush")?.accepts_direct_jobs).toBe(false);
  });

  it("can't change once someone has set off", () => {
    render(<AssignedPro booking={booking({ status: "EN_ROUTE", professional: rohan })} />);
    expect(screen.getByText("Rohan")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change/i })).toBeNull();
  });
});

describe("shows nothing", () => {
  it("for a solo SP doing their own job", () => {
    teams(SOLO);
    const self = { id: "Tush", displayName: "Tush", photoUrl: null, isSelf: true };
    const { container } = render(<AssignedPro booking={booking({ professional: self })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("when the backend doesn't send the field", () => {
    const { container } = render(<AssignedPro booking={booking()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("on a finished job", () => {
    const { container } = render(
      <AssignedPro booking={booking({ status: "COMPLETED", professional: null })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("a Pro who declined (SVC-361)", () => {
  it("asks for the team filtered by this booking", () => {
    render(<AssignedPro booking={booking({ professional: null })} />);
    expect(teamQuery).toHaveBeenCalledWith(true, { bookingId: "b1" });
  });

  it("is left out of the picker when the API leaves them out", async () => {
    teams(TEAM, { data: [member("Tush", true), member("Asha")] });
    render(<AssignedPro booking={booking({ professional: null })} />);
    expect(await openPicker(/assign someone/i)).toEqual(["Tush", "Asha"]);
  });

  it("refetches on open, so a decline since the screen loaded is left out", async () => {
    // Found on device: the list loaded while Rohan was on the job, Rohan
    // declined, and the picker opened on that stale list.
    teams(TEAM, { data: TEAM }, { data: [member("Tush", true), member("Asha")] });
    render(<AssignedPro booking={booking({ professional: null })} />);
    fireEvent.click(screen.getByRole("button", { name: /assign someone/i }));
    expect(screen.getByText("Loading your team…")).toBeInTheDocument();
    expect(pickerProps.current).toBeNull();

    await waitFor(() => expect(pickerProps.current).not.toBeNull());
    expect(refetch).toHaveBeenCalledTimes(1);
    const pros = pickerProps.current!.pros as Array<{ id: string }>;
    expect(pros.map((p) => p.id)).toEqual(["Tush", "Asha"]);
  });

  it("doesn't hide the card when only the SP is left to pick", () => {
    // Rohan declined; the SP took the job. The card still reads the whole team.
    const self = { id: "Tush", displayName: "Tush", photoUrl: null, isSelf: true };
    teams([member("Tush", true), member("Rohan")], { data: [member("Tush", true)] });
    render(<AssignedPro booking={booking({ professional: self })} />);
    expect(screen.getByText("Doing this job")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /change/i })).toBeInTheDocument();
  });

  it("falls back to the whole team when the filtered fetch fails", async () => {
    teams(TEAM, { data: undefined, isError: true });
    render(<AssignedPro booking={booking({ professional: null })} />);
    expect(await openPicker(/assign someone/i)).toEqual(["Tush", "Rohan", "Asha"]);
  });
});

describe("mapProfessional", () => {
  it("keeps 'absent' apart from 'nobody'", () => {
    expect(mapProfessional({})).toBeUndefined();
    expect(mapProfessional({ professional: null })).toBeNull();
    expect(
      mapProfessional({
        professional: { id: "p1", display_name: "Rohan", profile_photo_url: null, is_self: false },
      }),
    ).toEqual({ id: "p1", displayName: "Rohan", photoUrl: null, isSelf: false });
  });
});
