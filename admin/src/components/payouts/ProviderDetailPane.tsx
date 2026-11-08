/**
 * One SP's payouts: the reconciliation, the latest failure, the actions, the
 * bookings behind the figures and the payout history. Mounted per SP (the page
 * keys it), so nothing from one SP can show under another.
 *
 * The figures come from the list's row: the backend has no single-SP read. When
 * the open SP isn't on the list as filtered, the pane says so and still shows
 * its bookings and history, but offers no actions, since it can't see what a
 * payout would send.
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import { PayoutActionDialog } from "@/components/payouts/PayoutActionDialog";
import { ProviderFlags } from "@/components/payouts/PayoutBadges";
import {
  ContributingBookings,
  PayoutHistory,
  Section,
} from "@/components/payouts/PayoutDetailLists";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import type { AdminRole } from "@/lib/auth";
import { formatPaise } from "@/lib/money";
import {
  IN_FLIGHT_WINDOW_MS,
  canPayOut,
  canRequeueFailed,
  canRequeueReversed,
  nextGuardChange,
  payOutBlock,
  payOutPath,
  payoutBookingsPath,
  payoutHistoryPath,
  providerDisplayName,
  requeuePath,
  type GuardHistory,
  type PayoutBookingsPage,
  type PayoutHistoryPage,
  type PayoutProvider,
  type PayoutQueued,
  type PayoutsSearch,
  type Requeued,
  type RequeueKind,
} from "@/lib/payouts";
import { useApiGet } from "@/lib/use-api-get";

type Notice = { kind: "success" | "error"; text: string };
type Action = "payout" | RequeueKind;

const WRAP = "[overflow-wrap:anywhere]";

/**
 * After a 202 the history is polled this often until the 60 s hold ends. The
 * worker writes its row seconds later (about 6 s against RazorpayX locally), and
 * the guard must see it before the hold lets go, or Pay out would come back on
 * history from before the attempt.
 */
const FOLLOW_UP_MS = 5_000;

function bookingsWord(count: number): string {
  return `${count} ${count === 1 ? "booking" : "bookings"}`;
}

function Figure({
  label,
  count,
  paise,
  strong = false,
}: {
  label: string;
  count?: number;
  paise: number;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 text-sm ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="text-right tabular-nums">
        {formatPaise(paise)}
        {count !== undefined && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            ({bookingsWord(count)})
          </span>
        )}
      </dd>
    </div>
  );
}

function Reconciliation({ provider }: { provider: PayoutProvider }) {
  return (
    <Section title="Reconciliation">
      <dl className="space-y-1">
        <Figure label="Earned" count={provider.earned_count} paise={provider.earned_paise} />
        <Figure label="Paid" count={provider.completed_count} paise={provider.completed_paise} />
        <Figure label="Pending" count={provider.pending_count} paise={provider.pending_paise} />
        <Figure
          label="Processing"
          count={provider.processing_count}
          paise={provider.processing_paise}
        />
        <Figure label="Failed" count={provider.failed_count} paise={provider.failed_paise} />
        <Figure label="Reversed" count={provider.reversed_count} paise={provider.reversed_paise} />
      </dl>
      <dl className="space-y-1 border-t pt-3">
        <Figure label="Sends now" paise={provider.payable_paise} strong />
      </dl>
      <p className="text-xs text-muted-foreground">
        Sends now is the SP&apos;s wallet balance. It subtracts the commission owed on cash jobs and
        counts only payments Razorpay has settled to us, so it can be lower than pending.
      </p>
    </Section>
  );
}

interface ProviderDetailPaneProps {
  providerId: string;
  /** The list's row for this SP, or null when it isn't on the list as filtered. */
  provider: PayoutProvider | null;
  /** The list's state. Until it has answered, a missing row means nothing. */
  listStatus: "loading" | "ready" | "error";
  role: AdminRole;
  search: Pick<PayoutsSearch, "bstatus" | "bpage" | "hpage">;
  onSearch: (patch: Pick<PayoutsSearch, "bstatus" | "bpage" | "hpage">) => void;
  onClose: () => void;
  /** After any action: the list's figures are out of date. */
  onChanged: () => void;
}

