/**
 * Who's on the job, and changing it (SVC-324). Pinned:
 *
 * - "nobody" (after a team Pro declined) always shows, with Assign someone;
 * - a named Pro shows only for an SP with a team, never for a solo SP;
 * - Change/Assign only while ACCEPTED (/assign refuses later);
 * - an older backend (field absent) shows nothing;
 * - the picker opens in re-pick mode, without the Pro already on the job.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Booking } from "@/lib/mock-data";
import { mapProfessional } from "@/hooks/useApi";

const { teamQuery, pickerProps } = vi.hoisted(() => ({
  teamQuery: vi.fn(),
  pickerProps: { current: null as null | Record<string, unknown> },
}));

vi.mock("@/hooks/useTeam", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useTeam")>();
  return { ...actual, useTeam: () => teamQuery() };
});
vi.mock("@/components/provider/TeamPicker", () => ({
  TeamPicker: (props: Record<string, unknown>) => {
    pickerProps.current = props;
    return <div data-testid="picker" />;
  },
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));

import { AssignedPro } from "@/components/provider/AssignedPro";

const member = (id: string, is_self = false) => ({
  id,
  display_name: id,
  profile_photo_url: null,
  is_self,
  is_online: true,
  kyc_status: "verified",
});
const SOLO = [member("Tush", true)];
const TEAM = [member("Tush", true), member("Rohan"), member("Asha")];

const booking = (over: Partial<Booking> = {}) =>
  ({ id: "b1", status: "ACCEPTED", ...over }) as Booking;
const rohan = { id: "Rohan", displayName: "Rohan", photoUrl: null, isSelf: false };

beforeEach(() => {
  vi.clearAllMocks();
  pickerProps.current = null;
  teamQuery.mockReturnValue({ data: TEAM });
});

describe("after a decline (nobody on the job)", () => {
  it("warns and offers Assign someone", () => {
    render(<AssignedPro booking={booking({ professional: null })} />);
    expect(screen.getByText("Nobody is on this job")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /assign someone/i }));

    expect(pickerProps.current).toMatchObject({ mode: "repick", bookingId: "b1" });
    const pros = pickerProps.current!.pros as Array<{ id: string }>;
    expect(pros.map((p) => p.id)).toEqual(["Tush", "Rohan", "Asha"]);
  });
});

describe("with a Pro on the job", () => {
  it("names them and offers Change, without them in the list", () => {
    render(<AssignedPro booking={booking({ professional: rohan })} />);
    expect(screen.getByText("Doing this job")).toBeInTheDocument();
    expect(screen.getByText("Rohan")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /change/i }));

    const pros = pickerProps.current!.pros as Array<{ id: string }>;
    expect(pros.map((p) => p.id)).toEqual(["Tush", "Asha"]);
  });

  it("can't change once someone has set off", () => {
    render(<AssignedPro booking={booking({ status: "EN_ROUTE", professional: rohan })} />);
    expect(screen.getByText("Rohan")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change/i })).toBeNull();
  });
});

describe("shows nothing", () => {
  it("for a solo SP doing their own job", () => {
    teamQuery.mockReturnValue({ data: SOLO });
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
