/**
 * A team Pro turning down a job their SP gave them (SVC-322).
 *
 * `POST /pros/me/jobs/{id}/decline`, only before setting off: once en route
 * the backend answers 409, and getting out of a job you are driving to is a
 * conversation with your SP, not a button.
 *
 * The Pro's counterpart to `GiveBackJob`, and shaped like it on purpose — a red
 * link under "I'm on my way" behind a confirmation, never a button beside it.
 * Declining can't be undone: the job leaves this Pro, either to another Pro on
 * the team (`awaiting_repick`, the SP is asked to pick) or, when there is
 * nobody else, back to the broadcast for other providers (`reopened`).
 */
import { useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";

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
import { useDeclineProJob } from "@/hooks/usePro";
import { declineErrorMessage, declinedMessage } from "@/lib/pro-decline";
import { useT } from "@/i18n/LanguageProvider";

export function DeclineProJob({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const decline = useDeclineProJob();
  const navigate = useNavigate();
  const { t, lang } = useT("pro");
  // On the job screen the job is about to stop being theirs (a 403 on the next
  // poll), so leave it. On Home the card simply drops out.
  const onJobScreen = useRouterState({
    select: (state) => state.location.pathname.startsWith("/pro/jobs/"),
  });

  const confirm = () =>
    decline.mutate(bookingId, {
      onSuccess: (result) => {
        setOpen(false);
        toast.success(declinedMessage(result.outcome, t));
        if (onJobScreen) navigate({ to: "/pro/jobs" });
      },
      onError: (err) => {
        setOpen(false);
        toast.error(declineErrorMessage(err, t, lang));
      },
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full text-center text-sm font-medium text-destructive underline-offset-4 hover:underline"
      >
        {t("decline.link")}
      </button>
      <AlertDialog open={open} onOpenChange={(next) => !decline.isPending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("decline.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("decline.body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={decline.isPending}>{t("decline.keep")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirm();
              }}
              disabled={decline.isPending}
            >
              {decline.isPending ? t("decline.declining") : t("decline.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
