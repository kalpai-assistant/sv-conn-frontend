/** A dispute's status and its refund's state. Tokens only, via the shared pill tones. */
import { Pill, TONES } from "@/components/teams/TeamBadges";
import { disputeStatusLabel, refundStatusLabel, type DisputeRow } from "@/lib/disputes";

const STATUS_TONES: Record<string, keyof typeof TONES> = {
  RAISED: "moving",
  IN_REVIEW: "moving",
  RESOLVED: "neutral",
  CLOSED: "quiet",
};

export function DisputeStatusPill({ status }: { status: string }) {
  return <Pill tone={STATUS_TONES[status] ?? "neutral"}>{disputeStatusLabel(status)}</Pill>;
}

const REFUND_TONES: Record<string, keyof typeof TONES> = {
  PENDING: "moving",
  PROCESSED: "good",
  FAILED: "bad",
};

/** Razorpay's side of a refund. A manual one has no status: it's a record. */
export function RefundStatusPill({
  row,
}: {
  row: Pick<DisputeRow, "refund_status" | "refund_channel">;
}) {
  if (row.refund_channel === "MANUAL") return <Pill tone="neutral">Manual, recorded</Pill>;
  if (row.refund_status === null) return null;
  return (
    <Pill tone={REFUND_TONES[row.refund_status] ?? "neutral"}>
      {refundStatusLabel(row.refund_status)}
    </Pill>
  );
}
