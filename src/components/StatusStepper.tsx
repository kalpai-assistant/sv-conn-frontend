import { Check, X } from "lucide-react";
import type { BookingStatus, BookingStatusEvent } from "@/lib/mock-data";

interface Step {
  status: BookingStatus;
  label: string;
  // Set only on rows built from a history containing a reopen, where each row
  // is one event and carries that event's own time. Rows without it look
  // their time up in `reachedAt`, as they always have.
  at?: string;
}

/**
 * The row a reopen adds (SVC-362). Same words as the consumer push
 * (backend notification_tasks.py), so the screen and the notification tell
 * one story.
 */
const REOPEN_LABEL = "Finding another professional";

/** The five stages a booking passes through when nothing goes wrong. */
const HAPPY_PATH: Step[] = [
  { status: "REQUESTED", label: "Requested" },
  { status: "ACCEPTED", label: "Accepted" },
  { status: "EN_ROUTE", label: "En Route" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "COMPLETED", label: "Completed" },
];

/**
 * States that end a booking without completing it. Neither appears in
 * HAPPY_PATH, which is what broke this component: `indexOf` returned -1, so
 * `i < currentIndex` and `i === currentIndex` were false for every stage and
 * a cancelled booking rendered five ghosted steps — indistinguishable from
 * one that had only just been created. The tracking screen shows this
 * unconditionally, so a user who cancelled saw a timeline implying their
 * booking was still waiting to start.
 */
