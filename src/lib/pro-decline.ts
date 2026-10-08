/**
 * What a team Pro is told when they decline a job (SVC-322), for
 * `DeclineProJob`. Kept apart from the component so it can be tested alone.
 */
import { ApiError } from "@/lib/api";
import type { DeclineJobResult } from "@/hooks/usePro";

/** What the Pro is told once the decline lands, by where the job went. */
export function declinedMessage(outcome: DeclineJobResult["outcome"]): string {
  return outcome === "awaiting_repick"
    ? "Job declined. Your team will pick someone else."
    : "Job declined. We’ll find the customer someone else.";
}

/** Why a decline failed, in words a Pro can act on. */
export function declineErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) {
      return "You’re already on your way, so you can’t decline now. Talk to your team.";
    }
    if (err.status === 404) return "This job is no longer yours.";
  }
  return err instanceof Error ? err.message : "Couldn’t decline the job. Please try again.";
}
