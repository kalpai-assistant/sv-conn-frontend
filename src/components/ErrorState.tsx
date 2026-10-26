/**
 * The "we could not load this" screen, with a retry.
 *
 * Consolidates a block that was duplicated across bookings, activity,
 * admin.kyc and admin.payouts.
 *
 * ⚠️ Render order matters, and is the reason this component exists:
 *
 *     isLoading  →  isError  →  empty  →  data
 *
 * `isError` must be checked BEFORE the empty case. Reverse them and a failed
 * request falls through to "you have no bookings" — the app confidently
 * telling users something false about their own data. That is not
 * hypothetical: bookings.tsx records it happening on beta when the DB
 * drifted and /bookings 500'd for everyone, and the category page shipped
 * the same bug earlier in this ticket.
 *
 * Deliberately distinct from `EmptyState` — destructive icon, no cheerful
 * illustration. The two must never be mistaken for one another at a glance.
 */
import { AlertCircle } from "lucide-react";

interface ErrorStateProps {
  /** What failed, in the user's terms: "Couldn't load your bookings." */
  message: string;
  /** Usually a query's `refetch`. Its promise is ignored — react-query
   *  surfaces the outcome through the same isError this component reads. */
  onRetry?: () => unknown;
  fullScreen?: boolean;
  /** The retry button's text. Only the SP's translated screens pass it (SVC-376). */
  retryLabel?: string;
}

export function ErrorState({
  message,
  onRetry,
  fullScreen = false,
  retryLabel = "Try again",
}: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 px-8 text-center ${
        fullScreen ? "min-h-screen" : "py-12"
      }`}
    >
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          onClick={() => onRetry()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
