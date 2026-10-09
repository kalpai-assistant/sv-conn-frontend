/**
 * Who is doing this job, and a way to change it (SVC-324, follow-up to SVC-321).
 *
 * A team SP's job screen couldn't show who was assigned, or that a team Pro had
 * declined. After a decline the booking sits at ACCEPTED with nobody on it, no
 * sweep picks it up, and the `pro_declined` push was the SP's only signal. The
 * booking now carries `professional`, so this shows it, and on ACCEPTED offers
 * the same picker as accept, in re-pick mode (`/assign` re-picks while ACCEPTED).
 *
 * Solo SPs see nothing: their own Pro-for-self is always the one on the job,
 * and saying so would be noise on every booking they have.
 */
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

import { TeamPicker } from "@/components/provider/TeamPicker";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { DismissReason } from "@/hooks/useBookingOffer";
import { useTeam, type TeamPickPro } from "@/hooks/useTeam";
import type { Booking } from "@/lib/mock-data";

const ACTIVE = new Set<Booking["status"]>(["ACCEPTED", "EN_ROUTE", "IN_PROGRESS"]);

export function AssignedPro({ booking }: { booking: Booking }) {
  const team = useTeam();
  const [picking, setPicking] = useState(false);

  const pro = booking.professional;
  // An older backend doesn't send the field: show nothing rather than guess.
  if (pro === undefined || !ACTIVE.has(booking.status)) return null;

  const hasTeam = Boolean(team.data?.some((member) => !member.is_self));
  const unassigned = pro === null;
  // A decline only happens on a team, so "nobody" always needs showing; a
  // named Pro only matters to an SP who could have sent someone else.
  if (!unassigned && !hasTeam) return null;

  const canChange = booking.status === "ACCEPTED";

  // Everyone active on the team, minus whoever is already on it. Busy isn't
  // known here (the 202's flag only comes with accept); /assign answers
  // PRO_BUSY, which the picker turns into a disabled row.
  const pros: TeamPickPro[] = (team.data ?? [])
    .filter((member) => member.id !== pro?.id)
    .map((member) => ({
      id: member.id,
      display_name: member.display_name,
      profile_photo_url: member.profile_photo_url,
      is_self: member.is_self,
      busy: false,
      // SVC-326: an SP who has switched off taking jobs sees "(You)" disabled.
      accepts_direct_jobs: member.accepts_direct_jobs,
    }));

  const handleDismiss = (reason: DismissReason) => {
    setPicking(false);
    // The booking moved on under the picker (cancelled, or no longer theirs).
    // The job screen's own poll shows the new state.
    if (reason === "taken" || reason === "unavailable") {
      toast("This job has changed. Showing the latest.");
    }
  };

  return (
    <>
      {unassigned ? (
        <div
          role="status"
          className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"
        >
          <p className="flex items-center gap-2 font-medium text-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            Nobody is on this job
          </p>
          <p className="mt-1 text-muted-foreground">
            Your team member can't take it. Pick someone else, or the customer is left waiting.
          </p>
          {canChange && (
            <Button className="mt-3 w-full" onClick={() => setPicking(true)}>
              Assign someone
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-border p-3">
          <Avatar className="h-9 w-9" aria-hidden>
            {pro.photoUrl && <AvatarImage src={pro.photoUrl} alt="" />}
            <AvatarFallback>{pro.displayName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Doing this job</p>
            <p className="truncate font-medium text-foreground">
              {pro.displayName}
              {pro.isSelf && <span className="text-muted-foreground"> (You)</span>}
            </p>
          </div>
          {canChange && (
            <Button size="sm" onClick={() => setPicking(true)}>
              Change
            </Button>
          )}
        </div>
      )}

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="max-w-md">
          {/* The picker draws its own heading; these name the dialog for
              screen readers. */}
          <DialogTitle className="sr-only">Choose who does this job</DialogTitle>
          <DialogDescription className="sr-only">
            Pick a member of your team for this job.
          </DialogDescription>
          {picking && (
            <TeamPicker
              mode="repick"
              bookingId={booking.id}
              pros={pros}
              expired={false}
              onBack={() => setPicking(false)}
              onDismiss={handleDismiss}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
