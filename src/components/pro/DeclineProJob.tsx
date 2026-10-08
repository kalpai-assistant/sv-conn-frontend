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

export function DeclineProJob({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const decline = useDeclineProJob();
  const navigate = useNavigate();
  // On the job screen the job is about to stop being theirs (a 403 on the next
  // poll), so leave it. On Home the card simply drops out.
  const onJobScreen = useRouterState({
    select: (state) => state.location.pathname.startsWith("/pro/jobs/"),
  });

  const confirm = () =>
    decline.mutate(bookingId, {
      onSuccess: (result) => {
        setOpen(false);
        toast.success(declinedMessage(result.outcome));
        if (onJobScreen) navigate({ to: "/pro/jobs" });
      },
      onError: (err) => {
        setOpen(false);
        toast.error(declineErrorMessage(err));
      },
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full text-center text-sm font-medium text-destructive underline-offset-4 hover:underline"
      >
        Can’t do this job?
      </button>
      <AlertDialog open={open} onOpenChange={(next) => !decline.isPending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this job?</AlertDialogTitle>
            <AlertDialogDescription>
              Your team will be asked to give it to someone else. You can’t take it back once
              declined.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={decline.isPending}>Keep the job</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirm();
              }}
              disabled={decline.isPending}
            >
              {decline.isPending ? "Declining…" : "Decline"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
