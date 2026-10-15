/**
 * The consumer tracking timeline (SVC-362).
 *
 * A reopen — the SP gives the job back, or their Pro declines — is logged as
 * ACCEPTED → REQUESTED, and the consumer is pushed "Finding another
 * professional". The timeline used to key stages by status, so that second
 * REQUESTED folded into the first and the screen never showed the step the
 * push announced.
 *
 * Rows are read back as label + time + state rather than snapshotted: the
 * point is which rows exist, in what order, and which one is current.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { StatusStepper } from "./StatusStepper";
import type { BookingStatus, BookingStatusEvent } from "@/lib/mock-data";

// Same calendar day as every stamp below, so rows show a bare time.
const NOW = new Date("2026-10-15T12:00:00+05:30");

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

const T = {
  requested: "2026-10-15T09:00:00+05:30",
  accepted: "2026-10-15T09:05:00+05:30",
  reopened: "2026-10-15T09:20:00+05:30",
  reaccepted: "2026-10-15T09:30:00+05:30",
  reopened2: "2026-10-15T09:40:00+05:30",
  reaccepted2: "2026-10-15T09:50:00+05:30",
  enRoute: "2026-10-15T10:00:00+05:30",
  ended: "2026-10-15T10:30:00+05:30",
};

function ev(status: BookingStatus, at: string): BookingStatusEvent {
  return { status, at };
}

type State = "completed" | "current" | "terminal" | "future";

function rows(currentStatus: BookingStatus, history?: BookingStatusEvent[]) {
  const { container } = render(<StatusStepper currentStatus={currentStatus} history={history} />);
  return Array.from(container.firstElementChild!.children).map((row) => {
    const [label, stamp] = Array.from(row.children[1].children) as HTMLElement[];
    const cls = label.className;
    const state: State = cls.includes("text-destructive")
      ? "terminal"
      : cls.includes("text-success")
        ? "completed"
        : cls.includes("text-foreground")
          ? "current"
          : "future";
    return { label: label.textContent, time: stamp?.textContent ?? null, state };
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a reopened booking", () => {
  it("shows accepted → requested → accepted as its own steps, each with its own time", () => {
    expect(
      rows("ACCEPTED", [
        ev("REQUESTED", T.requested),
        ev("ACCEPTED", T.accepted),
        ev("REQUESTED", T.reopened),
        ev("ACCEPTED", T.reaccepted),
      ]),
    ).toEqual([
      { label: "Requested", time: time(T.requested), state: "completed" },
      { label: "Accepted", time: time(T.accepted), state: "completed" },
      { label: "Finding another professional", time: time(T.reopened), state: "completed" },
      { label: "Accepted", time: time(T.reaccepted), state: "current" },
      { label: "En Route", time: null, state: "future" },
      { label: "In Progress", time: null, state: "future" },
      { label: "Completed", time: null, state: "future" },
    ]);
  });

  it("makes the reopen row current while the booking is searching again", () => {
    expect(
      rows("REQUESTED", [
        ev("REQUESTED", T.requested),
        ev("ACCEPTED", T.accepted),
        ev("REQUESTED", T.reopened),
      ]),
    ).toEqual([
      { label: "Requested", time: time(T.requested), state: "completed" },
      { label: "Accepted", time: time(T.accepted), state: "completed" },
      { label: "Finding another professional", time: time(T.reopened), state: "current" },
      { label: "Accepted", time: null, state: "future" },
      { label: "En Route", time: null, state: "future" },
      { label: "In Progress", time: null, state: "future" },
      { label: "Completed", time: null, state: "future" },
    ]);
  });

  it("takes the stages ahead from the last row, not the first arrival", () => {
    expect(
      rows("EN_ROUTE", [
        ev("REQUESTED", T.requested),
        ev("ACCEPTED", T.accepted),
        ev("REQUESTED", T.reopened),
        ev("ACCEPTED", T.reaccepted),
        ev("EN_ROUTE", T.enRoute),
      ]),
    ).toEqual([
      { label: "Requested", time: time(T.requested), state: "completed" },
      { label: "Accepted", time: time(T.accepted), state: "completed" },
      { label: "Finding another professional", time: time(T.reopened), state: "completed" },
      { label: "Accepted", time: time(T.reaccepted), state: "completed" },
      { label: "En Route", time: time(T.enRoute), state: "current" },
      { label: "In Progress", time: null, state: "future" },
      { label: "Completed", time: null, state: "future" },
    ]);
  });

  it("keeps the reopen when the search then expires", () => {
    expect(
      rows("EXPIRED", [
        ev("REQUESTED", T.requested),
        ev("ACCEPTED", T.accepted),
        ev("REQUESTED", T.reopened),
        ev("EXPIRED", T.ended),
      ]),
    ).toEqual([
      { label: "Requested", time: time(T.requested), state: "completed" },
      { label: "Accepted", time: time(T.accepted), state: "completed" },
      { label: "Finding another professional", time: time(T.reopened), state: "completed" },
      { label: "Expired", time: time(T.ended), state: "terminal" },
    ]);
  });

  it("gives each of two reopens its own row", () => {
    expect(
      rows("ACCEPTED", [
        ev("REQUESTED", T.requested),
        ev("ACCEPTED", T.accepted),
        ev("REQUESTED", T.reopened),
        ev("ACCEPTED", T.reaccepted),
        ev("REQUESTED", T.reopened2),
        ev("ACCEPTED", T.reaccepted2),
      ]).map((r) => [r.label, r.time]),
    ).toEqual([
      ["Requested", time(T.requested)],
      ["Accepted", time(T.accepted)],
      ["Finding another professional", time(T.reopened)],
      ["Accepted", time(T.reaccepted)],
      ["Finding another professional", time(T.reopened2)],
      ["Accepted", time(T.reaccepted2)],
      ["En Route", null],
      ["In Progress", null],
      ["Completed", null],
    ]);
  });
});

describe("a booking that was never reopened", () => {
  it("renders the happy path as before", () => {
    expect(
      rows("EN_ROUTE", [
        ev("REQUESTED", T.requested),
        ev("ACCEPTED", T.accepted),
        ev("EN_ROUTE", T.enRoute),
      ]),
    ).toEqual([
      { label: "Requested", time: time(T.requested), state: "completed" },
      { label: "Accepted", time: time(T.accepted), state: "completed" },
      { label: "En Route", time: time(T.enRoute), state: "current" },
      { label: "In Progress", time: null, state: "future" },
      { label: "Completed", time: null, state: "future" },
    ]);
  });

  it("falls back to Requested → Cancelled when a cancel has no history", () => {
    expect(rows("CANCELLED", [])).toEqual([
      { label: "Requested", time: null, state: "completed" },
      { label: "Cancelled", time: null, state: "terminal" },
    ]);
  });
});
