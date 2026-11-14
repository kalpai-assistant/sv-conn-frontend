import { kycLabel, outcomeLabel, settlementLabel, type PayoutProvider } from "@/lib/payouts";

const PILL =
  "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";
const NEUTRAL = "border-border bg-muted text-foreground";
const GOOD = "border-success/40 bg-success/10 text-success";
const BAD = "border-destructive/30 bg-destructive/10 text-destructive";
const MOVING = "border-primary/30 bg-primary/10 text-primary";

const SETTLEMENT_CLASSES: Record<string, string> = {
  pending: NEUTRAL,
  processing: MOVING,
  completed: GOOD,
  failed: BAD,
  reversed: BAD,
};

export function SettlementPill({ status }: { status: string }) {
  return (
    <span className={`${PILL} ${SETTLEMENT_CLASSES[status] ?? NEUTRAL}`}>
      {settlementLabel(status)}
    </span>
  );
}

const OUTCOME_CLASSES: Record<string, string> = {
  attempting: MOVING,
  unknown: BAD,
  initiated: MOVING,
  queued: MOVING,
  processing: MOVING,
  processed: GOOD,
  completed: GOOD,
  failed: BAD,
  rejected: BAD,
  reversed: BAD,
  requeued: NEUTRAL,
};

export function OutcomePill({ outcome }: { outcome: string }) {
  return (
    <span className={`${PILL} ${OUTCOME_CLASSES[outcome] ?? NEUTRAL}`}>
      {outcomeLabel(outcome)}
    </span>
  );
}

export function KycPill({ status, withPrefix = false }: { status: string; withPrefix?: boolean }) {
  return (
    <span
      className={`${PILL} ${status === "verified" ? GOOD : status === "rejected" ? BAD : NEUTRAL}`}
    >
      {withPrefix ? `KYC ${kycLabel(status).toLowerCase()}` : kycLabel(status)}
    </span>
  );
}

/** The things about an SP that stop or complicate a payout, as pills. Nothing when all is well. */
export function ProviderFlags({
  provider,
}: {
  provider: Pick<PayoutProvider, "kyc_status" | "payout_set" | "is_active">;
}) {
  return (
    <>
      {provider.kyc_status !== "verified" && <KycPill status={provider.kyc_status} withPrefix />}
      {!provider.payout_set && <span className={`${PILL} ${BAD}`}>No payout method</span>}
      {!provider.is_active && <span className={`${PILL} ${NEUTRAL}`}>Deactivated</span>}
    </>
  );
}
