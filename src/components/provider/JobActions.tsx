/**
 * The one thing a provider does next, for each stage of a job (SVC-70, SVC-71,
 * SVC-72 — shared for SVC-274).
 *
 * These lived inside the job screen until Home needed them too. They are lifted
 * rather than copied: a second implementation of "mark complete" would be two
 * places to get an irreversible action wrong, and the app has already paid for
 * that kind of drift once (SVC-287, two address sheets that disagreed).
 *
 * ## Why a provider's statuses are a pipeline, not a set of states
 *
 * Each one has exactly one sensible next action:
 *
 *   ACCEPTED     → tell the customer you have set off
 *   EN_ROUTE     → enter their PIN at the door
 *   IN_PROGRESS  → mark the work finished
 *
 * Because that mapping is total, the action can sit wherever the job is shown —
 * it does not need a screen of its own to be unambiguous. That is what lets Home
 * carry it.
 *
 * ## Graduated protection
 *
 * The three are not equally risky and are deliberately not treated the same:
 *
 * - **En route** is a status and nothing else. Reversible in effect, so a plain
 *   button with no ceremony.
 * - **Giving the job back** (from ACCEPTED, see `GiveBackJob`) can't be undone:
 *   the job goes to other providers and this one is never offered it again. So
 *   it is a link (red, so it reads as a way out) behind a confirmation, never
 *   a button beside "I'm on my way".
 * - **The PIN** is self-verifying: the customer's four digits *are* the
 *   confirmation, and a wrong one is a 400. No guard can improve on that.
 * - **Complete** pushes a notification to the customer, queues
 *   `process_cash_payment` on cash bookings, and flips the column the payout
 *   query gates on. A push cannot be unsent and a queued task cannot be
 *   recalled, so it is held behind an undo window — see `CompleteStep`.
 *
 * ## Who is acting
 *
 * A team Pro does the same three steps from the Pro app (SVC-322), through
 * their own endpoints (`POST /pros/me/jobs/{id}/…`) rather than the SP's
 * (`PATCH /bookings/{id}/…`). `actor` picks which; everything else — the undo
 * window, the PIN entry, the wrong-PIN copy — is shared, for the same reason
 * these were lifted out of the job screen in the first place. The Pro's way
 * out is `DeclineProJob` (their SP re-picks) instead of `GiveBackJob`.
 */
import { useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Navigation } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ApiError } from "@/lib/api";
import {
  useCancelBooking,
  useMarkEnRoute,
  useStartBooking,
  useCompleteBooking,
} from "@/hooks/useApi";
import { usePendingAction, UNDO_WINDOW_MS } from "@/hooks/usePendingAction";
import { useProComplete, useProEnRoute, useProStart } from "@/hooks/usePro";
import { DeclineProJob } from "@/components/pro/DeclineProJob";
import { englishT, type Translate } from "@/i18n";
import { useT } from "@/i18n/LanguageProvider";

/** Whose endpoints a step calls: the SP's own, or a team Pro's (SVC-322). */
export type JobActor = "provider" | "pro";

// `job.wrongPin` is the wording SVC-71 asks for, verbatim. It is the only
// message a provider should ever see for a wrong PIN — anything vaguer and they
// retype the same wrong digits instead of asking the customer again.

export function transitionMessage(err: unknown, fallback: string, t: Translate = englishT()) {
  if (err instanceof ApiError && err.status === 409) return t("job.movedOn");
  return err instanceof Error ? err.message : fallback;
}

/** ACCEPTED → EN_ROUTE. A status change and nothing else (SVC-70). */
export function EnRouteStep({
  bookingId,
  compact = false,
  actor = "provider",
}: {
  bookingId: string;
  compact?: boolean;
  actor?: JobActor;
}) {
  // Picked once from `actor`, which is fixed for a mounted step — every caller
  // passes a literal — so the hook order never changes between renders.
  const useEnRoute = actor === "pro" ? useProEnRoute : useMarkEnRoute;
  const markEnRoute = useEnRoute();
  const { t } = useT();

  return (
    <div>
      {!compact && <p className="text-sm text-muted-foreground">{t("job.enRouteHint")}</p>}
      <Button
        className={compact ? "w-full" : "mt-4 w-full"}
        disabled={markEnRoute.isPending}
        onClick={() =>
          markEnRoute.mutate(
            { bookingId },
            {
              onError: (err) => toast.error(transitionMessage(err, t("job.updateFailed"), t)),
            },
          )
        }
      >
        {markEnRoute.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Navigation className="h-4 w-4" />
        )}
        {t("job.onMyWay")}
      </Button>
      {actor === "pro" ? (
        <DeclineProJob bookingId={bookingId} />
      ) : (
        <GiveBackJob bookingId={bookingId} />
      )}
    </div>
  );
}