export function ProviderDetailPane({
  providerId,
  provider,
  listStatus,
  role,
  search,
  onSearch,
  onClose,
  onChanged,
}: ProviderDetailPaneProps) {
  const bookingsPage = search.bpage ?? 1;
  const historyPage = search.hpage ?? 1;
  const bookings = useApiGet<PayoutBookingsPage>(
    payoutBookingsPath(providerId, search.bstatus, bookingsPage),
  );
  // The guard always reads page 1, whichever page is on screen.
  const firstHistory = useApiGet<PayoutHistoryPage>(payoutHistoryPath(providerId, 1));
  const laterHistory = useApiGet<PayoutHistoryPage>(
    historyPage > 1 ? payoutHistoryPath(providerId, historyPage) : null,
  );
  const shownHistory = historyPage > 1 ? laterHistory : firstHistory;

  const [notice, setNotice] = useState<Notice | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [queuedAt, setQueuedAt] = useState<number | null>(null);
  // State updates a render late, and a double click is quicker than that.
  const inFlight = useRef(false);
  // Only here to re-render when one of the guard's 60 s windows runs out.
  const [, setTick] = useState(0);

  const guardHistory: GuardHistory =
    firstHistory.status === "ready"
      ? { status: "ready", entries: firstHistory.data.entries }
      : { status: firstHistory.status };
  const now = Date.now();
  const block = provider ? payOutBlock(provider, guardHistory, now, queuedAt) : null;
  const wakeAt = nextGuardChange(guardHistory, now, queuedAt);

  useEffect(() => {
    if (wakeAt === null) return;
    const timer = window.setTimeout(
      () => setTick((n) => n + 1),
      Math.max(0, wakeAt - Date.now()) + 50,
    );
    return () => window.clearTimeout(timer);
  }, [wakeAt]);

  const refreshFirstHistory = firstHistory.refresh;
  const refreshBookings = bookings.refresh;
  useEffect(() => {
    if (queuedAt === null) return;
    const poll = window.setInterval(refreshFirstHistory, FOLLOW_UP_MS);
    // When the hold ends, everything once more, so the figures match the outcome.
    const end = window.setTimeout(
      () => {
        window.clearInterval(poll);
        refreshFirstHistory();
        refreshBookings();
        onChanged();
      },
      Math.max(0, queuedAt + IN_FLIGHT_WINDOW_MS - Date.now()),
    );
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(end);
    };
  }, [queuedAt, refreshFirstHistory, refreshBookings, onChanged]);

  function refreshAll() {
    bookings.refresh();
    firstHistory.refresh();
    laterHistory.refresh();
    onChanged();
  }

  function openAction(next: Action) {
    setDialogError(null);
    setAction(next);
  }

  async function run(current: Action) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setDialogError(null);
    try {
      if (current === "payout") {
        const queued = await apiFetch<PayoutQueued>(payOutPath(providerId), { method: "POST" });
        setQueuedAt(Date.now());
        setNotice({
          kind: "success",
          text: `Queued ${formatPaise(queued.amount_paise)} for ${bookingsWord(queued.booking_count)}. The result shows in the payout history.`,
        });
      } else {
        const result = await apiFetch<Requeued>(requeuePath(providerId, current), {
          method: "POST",
        });
        setNotice({
          kind: "success",
          text:
            result.requeued > 0
              ? `Re-queued ${bookingsWord(result.requeued)}. They go out with the next Pay out.`
              : `Nothing to re-queue: no ${current} bookings were left.`,
        });
      }
      setAction(null);
      refreshAll();
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) {
        // Refused before anything was queued: the batch cap, say. Say so, and what's true now.
        setAction(null);
        setNotice({ kind: "error", text: error.message });
        refreshAll();
      } else if (error instanceof ApiError && error.status === 403) {
        setDialogError("Your role can't do this.");
      } else if (error instanceof ApiError && error.status < 500 && error.status !== 401) {
        setDialogError(error.message);
      } else {
        setDialogError("That didn't go through. Please try again.");
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const name = provider ? providerDisplayName(provider) : null;
  const showPayOut = canPayOut(role);
  const showRequeueFailed = Boolean(
    provider && provider.failed_count > 0 && canRequeueFailed(role),
  );
  const showRequeueReversed = Boolean(
    provider && provider.reversed_count > 0 && canRequeueReversed(role),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className={`text-lg font-semibold ${WRAP}`}>{name ?? "Service provider"}</h2>
          {provider && (
            <>
              {name !== provider.phone && (
                <p className="text-sm text-muted-foreground tabular-nums">{provider.phone}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                <ProviderFlags provider={provider} />
              </div>
            </>
          )}
          <p className={`font-mono text-xs text-muted-foreground ${WRAP}`}>{providerId}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close service provider" onClick={onClose}>
          <X />
        </Button>
      </div>

      {notice && (
        <Alert
          variant={notice.kind === "error" ? "destructive" : "default"}
          // Alert defaults to role="alert", which is too loud for a confirmation.
          role={notice.kind === "error" ? "alert" : "status"}
          className={notice.kind === "success" ? "border-success/40 bg-success/10" : ""}
        >
          <AlertDescription className={WRAP}>{notice.text}</AlertDescription>
        </Alert>
      )}

      {listStatus === "loading" && <LoadingState rows={3} />}
      {listStatus === "error" && (
        <Alert>
          <AlertDescription>
            The list didn&apos;t load, so this SP&apos;s totals and actions can&apos;t be shown.
          </AlertDescription>
        </Alert>
      )}
      {listStatus === "ready" && !provider && (
        <Alert>
          <AlertDescription>
            This SP isn&apos;t on the list as filtered, so its totals and actions aren&apos;t shown.
            Clear the status filter or change page to see them.
          </AlertDescription>
        </Alert>
      )}

      {provider && (
        <>
          {provider.latest_failure_reason && (
            <div
              role="note"
              aria-label="Latest failure"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
            >
              <p className="text-sm font-medium text-destructive">Latest failure</p>
              <p className={`mt-1 text-sm whitespace-pre-wrap text-foreground ${WRAP}`}>
                {provider.latest_failure_reason}
              </p>
            </div>
          )}

          {(showPayOut || showRequeueFailed || showRequeueReversed) && (
            <section aria-label="Actions" className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {showPayOut && (
                  <Button
                    disabled={block !== null}
                    aria-describedby={block ? `${providerId}-payout-block` : undefined}
                    onClick={() => openAction("payout")}
                  >
                    Pay out {formatPaise(provider.payable_paise)}
                  </Button>
                )}
                {showRequeueFailed && (
                  <Button variant="outline" onClick={() => openAction("failed")}>
                    Re-queue failed ({provider.failed_count})
                  </Button>
                )}
                {showRequeueReversed && (
                  <Button variant="outline" onClick={() => openAction("reversed")}>
                    Re-queue reversed ({provider.reversed_count})
                  </Button>
                )}
              </div>
              {showPayOut && block && (
                <p
                  id={`${providerId}-payout-block`}
                  className={`text-sm text-muted-foreground ${WRAP}`}
                >
                  {block}
                </p>
              )}
            </section>
          )}

          <Reconciliation provider={provider} />

          {action === "payout" && (
            <PayoutActionDialog
              title={`Pay out ${name}?`}
              description={`Sends ${formatPaise(provider.payable_paise)} through RazorpayX for ${bookingsWord(provider.pending_count)} pending.`}
              confirmLabel={`Pay out ${formatPaise(provider.payable_paise)}`}
              busyLabel="Queuing…"
              busy={busy}
              error={dialogError}
              onCancel={() => setAction(null)}
              onConfirm={() => run("payout")}
            >
              {provider.payable_paise < provider.pending_paise && (
                <p>
                  Pending is {formatPaise(provider.pending_paise)}. The payout sends less because
                  the wallet subtracts commission owed on cash jobs and counts only payments
                  Razorpay has settled to us.
                </p>
              )}
              <p className="text-muted-foreground">
                The payout runs in the background. Its result shows in the payout history.
              </p>
            </PayoutActionDialog>
          )}
          {action === "failed" && (
            <PayoutActionDialog
              title={`Re-queue ${bookingsWord(provider.failed_count)} that failed?`}
              description={`Moves ${formatPaise(provider.failed_paise)} back to pending, so the next Pay out includes it. Nothing is sent now.`}
              confirmLabel="Re-queue failed"
              busyLabel="Re-queuing…"
              busy={busy}
              error={dialogError}
              onCancel={() => setAction(null)}
              onConfirm={() => run("failed")}
            >
              {provider.latest_failure_reason && (
                <p>
                  <span className="font-medium">Last failure: </span>
                  {provider.latest_failure_reason}
                </p>
              )}
              <p>Fix the cause first, such as the bank details or UPI ID, or it will fail again.</p>
            </PayoutActionDialog>
          )}
          {action === "reversed" && (
            <PayoutActionDialog
              title={`Re-queue ${bookingsWord(provider.reversed_count)} that were reversed?`}
              description={`Moves ${formatPaise(provider.reversed_paise)} back to pending, so the next Pay out includes it. Nothing is sent now.`}
              confirmLabel="Re-queue reversed"
              busyLabel="Re-queuing…"
              destructive
              busy={busy}
              error={dialogError}
              onCancel={() => setAction(null)}
              onConfirm={() => run("reversed")}
            >
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                A reversal means the money reached the SP and was then clawed back. It can be a
                compliance signal. Confirm the SP is genuinely owed this money and the cause is
                fixed before you re-queue.
              </p>
              {provider.latest_failure_reason && (
                <p>
                  <span className="font-medium">Last failure: </span>
                  {provider.latest_failure_reason}
                </p>
              )}
            </PayoutActionDialog>
          )}
        </>
      )}

      <ContributingBookings
        state={bookings}
        status={search.bstatus}
        page={bookingsPage}
        onStatus={(bstatus) => onSearch({ bstatus, bpage: undefined })}
        onPage={(page) => onSearch({ bpage: page > 1 ? page : undefined })}
      />
      <PayoutHistory
        state={shownHistory}
        page={historyPage}
        onPage={(page) => onSearch({ hpage: page > 1 ? page : undefined })}
      />
    </div>
  );
}
