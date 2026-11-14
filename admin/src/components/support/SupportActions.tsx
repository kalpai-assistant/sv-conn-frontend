/**
 * The bounded support actions on one booking (SVC-433), for all three roles:
 * mark the customer contacted, retry dispatch (REQUESTED only), reassign the Pro
 * (ACCEPTED only), and the way to refunds. Refunds have their own screen
 * (SVC-431), which enforces support's cap; this only links there.
 *
 * Retry is one click with no confirm: by the time support presses it the
 * decision is made (the ticket's default). Every POST is guarded by a ref, since
 * a double click is quicker than a re-render.
 */
import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { Pill } from "@/components/teams/TeamBadges";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api";
import { bookingPath, type Booking } from "@/lib/bookings";
import {
  NOTE_MAX,
  noteErrorText,
  reassignErrorText,
  refusalLabel,
  retryErrorText,
  retrySuccessText,
  type EligibleProsResponse,
  type RetryDispatchResponse,
  type SupportNote,
} from "@/lib/support";
import { useApiGet } from "@/lib/use-api-get";

type Notice = { kind: "success" | "error"; text: string };

const WRAP = "[overflow-wrap:anywhere]";

function NoticeLine({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <Alert
      variant={notice.kind === "error" ? "destructive" : "default"}
      // Alert defaults to role="alert", which is too loud for a confirmation.
      role={notice.kind === "error" ? "alert" : "status"}
      className={notice.kind === "success" ? "border-success/40 bg-success/10" : ""}
    >
      <AlertDescription className={WRAP}>{notice.text}</AlertDescription>
    </Alert>
  );
}

/** A guarded POST: one at a time, with its busy flag and its result line. */
function useAction() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function run(work: () => Promise<string>, failure: (error: unknown) => string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    try {
      setNotice({ kind: "success", text: await work() });
    } catch (error) {
      setNotice({ kind: "error", text: failure(error) });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return { busy, notice, run };
}

function ContactedAction({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const [detail, setDetail] = useState("");
  const action = useAction();
  const inputId = `contacted-${bookingId}`;

  return (
    <form
      className="space-y-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const body = detail.trim();
        void action.run(
          async () => {
            await apiFetch<SupportNote>(`${bookingPath(bookingId)}/contacted`, {
              method: "POST",
              body: JSON.stringify(body ? { body } : {}),
            });
            setDetail("");
            onDone();
            return "Marked as contacted.";
          },
          (error) => noteErrorText(error, "contacted"),
        );
      }}
    >
      <Label htmlFor={inputId}>Contacted the customer</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={inputId}
          value={detail}
          maxLength={NOTE_MAX}
          onChange={(event) => setDetail(event.target.value)}
          placeholder="What was said (optional)"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="outline" disabled={action.busy} className="shrink-0">
          {action.busy ? "Saving…" : "Mark contacted"}
        </Button>
      </div>
      <NoticeLine notice={action.notice} />
    </form>
  );
}

function RetryDispatchAction({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const action = useAction();
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Waiting for a provider. Retry sends the offer again with a fresh window; providers who
        declined aren&apos;t asked again, and the customer isn&apos;t notified.
      </p>
      <Button
        className="w-full sm:w-auto"
        disabled={action.busy}
        onClick={() =>
          void action.run(async () => {
            const result = await apiFetch<RetryDispatchResponse>(
              `${bookingPath(bookingId)}/retry-dispatch`,
              { method: "POST" },
            );
            onDone();
            return retrySuccessText(result);
          }, retryErrorText)
        }
      >
        {action.busy ? "Retrying…" : "Retry dispatch"}
      </Button>
      <NoticeLine notice={action.notice} />
    </div>
  );
}