/**
 * The provider's way out of a job they accepted but can't do (SVC-318 gap).
 *
 * There was none: a provider who couldn't make it either didn't show up or
 * called support, while the customer kept seeing "Booking confirmed". The
 * backend has had the path since SVC-344: the provider's `PATCH /cancel` while
 * ACCEPTED *reopens* the job rather than cancelling it on the customer. It goes
 * back to other providers, the customer is told we're finding someone else, no
 * fee is charged to anyone, and this provider is never offered it again. That
 * one route covers a solo provider and a team alike (`/release` is the
 * team-only twin).
 *
 * Only offered while ACCEPTED, because that is where `EnRouteStep` renders it.
 * Once on the way the backend answers 409 `PROVIDER_EN_ROUTE`: that needs
 * support, not a button.
 */
export const GIVE_BACK_REASON = "Provider can't make it (given back from the app)";

export function GiveBackJob({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const cancel = useCancelBooking();
  const navigate = useNavigate();
  const { t } = useT();
  // On the job screen the job is about to stop being theirs (a 403 on the next
  // poll), so leave it. On Home the card simply drops out of the list.
  const onJobScreen = useRouterState({
    select: (state) => state.location.pathname.startsWith("/provider/bookings/"),
  });

  const giveBack = () =>
    cancel.mutate(
      { bookingId, reason: GIVE_BACK_REASON },
      {
        onSuccess: () => {
          setOpen(false);
          toast.success(t("job.givenBack"));
          if (onJobScreen) navigate({ to: "/provider/bookings" });
        },
        onError: (err) => {
          setOpen(false);
          toast.error(
            err instanceof ApiError && err.code === "PROVIDER_EN_ROUTE"
              ? t("job.giveBackEnRoute")
              : transitionMessage(err, t("job.giveBackFailed"), t),
          );
        },
      },
    );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full text-center text-sm font-medium text-destructive underline-offset-4 hover:underline"
      >
        {t("job.giveBackLink")}
      </button>
      <AlertDialog open={open} onOpenChange={(next) => !cancel.isPending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("job.giveBackTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("job.giveBackBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancel.isPending}>{t("job.keepJob")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                giveBack();
              }}
              disabled={cancel.isPending}
            >
              {cancel.isPending ? t("job.givingBack") : t("job.giveBack")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * EN_ROUTE → IN_PROGRESS, gated on the customer's PIN (SVC-71).
 *
 * No extra guard, deliberately: four digits the provider has to ask a person
 * for cannot be produced by a mis-tap, and a wrong one is a 400 that says so.
 * This is the safest of the three actions despite looking like the most
 * involved.
 */
export function DoorstepOtpStep({
  bookingId,
  compact = false,
  actor = "provider",
}: {
  bookingId: string;
  compact?: boolean;
  actor?: JobActor;
}) {
  const [otp, setOtp] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const useStart = actor === "pro" ? useProStart : useStartBooking;
  const startBooking = useStart();
  const { t } = useT();

  const submit = (value: string) => {
    if (startBooking.isPending) return;
    setErrorMsg("");
    startBooking.mutate(
      { bookingId, otp: value },
      {
        onError: (err) => {
          // 400 is the wrong-PIN case and the only one that means "try again".
          // Everything else is a genuine failure and keeps the server's message.
          setErrorMsg(
            err instanceof ApiError && err.status === 400
              ? t("job.wrongPin")
              : transitionMessage(err, t("job.startFailed"), t),
          );
          setOtp("");
        },
      },
    );
  };

  return (
    <div>
      <p className="text-sm font-medium text-foreground">
        {compact ? t("job.pinTitleCompact") : t("job.pinTitle")}
      </p>
      {!compact && <p className="mt-1 text-sm text-muted-foreground">{t("job.pinHint")}</p>}

      <div className={compact ? "mt-2" : "mt-4"}>
        <InputOTP
          maxLength={4}
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          value={otp}
          disabled={startBooking.isPending}
          onChange={(value) => {
            setOtp(value);
            if (errorMsg) setErrorMsg("");
            // Auto-submit on the fourth digit — there is nothing else to fill in,
            // so a separate confirm button would just be an extra tap at the door.
            if (value.length === 4) submit(value);
          }}
        >
          <InputOTPGroup>
            {[0, 1, 2, 3].map((i) => (
              <InputOTPSlot key={i} index={i} className="h-12 w-12 text-base" />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {startBooking.isPending && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("job.checking")}
        </p>
      )}

      {errorMsg && (
        <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {errorMsg}
        </p>
      )}
    </div>
  );
}

/**
 * IN_PROGRESS → COMPLETED, held behind an undo window (SVC-72, guarded SVC-274).
 *
 * This is the one action a provider cannot take back. `complete_booking` does
 * three things, and two of them leave the app entirely:
 *
 *   1. moves the status — a column, reversible in principle
 *   2. pushes "completed" to the customer — **a push cannot be unsent**
 *   3. on cash bookings queues `process_cash_payment` — **a task cannot be recalled**
 *
 * and `Booking.status == COMPLETED` is the gate the payout query reads, so it is
 * also what makes the money owed.
 *
 * It had no confirmation at all before this — one tap did all of the above. A
 * dialog would be the wrong fix: a modal is for when someone must stop and read,
 * and a provider who has just finished a job does not need to read anything.
 * They need protection from a mis-tap, and a dialog taxes everyone who meant it
 * to catch the few who did not.
 *
 * So the request is withheld for a few seconds instead. Nothing has been sent
 * while the window is open, which is what makes Undo honest — there is no push
 * to unsend and no task to recall, because neither has happened. The same shape
 * SVC-295 uses for Ignore, and for the same reason.
 */
export function CompleteStep({
  bookingId,
  compact = false,
  actor = "provider",
}: {
  bookingId: string;
  compact?: boolean;
  actor?: JobActor;
}) {
  const useComplete = actor === "pro" ? useProComplete : useCompleteBooking;
  const completeBooking = useComplete();
  const pending = usePendingAction();
  const { t } = useT();
  // Local, because the row has to *look* finished the moment it is tapped even
  // though nothing has been sent. Pretending otherwise — leaving the button live
  // for seven seconds — would invite the second tap this exists to prevent.
  const [held, setHeld] = useState(false);

  const complete = () =>
    completeBooking.mutate(
      { bookingId },
      {
        onError: (err) => {
          setHeld(false);
          toast.error(transitionMessage(err, t("job.completeFailed"), t));
        },
      },
    );

  const start = () => {
    setHeld(true);
    pending.schedule(bookingId, complete);
    // Present tense on purpose: it has not happened yet, and saying "Completed"
    // for seven seconds before it is true would be the app lying to hide its own
    // mechanism.
    toast(t("job.completingToast"), {
      duration: UNDO_WINDOW_MS,
      action: {
        label: t("job.undo"),
        onClick: () => {
          pending.cancel(bookingId);
          setHeld(false);
        },
      },
      // Swiped away, or closed early: the provider saw it and did not undo,
      // which is the same answer as letting the window run out.
      onDismiss: () => pending.flush(bookingId),
    });
  };

  if (held) {
    return (
      <div className={compact ? "" : "mt-4"}>
        <p className="flex items-center justify-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("job.completing")}
        </p>
      </div>
    );
  }

  return (
    <div>
      {!compact && (
        <>
          <p className="text-sm font-medium text-foreground">{t("job.inProgressTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("job.inProgressHint")}</p>
        </>
      )}
      <Button
        className={compact ? "w-full" : "mt-4 w-full"}
        disabled={completeBooking.isPending}
        onClick={start}
      >
        {completeBooking.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        {t("job.markComplete")}
      </Button>
    </div>
  );
}