const TERMINAL_LABEL: Partial<Record<BookingStatus, string>> = {
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

/**
 * When a stage was reached, in the shortest form that stays unambiguous.
 *
 * Same-day stamps drop the date — a booking being tracked live is almost
 * always today's, and "27 Aug" on every row is noise. Anything older keeps
 * the date, because a scheduled booking can span days and a bare "9:15 AM"
 * would then be a lie by omission.
 *
 * Returns null rather than a placeholder on an unparseable value: a stage
 * with no readable timestamp should render as it did before timestamps
 * existed, not as "Invalid Date".
 */
function formatReachedAt(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;

  const time = at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const isToday = at.toDateString() === new Date().toDateString();
  if (isToday) return time;

  return `${at.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

/**
 * One row per history event, oldest first, or null when nothing was reopened.
 *
 * A reopen is a REQUESTED event after an ACCEPTED one: the SP gave the job
 * back (or their Pro declined) and the booking went looking again. The
 * backend logs it as ACCEPTED → REQUESTED, but the stage map below keys by
 * status, so it collapsed into the original "Requested" and the timeline
 * jumped from "Accepted" to whatever came next while the push said
 * "Finding another professional".
 *
 * Null on no reopen is deliberate: those bookings keep the stage-map
 * rendering untouched. A history that skips a stage would otherwise reorder
 * rows that have rendered the same way since SVC-248.
 *
 * Statuses outside HAPPY_PATH (the terminal ones) are not rows here; the
 * caller appends the terminal row itself.
 */
function eventSteps(history: BookingStatusEvent[]): Step[] | null {
  const steps: Step[] = [];
  let accepted = false;
  let reopened = false;

  for (const event of history) {
    const stage = HAPPY_PATH.find((s) => s.status === event.status);
    if (!stage) continue;
    if (event.status === "REQUESTED" && accepted) {
      reopened = true;
      steps.push({ status: "REQUESTED", label: REOPEN_LABEL, at: event.at });
    } else {
      steps.push({ ...stage, at: event.at });
    }
    if (event.status === "ACCEPTED") accepted = true;
  }

  return reopened ? steps : null;
}

export function StatusStepper({
  currentStatus,
  history = [],
}: {
  currentStatus: BookingStatus;
  history?: BookingStatusEvent[];
}) {
  const terminalLabel = TERMINAL_LABEL[currentStatus];

  // First arrival at each stage, not the last. A booking that moved through a
  // stage twice should show when it was first reached — a later entry
  // describes the repeat, not the point the user's booking got there.
  const reachedAt = new Map<BookingStatus, string>();
  for (const event of history) {
    if (!reachedAt.has(event.status)) reachedAt.set(event.status, event.at);
  }

  // A terminal booking shows the stages it actually reached, then how it
  // ended: "Requested → Accepted → En Route → Cancelled".
  //
  // This is what `status_history` bought (SVC-248). Before the API exposed
  // it, this component received only the CURRENT status and so could not
  // distinguish a booking cancelled while EN_ROUTE from one cancelled
  // seconds after being requested; it collapsed both to "Requested →
  // Cancelled" rather than guess at a history it could not see.
  //
  // That collapse is still the fallback, and still reachable: bookings
  // predating `booking_status_logs` have no entries at all. Showing the one
  // stage every booking is known to have passed through beats showing none.
  const reachedStages = HAPPY_PATH.filter((s) => reachedAt.has(s.status));
  const reopenedSteps = eventSteps(history);

  let steps: Step[];
  let currentIndex: number;
  if (reopenedSteps) {
    // A reopened booking reads in the order it happened, so "Accepted" can
    // appear twice with "Finding another professional" between them.
    if (terminalLabel) {
      steps = [...reopenedSteps, { status: currentStatus, label: terminalLabel }];
      currentIndex = steps.length - 1;
    } else {
      // Stages still ahead follow from the LAST row, not the first arrival:
      // after a reopen the booking is back at Requested and has Accepted
      // ahead of it again.
      const last = reopenedSteps[reopenedSteps.length - 1];
      const ahead = HAPPY_PATH.slice(HAPPY_PATH.findIndex((s) => s.status === last.status) + 1);
      steps = [...reopenedSteps, ...ahead];
      currentIndex = reopenedSteps.length - 1;
    }
  } else {
    steps = terminalLabel
      ? [
          ...(reachedStages.length > 0 ? reachedStages : [HAPPY_PATH[0]]),
          { status: currentStatus, label: terminalLabel },
        ]
      : HAPPY_PATH;

    // Clamped, not raw. An unrecognised status (a stage added backend-side
    // before this map is updated) would otherwise land on -1 and reproduce the
    // exact all-ghosted bug above. Falling back to the first stage shows
    // something true — every booking was requested — rather than nothing.
    currentIndex = terminalLabel
      ? steps.length - 1
      : Math.max(
          0,
          steps.findIndex((s) => s.status === currentStatus),
        );
  }

  return (
    <div className="flex flex-col gap-0">
      {steps.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        // The final step of a terminal booking is not an achievement —
        // colour it destructive so "Cancelled" never reads like "Completed".
        const isTerminalStep = isCurrent && !!terminalLabel;

        // Only for stages already behind us. A future stage has no timestamp
        // to show, and a stage the history doesn't mention renders exactly as
        // it did before this component knew about timestamps.
        const raw = isCompleted || isCurrent ? (step.at ?? reachedAt.get(step.status)) : undefined;
        const reached = raw ? formatReachedAt(raw) : null;

        return (
          // `items-stretch`, so the rail column grows with the label block
          // rather than sitting at the height of a single line. With a
          // timestamp under the label a row is two lines tall, and the fixed
          // connector this used to have left the dots drifting out of line
          // with their own text.
          // Index in the key: a reopened booking has two "Accepted" rows.
          <div key={`${i}-${step.status}`} className="flex items-stretch gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  isCompleted
                    ? "border-success bg-success"
                    : isTerminalStep
                      ? "border-destructive bg-destructive"
                      : isCurrent
                        ? "border-primary bg-primary"
                        : "border-border bg-card"
                }`}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5 text-success-foreground" />
                ) : isTerminalStep ? (
                  <X className="h-3.5 w-3.5 text-destructive-foreground" />
                ) : (
                  <div
                    className={`h-2 w-2 rounded-full ${
                      isCurrent ? "bg-primary-foreground" : "bg-muted-foreground/30"
                    }`}
                  />
                )}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`min-h-6 w-0.5 flex-1 ${isCompleted ? "bg-success" : "bg-border"}`}
                />
              )}
            </div>
            <div className={`flex flex-col pt-1 ${i < steps.length - 1 ? "pb-3" : ""}`}>
              <span
                className={`text-sm ${
                  isTerminalStep
                    ? "font-semibold text-destructive"
                    : isCurrent
                      ? "font-semibold text-foreground"
                      : isCompleted
                        ? "font-medium text-success"
                        : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
              {reached && (
                <span className="text-xs leading-tight text-muted-foreground">{reached}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
