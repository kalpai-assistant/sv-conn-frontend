/**
 * A dispute as text: what was logged, and how it was settled. Every field that
 * came from a person or Razorpay is rendered as text.
 */
import { DisputeStatusPill, RefundStatusPill } from "@/components/refunds/DisputeBadges";
import { Fact } from "@/components/teams/PageSection";
import { actorLabel, formatIst } from "@/lib/bookings";
import { reasonLabel, refundSummary, resolutionLabel, type DisputeRow } from "@/lib/disputes";

const WRAP = "[overflow-wrap:anywhere]";

/** The complaint: reason, description, who logged it and when. */
export function DisputeFacts({ dispute }: { dispute: DisputeRow }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <DisputeStatusPill status={dispute.status} />
        <RefundStatusPill row={dispute} />
        <span className="text-sm font-medium">{reasonLabel(dispute.reason_code)}</span>
      </div>
      <p className={`text-sm whitespace-pre-line ${WRAP}`}>{dispute.description}</p>
      <p className={`text-xs text-muted-foreground ${WRAP}`}>
        Logged {formatIst(dispute.created_at)} (IST) by{" "}
        {actorLabel(dispute.created_by_name, dispute.created_by)}
      </p>
    </div>
  );
}

function Settlement({ dispute }: { dispute: DisputeRow }) {
  if (dispute.resolution_type === null) return null;
  return (
    <dl className="grid gap-3 border-t pt-3 sm:grid-cols-2">
      <Fact label="Resolution">{resolutionLabel(dispute.resolution_type)}</Fact>
      <Fact label="Refund">
        <span className="tabular-nums">{refundSummary(dispute)}</span>
      </Fact>
      {dispute.resolved_at && (
        <Fact label="Resolved (IST)">
          {formatIst(dispute.resolved_at)} by{" "}
          {actorLabel(dispute.resolved_by_name, dispute.resolved_by)}
        </Fact>
      )}
      {dispute.razorpay_refund_id && (
        <Fact label="Razorpay refund">
          <span className="font-mono text-xs">{dispute.razorpay_refund_id}</span>
        </Fact>
      )}
      {dispute.refund_status === "PENDING" && (
        <div className="sm:col-span-2">
          <Fact label="Refund state">
            Waiting for Razorpay to confirm. The dispute closes when it does.
          </Fact>
        </div>
      )}
      {dispute.refund_status === "FAILED" && (
        <div className="sm:col-span-2">
          <Fact label="Refund failed">
            <span className="text-destructive">
              {dispute.refund_failed_reason ?? "Razorpay reported the refund failed."}
            </span>{" "}
            No money went back. Retrying a failed refund isn't in the console yet.
          </Fact>
        </div>
      )}
      {dispute.resolution_notes && (
        <div className="sm:col-span-2">
          <Fact label="Notes">
            <span className="whitespace-pre-line">{dispute.resolution_notes}</span>
          </Fact>
        </div>
      )}
    </dl>
  );
}

/** Every dispute but the open one, newest first. */
export function DisputeHistory({ disputes }: { disputes: DisputeRow[] }) {
  if (disputes.length === 0)
    return <p className="text-sm text-muted-foreground">No earlier disputes on this booking.</p>;
  return (
    <ol aria-label="Earlier disputes" className="space-y-3">
      {disputes.map((dispute) => (
        <li key={dispute.id} className="space-y-3 rounded-md border p-3">
          <DisputeFacts dispute={dispute} />
          <Settlement dispute={dispute} />
        </li>
      ))}
    </ol>
  );
}
