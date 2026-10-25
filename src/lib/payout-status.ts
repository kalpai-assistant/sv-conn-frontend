/**
 * Where a completed job's money is, in the provider's words (SVC-303).
 *
 * ## Why this is a module rather than a ternary at the call site
 *
 * The mapping is not one-to-one with the backend enum. `SettlementStatus` has
 * five values, but **cash is not one of them** — a cash booking never enters
 * the payout path at all, because the provider collected at the door. So the
 * real input is a pair, `(payment_method, settlement_status)`, and the pair has
 * exactly one correct reading per combination.
 *
 * Getting that wrong is not cosmetic. Labelling a cash job "Paid" implies a
 * bank transfer that never happened, and collapsing `REVERSED` into "failed"
 * tells a provider money never arrived when they watched it arrive and leave
 * again. Both are the app lying about money, which is the failure mode this
 * whole ticket exists to prevent.
 *
 * ## Chips versus blocks
 *
 * Steady states get a quiet chip. `failed` and `reversed` get `severity:
 * "alert"` because they need the provider to *do* something — a chip they can
 * skim past is the wrong container for "your money did not arrive".
 */
import type { ApiPaymentMethod, SettlementStatus } from "@/hooks/useApi";
import { englishT, type Translate } from "@/i18n";

export type PayoutStateKey = "cash" | "awaiting" | "processing" | "paid" | "failed" | "reversed";

export interface PayoutState {
  key: PayoutStateKey;
  /** Chip text. Short enough to sit beside a service name on a phone. */
  label: string;
  /** "alert" states get an error block instead of a chip. */
  severity: "quiet" | "alert";
  /** Tailwind classes for the chip. Unused on alert states. */
  className: string;
}

const STATES: Record<PayoutStateKey, PayoutState> = {
  // Its own state, never a variant of "paid": no transfer happened, and the
  // provider is not owed anything because they already hold the money.
  cash: {
    key: "cash",
    label: "Collected in cash",
    severity: "quiet",
    className: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  },
  awaiting: {
    key: "awaiting",
    label: "Awaiting payout",
    severity: "quiet",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  },
  // Sent to the bank, not yet confirmed. Distinct from awaiting, which has not
  // been sent at all — the difference matters to someone watching for money.
  processing: {
    key: "processing",
    label: "Payout in progress",
    severity: "quiet",
    className: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  },
  // No date. A per-job paid date would need a join through
  // `settlement_payout_id` onto `payout_audits`, which is unindexed and
  // duplicated — a reconciled payout writes two rows sharing one payout_id, so
  // the join would double the window total. Dates live on the Payouts screen,
  // per settlement cycle, where they are correct by construction.
  paid: {
    key: "paid",
    label: "Paid",
    severity: "quiet",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  failed: {
    key: "failed",
    label: "Payout failed",
    severity: "alert",
    className: "bg-destructive/10 text-destructive",
  },
  // Money went out and was clawed back. Deliberately not folded into `failed`:
  // the provider saw this arrive, and calling it a failure would contradict
  // their own bank statement.
  reversed: {
    key: "reversed",
    label: "Payout reversed",
    severity: "alert",
    className: "bg-destructive/10 text-destructive",
  },
};

/**
 * The one reading of a job's payout position.
 *
 * Returns null when there is nothing to say — a booking from before these
 * columns existed carries no settlement status, and an unlabelled row is
 * better than a guessed label on a screen about money.
 */
export function payoutState(
  paymentMethod: ApiPaymentMethod | null | undefined,
  settlementStatus: SettlementStatus | null | undefined,
  t?: Translate,
): PayoutState | null {
  const state = payoutStateEn(paymentMethod, settlementStatus);
  // SVC-376: the chip in the screen's language. Without a `t` the English
  // label below is returned untouched.
  if (!state || !t) return state;
  return { ...state, label: t(`payoutStatus.${state.key}`) };
}

function payoutStateEn(
  paymentMethod: ApiPaymentMethod | null | undefined,
  settlementStatus: SettlementStatus | null | undefined,
): PayoutState | null {
  // Checked first, and deliberately so: a cash booking's settlement_status is
  // whatever the column defaults to, and reading it would label a cash job
  // "Awaiting payout" — money the provider is never going to receive, because
  // they already have it.
  if (paymentMethod === "cash") return STATES.cash;

  switch (settlementStatus) {
    case "pending":
      return STATES.awaiting;
    case "processing":
      return STATES.processing;
    case "completed":
      return STATES.paid;
    case "failed":
      return STATES.failed;
    case "reversed":
      return STATES.reversed;
    default:
      return null;
  }
}
