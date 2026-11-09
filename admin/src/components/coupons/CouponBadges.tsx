/** A coupon's status and its personal tag. Tokens only, via the shared pill tones. */
import { Pill, TONES } from "@/components/teams/TeamBadges";
import { ownerLabel, statusLabel, type CouponRow } from "@/lib/coupons";

const STATUS_TONES: Record<string, keyof typeof TONES> = {
  active: "good",
  scheduled: "moving",
  inactive: "quiet",
  expired: "neutral",
  exhausted: "bad",
};

export function CouponStatusPill({ status }: { status: string }) {
  return <Pill tone={STATUS_TONES[status] ?? "neutral"}>{statusLabel(status)}</Pill>;
}

/**
 * Shown only on a personal (referral) coupon. Not a Pill: an owner's name can be
 * long, and a pill never wraps, so at phone width it would push the card sideways.
 */
export function PersonalTag({
  row,
}: {
  row: Pick<CouponRow, "user_id" | "owner_name" | "owner_phone">;
}) {
  if (row.user_id === null) return null;
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-xs font-medium [overflow-wrap:anywhere] ${TONES.neutral}`}
    >
      Personal · {ownerLabel(row)}
    </span>
  );
}
