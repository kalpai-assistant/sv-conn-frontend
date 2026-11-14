/**
 * One booking's disputes (SVC-431): the booking, what's left to refund, the open
 * dispute with Pick up and Resolve, or a form to log one, and every earlier
 * dispute. All three roles write; support's refunds are capped.
 *
 * After every write, whatever came back, the page reloads its data, so a page
 * gone stale can't offer a second resolve. The queue has no cache: it reloads
 * whenever it's opened.
 */
import { useEffect, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { DisputeFacts, DisputeHistory } from "@/components/refunds/DisputeHistory";
import { LogDisputeForm } from "@/components/refunds/LogDisputeForm";
import { BookingContext, RefundSummary } from "@/components/refunds/RefundSummary";
import { ResolveForm } from "@/components/refunds/ResolveForm";
import { PageSection } from "@/components/teams/PageSection";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { humanize, shortId } from "@/lib/bookings";
import {
  canLogDispute,
  disputeDetailPath,
  disputeErrorMessage,
  isBookingNotFound,
  isValidBookingId,
  resolvedNotice,
  reviewDispute,
  type DisputeDetail,
  type DisputeRow,
} from "@/lib/disputes";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/refunds/$bookingId")({
  component: RefundPage,
});

const WRAP = "[overflow-wrap:anywhere]";

type Notice = { kind: "success" | "error"; text: string };

function RefundPage() {
  const { bookingId } = Route.useParams();
  // Keyed, so nothing typed for one booking shows under another.
  return <RefundView key={bookingId} bookingId={bookingId} />;
}

function RefundView({ bookingId }: { bookingId: string }) {
  const { admin } = Route.useRouteContext();
  const valid = isValidBookingId(bookingId);
  const detail = useApiGet<DisputeDetail>(valid ? disputeDetailPath(bookingId) : null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [picking, setPicking] = useState(false);
  const inFlight = useRef(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  const data = detail.status === "ready" ? detail.data : null;

  // On a phone the notice sits above the form that caused it, out of sight.
  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [notice]);

  if (!valid || (detail.status === "error" && isBookingNotFound(detail.error))) {
    return (
      <div className="space-y-6">
        <BackLink />
        <EmptyState message="No booking with this ID." detail="The link may be wrong." />
      </div>
    );
  }

  function failed(err: unknown) {
    setNotice({ kind: "error", text: disputeErrorMessage(err) });
    detail.refresh();
  }

  function succeeded(text: string) {
    setNotice({ kind: "success", text });
    detail.refresh();
  }

  async function pickUp(dispute: DisputeRow) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPicking(true);
    setNotice(null);
    try {
      await reviewDispute(dispute.id);
      succeeded("Picked up: the dispute is in review.");
    } catch (err) {
      failed(err);
    } finally {
      inFlight.current = false;
      setPicking(false);
    }
  }

  const open = data?.open_dispute ?? null;
  const earlier = data ? data.disputes.filter((d) => d.id !== open?.id) : [];
  const customer = data?.booking.customer.name?.trim() || "the customer";

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Disputes · booking {shortId(bookingId)}
        </h1>
        <p className={`font-mono text-xs text-muted-foreground ${WRAP}`}>{bookingId}</p>
        <Link
          to="/operator/bookings"
          search={{ booking: bookingId }}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          Open in Bookings
        </Link>
      </div>

      {detail.status === "loading" && <LoadingState rows={4} />}
      {detail.status === "error" && (
        <ErrorState message="Couldn't load this booking's disputes." onRetry={detail.retry} />
      )}

      {data && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <BookingContext booking={data.booking} />
            <RefundSummary booking={data.booking} refunds={data.refunds} role={admin.role} />
          </div>

          <div className="min-w-0 space-y-4">
            {notice && (
              <div ref={noticeRef} className="scroll-mt-20">
                <Alert
                  variant={notice.kind === "error" ? "destructive" : "default"}
                  role={notice.kind === "error" ? "alert" : "status"}
                  className={notice.kind === "success" ? "border-success/40 bg-success/10" : ""}
                >
                  <AlertDescription className={WRAP}>{notice.text}</AlertDescription>
                </Alert>
              </div>
            )}

            {open ? (
              <PageSection
                title="Open dispute"
                aside={
                  open.status === "RAISED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={picking}
                      onClick={() => pickUp(open)}
                    >
                      {picking ? "Picking up…" : "Pick up"}
                    </Button>
                  )
                }
              >
                <DisputeFacts dispute={open} />
                <div className="border-t pt-4">
                  <ResolveForm
                    key={open.id}
                    dispute={open}
                    refunds={data.refunds}
                    role={admin.role}
                    customer={customer}
                    onResolved={(row) => {
                      const next = resolvedNotice(row);
                      setNotice(next);
                      detail.refresh();
                    }}
                    onFailed={failed}
                  />
                </div>
              </PageSection>
            ) : (
              <PageSection title="Log a dispute">
                {canLogDispute(data.booking.status) ? (
                  <LogDisputeForm
                    bookingId={bookingId}
                    onLogged={() => succeeded("Dispute logged. Pick it up or resolve it below.")}
                    onFailed={failed}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    A dispute can be logged once the booking is completed or cancelled. It's{" "}
                    {humanize(data.booking.status).toLowerCase()} now.
                  </p>
                )}
              </PageSection>
            )}

            <PageSection title="Earlier disputes">
              <DisputeHistory disputes={earlier} />
            </PageSection>
          </div>
        </div>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/operator/refunds">
        <ArrowLeft aria-hidden="true" />
        All disputes
      </Link>
    </Button>
  );
}
