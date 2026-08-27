import { Check, X } from "lucide-react";
import type { BookingStatus } from "@/lib/mock-data";

interface Step {
  status: BookingStatus;
  label: string;
}

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

export function StatusStepper({ currentStatus }: { currentStatus: BookingStatus }) {
  const terminalLabel = TERMINAL_LABEL[currentStatus];

  // A terminal booking collapses to "Requested → Cancelled/Expired".
  //
  // It deliberately does NOT show how far the booking actually got, because
  // this component cannot know: it receives only the CURRENT status, so a
  // booking cancelled while EN_ROUTE is indistinguishable from one cancelled
  // seconds after being requested. Rendering assumed progress would be a
  // confident guess about the user's own history — showing less is the honest
  // option. The accurate version needs `status_history` on BookingResponse;
  // the rows exist in `booking_status_logs` but the API does not expose them.
  const steps: Step[] = terminalLabel
    ? [HAPPY_PATH[0], { status: currentStatus, label: terminalLabel }]
    : HAPPY_PATH;

  // Clamped, not raw. An unrecognised status (a stage added backend-side
  // before this map is updated) would otherwise land on -1 and reproduce the
  // exact all-ghosted bug above. Falling back to the first stage shows
  // something true — every booking was requested — rather than nothing.
  const currentIndex = terminalLabel
    ? steps.length - 1
    : Math.max(
        0,
        steps.findIndex((s) => s.status === currentStatus),
      );

  return (
    <div className="flex flex-col gap-0">
      {steps.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        // The final step of a terminal booking is not an achievement —
        // colour it destructive so "Cancelled" never reads like "Completed".
        const isTerminalStep = isCurrent && !!terminalLabel;

        return (
          <div key={step.status} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
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
                <div className={`h-6 w-0.5 ${isCompleted ? "bg-success" : "bg-border"}`} />
              )}
            </div>
            <span
              className={`pt-1 text-sm ${
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
          </div>
        );
      })}
    </div>
  );
}
