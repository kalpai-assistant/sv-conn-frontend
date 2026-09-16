/**
 * What a provider's job is called, and what colour it wears (SVC-296, SVC-274).
 *
 * Lived inside the Jobs page until Home needed the same vocabulary. A second
 * copy would have drifted — the same divergence SVC-287 had to undo when two
 * address sheets disagreed about a tick versus a badge, and one screen drew a
 * pin where the other drew a house.
 *
 * The palette mirrors the consumer list (`src/routes/bookings.tsx`) so a status
 * means the same colour on both sides of the app.
 */
import type { Booking, BookingStatus } from "@/lib/mock-data";

/**
 * A job the provider still has work to do on.
 *
 * REQUESTED is deliberately absent: an unaccepted booking belongs to the
 * broadcast, not to this provider, and `GET /bookings/` only returns rows
 * already assigned to them anyway.
 */
export const activeStatuses: BookingStatus[] = ["ACCEPTED", "EN_ROUTE", "IN_PROGRESS"];

export const statusStyle: Partial<Record<BookingStatus, string>> = {
  ACCEPTED: "bg-blue-100 text-blue-700",
  EN_ROUTE: "bg-purple-100 text-purple-700",
  IN_PROGRESS: "bg-orange-100 text-orange-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
  EXPIRED: "bg-gray-100 text-gray-700",
};

export const statusLabel: Partial<Record<BookingStatus, string>> = {
  ACCEPTED: "Accepted",
  EN_ROUTE: "On the way",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

export function isActive(job: Booking): boolean {
  return activeStatuses.includes(job.status as BookingStatus);
}

/**
 * When a finished job actually finished (SVC-296).
 *
 * The terminal transition, not `scheduledAt` — a job cancelled three days after
 * it was booked is filed under the day it ended, which is what a provider
 * looking back is trying to find. Falls back to the booking date when the
 * history is missing rather than rendering an empty cell.
 */
export function endedAt(job: Booking): string {
  const terminal = [...(job.statusHistory ?? [])]
    .reverse()
    .find((entry) => !activeStatuses.includes(entry.status));
  const when = terminal?.at ?? job.createdAt ?? job.scheduledAt;
  if (!when) return "";
  return new Date(when).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * How soon a job is due, in words (SVC-274).
 *
 * "Accepted" says nothing about urgency — in twenty minutes, or tomorrow? A
 * relative time is what turns a set of equal rows into an ordered queue.
 *
 * Deliberately coarse. A provider deciding what to do next needs "soon" versus
 * "later", not a countdown, and a ticking number on a list is noise. Past due
 * reads as "now" rather than a negative: the job did not stop existing because
 * the slot passed, and "-12 min" tells them nothing they can act on.
 */
export function dueIn(job: Booking, now: Date = new Date()): string {
  const when = job.scheduledAt;
  if (!when) return "";
  const at = new Date(when);
  if (Number.isNaN(at.getTime())) return "";

  const minutes = Math.round((at.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${minutes} min`;

  const sameDay = at.toDateString() === now.toDateString();
  const clock = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return clock;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (at.toDateString() === tomorrow.toDateString()) return `tomorrow ${clock}`;

  return at.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * The job a provider is actually working on, if any.
 *
 * The statuses are a pipeline, not a set of categories — ACCEPTED means "not
 * started", EN_ROUTE "travelling", IN_PROGRESS "at the door". Only one job can
 * honestly be the current one, and it is the furthest along: a provider in
 * progress somewhere is not simultaneously on their way elsewhere.
 *
 * Returns null when nothing is live, which is the case Home renders its quiet
 * empty row for.
 */
const PIPELINE: BookingStatus[] = ["IN_PROGRESS", "EN_ROUTE", "ACCEPTED"];

export function currentJob(jobs: Booking[]): Booking | null {
  for (const status of PIPELINE) {
    const match = jobs.find((job) => job.status === status);
    if (match) return match;
  }
  return null;
}
