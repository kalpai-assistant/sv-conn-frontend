import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { UserPlus, Users } from "lucide-react";

import { BackButton } from "@/components/BackButton";
import { InviteCode, InviteCodeActions } from "@/components/provider/InviteCodeActions";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { KycStatus } from "@/hooks/useApi";
import {
  teamErrorMessage,
  useRemoveMember,
  useRevokeInvite,
  useTeam,
  useTeamInvites,
  type TeamInvite,
  type TeamMember,
} from "@/hooks/useTeam";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/provider/team/")({
  component: MyTeamPage,
});

const KYC_LABEL: Record<KycStatus, string> = {
  verified: "KYC verified",
  submitted: "KYC in review",
  pending: "KYC not done",
  rejected: "KYC rejected",
};

// SVC-321 — the SP's team: who's on it, who's been invited, and the way to
// invite more. Reached from Profile only. Almost every SP works alone and never
// invites anyone, so this stays off Home on purpose.
function MyTeamPage() {
  const team = useTeam();
  const invites = useTeamInvites();
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [revoking, setRevoking] = useState<TeamInvite | null>(null);
  const removeMember = useRemoveMember();
  const revokeInvite = useRevokeInvite();

  const others = team.data?.filter((m) => !m.is_self) ?? [];
  const self = team.data?.find((m) => m.is_self);
  const pending = invites.data?.filter((i) => i.status === "PENDING") ?? [];
  const isLoading = team.isLoading || invites.isLoading;
  const isEmpty = !isLoading && others.length === 0 && pending.length === 0;

  const confirmRemove = () => {
    if (!removing) return;
    const member = removing;
    removeMember.mutate(member.id, {
      onSuccess: () => toast.success(`${member.display_name} removed from your team`),
      onError: (error) => toast.error(teamErrorMessage(error)),
      onSettled: () => setRemoving(null),
    });
  };

  const confirmRevoke = () => {
    if (!revoking) return;
    revokeInvite.mutate(revoking.id, {
      onSuccess: () => toast.success("Invite revoked"),
      onError: (error) => toast.error(teamErrorMessage(error)),
      onSettled: () => setRevoking(null),
    });
  };

  return (
    <div className="min-h-screen p-6 pb-24">
      <div className="flex items-center gap-3">
        <BackButton fallbackTo="/provider/profile" />
        <h1 className="flex-1 text-lg font-semibold text-foreground">My Team</h1>
        {!isEmpty && (
          <Button asChild size="sm">
            <Link to="/provider/team/invite">
              <UserPlus className="h-4 w-4" />
              Invite
            </Link>
          </Button>
        )}
      </div>

      {(team.isError || invites.isError) && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>Couldn't load your team.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              team.refetch();
              invites.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      )}

      {isEmpty && !team.isError && (
        <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <p className="mt-4 font-semibold text-foreground">Take on more jobs with a team</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite people who work with you. When you accept a job, you choose who does it, and
            their earnings are paid to you.
          </p>
          <Button asChild className="mt-6">
            <Link to="/provider/team/invite">
              <UserPlus className="h-4 w-4" />
              Invite your first team member
            </Link>
          </Button>
        </div>
      )}

      {!isLoading && team.data && !isEmpty && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground">Team · {team.data.length}</h2>
          <ul className="mt-2 space-y-2">
            {self && <MemberRow member={self} />}
            {others.map((member) => (
              <MemberRow key={member.id} member={member} onRemove={() => setRemoving(member)} />
            ))}
          </ul>
        </section>
      )}

      {pending.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Pending invites · {pending.length}
          </h2>
          <ul className="mt-2 space-y-2">
            {pending.map((invite) => (
              <li key={invite.id} className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{invite.invitee_phone}</p>
                    <p className="text-xs text-muted-foreground">
                      Expires {formatDate(invite.expires_at)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setRevoking(invite)}
                  >
                    Revoke
                  </Button>
                </div>
                <InviteCode token={invite.token} />
                <InviteCodeActions invite={invite} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.display_name} from your team?</AlertDialogTitle>
            <AlertDialogDescription>
              You won't be able to assign them new jobs. Their past jobs and reviews stay on record,
              and you can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMember.isPending}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmRemove();
              }}
              disabled={removeMember.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMember.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this invite?</AlertDialogTitle>
            <AlertDialogDescription>
              The code sent to {revoking?.invitee_phone} will stop working. You can send a new
              invite afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeInvite.isPending}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmRevoke();
              }}
              disabled={revokeInvite.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeInvite.isPending ? "Revoking…" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MemberRow({ member, onRemove }: { member: TeamMember; onRemove?: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border p-3">
      <div className="relative">
        <Avatar className="h-10 w-10" aria-hidden>
          {member.profile_photo_url && <AvatarImage src={member.profile_photo_url} alt="" />}
          <AvatarFallback>{member.display_name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background",
            member.is_online ? "bg-emerald-500" : "bg-muted-foreground/40",
          )}
          aria-label={member.is_online ? "Online" : "Offline"}
          role="img"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">
          {member.display_name}
          {member.is_self && <span className="text-muted-foreground"> (You)</span>}
        </p>
        <Badge
          variant={member.kyc_status === "verified" ? "secondary" : "outline"}
          className="mt-1 text-[10px] font-medium"
        >
          {KYC_LABEL[member.kyc_status]}
        </Badge>
      </div>
      {/* The SP's own row can't be removed: going off-tools is SVC-326. */}
      {onRemove && (
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Remove
        </Button>
      )}
    </li>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