function ReassignProAction({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const eligible = useApiGet<EligibleProsResponse>(`${bookingPath(bookingId)}/eligible-pros`);
  const [picked, setPicked] = useState<string | null>(null);
  const action = useAction();
  const groupName = `reassign-${bookingId}`;

  if (eligible.status === "loading") return <LoadingState rows={2} />;
  if (eligible.status === "error") {
    const refused =
      eligible.error instanceof ApiError && eligible.error.code === "BOOKING_NOT_REASSIGNABLE";
    return refused ? (
      <p className="text-sm text-muted-foreground">Only an accepted booking can change Pro.</p>
    ) : (
      <ErrorState message="Couldn't load this team's Pros." onRetry={eligible.retry} />
    );
  }

  const pros = eligible.data.pros;
  const choice = pros.find((pro) => pro.professional_id === picked);
  const canSubmit = Boolean(choice && choice.eligible && !choice.is_current);

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!choice || !canSubmit) return;
        void action.run(
          async () => {
            await apiFetch<Booking>(`${bookingPath(bookingId)}/reassign-pro`, {
              method: "POST",
              body: JSON.stringify({ professional_id: choice.professional_id }),
            });
            setPicked(null);
            eligible.refresh();
            onDone();
            return `Reassigned to ${choice.display_name}.`;
          },
          (error) => {
            eligible.refresh();
            return reassignErrorText(error);
          },
        );
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Reassign Pro (same service provider)</legend>
        {pros.length === 0 ? (
          <p className="text-sm text-muted-foreground">This service provider has no active Pros.</p>
        ) : (
          <ul className="space-y-1">
            {pros.map((pro) => {
              const id = `${groupName}-${pro.professional_id}`;
              const disabled = !pro.eligible || pro.is_current;
              return (
                <li key={pro.professional_id}>
                  <label
                    htmlFor={id}
                    className={`flex items-start gap-3 rounded-md border px-3 py-2 text-sm ${
                      disabled ? "text-muted-foreground" : "cursor-pointer hover:bg-muted/50"
                    } ${picked === pro.professional_id ? "border-primary" : ""}`}
                  >
                    <input
                      type="radio"
                      id={id}
                      name={groupName}
                      value={pro.professional_id}
                      checked={picked === pro.professional_id}
                      disabled={disabled}
                      onChange={() => setPicked(pro.professional_id)}
                      className="mt-1 accent-primary"
                    />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className={`block font-medium ${WRAP}`}>{pro.display_name}</span>
                      <span className="block text-xs tabular-nums text-muted-foreground">
                        {pro.phone}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {pro.is_current && <Pill tone="moving">On this booking</Pill>}
                        {pro.is_self && <Pill tone="neutral">SP&apos;s own profile</Pill>}
                        {!pro.is_current && !pro.eligible && (
                          <Pill tone="quiet">{refusalLabel(pro.refusal_code)}</Pill>
                        )}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
      <Button
        type="submit"
        variant="outline"
        disabled={!canSubmit || action.busy}
        className="w-full sm:w-auto"
      >
        {action.busy ? "Reassigning…" : "Reassign"}
      </Button>
      <NoticeLine notice={action.notice} />
    </form>
  );
}

interface SupportActionsProps {
  bookingId: string;
  /** Null until the pane has loaded the booking: the status-bound actions wait for it. */
  status: string | null;
  /** The booking and its timeline changed. */
  onBookingChanged: () => void;
  /** A note (contacted) was added. */
  onNotesChanged: () => void;
}

export function SupportActions({
  bookingId,
  status,
  onBookingChanged,
  onNotesChanged,
}: SupportActionsProps) {
  return (
    <section aria-label="Support actions" className="space-y-4 rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">Support actions</h3>
      <ContactedAction bookingId={bookingId} onDone={onNotesChanged} />
      {status === "requested" && (
        <div className="border-t pt-4">
          <RetryDispatchAction bookingId={bookingId} onDone={onBookingChanged} />
        </div>
      )}
      {status === "accepted" && (
        <div className="border-t pt-4">
          {/* Keyed by status: a reassign that lands mid-way doesn't keep a stale list. */}
          <ReassignProAction key={status} bookingId={bookingId} onDone={onBookingChanged} />
        </div>
      )}
      <div className="border-t pt-4">
        <Link
          to="/operator/refunds/$bookingId"
          params={{ bookingId }}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          Disputes &amp; refunds
        </Link>
        <p className="text-xs text-muted-foreground">
          Refunds are issued there. Support can refund up to the support limit.
        </p>
      </div>
    </section>
  );
}
