import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronRight, UserPlus, Users } from "lucide-react";

import { BackButton } from "@/components/BackButton";
import { RangeTabs } from "@/components/provider/EarningsWindow";
import { InviteCode, InviteCodeActions } from "@/components/provider/InviteCodeActions";
import { ProFigure } from "@/components/provider/ProEarningsBreakdown";
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
import { Switch } from "@/components/ui/switch";
import type { KycStatus } from "@/hooks/useApi";
import {
  teamErrorMessage,
  useRemoveMember,
  useRevokeInvite,
  useSelfPro,
  useSetSelfPro,
  useTeam,
  useTeamInvites,
  type TeamInvite,
  type TeamMember,
} from "@/hooks/useTeam";
import {
  hasTeam,
  useEarningsByPro,
  type ByProRange,
  type ProEarningsItem,
} from "@/hooks/useProEarnings";
import { formatRupees } from "@/lib/currency";
import { RANGE_META } from "@/lib/earnings-ranges";
import { cn } from "@/lib/utils";
import { firstInitial } from "@/lib/initials";

const TEAM_RANGES: ByProRange[] = ["today", "week", "month", "all"];

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
  const team = useTeam(true, { pollWhileSelfOff: true });
  const invites = useTeamInvites();
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [revoking, setRevoking] = useState<TeamInvite | null>(null);
  const removeMember = useRemoveMember();
  const revokeInvite = useRevokeInvite();
  const [confirmingOff, setConfirmingOff] = useState(false);
  const setSelfPro = useSetSelfPro();

  // SVC-323: what each member earned. One by-pro call for the whole list, never
  // one per Pro, and none on GET /me/team (the pick-a-Pro step's). `all` names
  // the past members — removed Pros with any history, so they stay listed for
  // settling up whichever window is picked — and decides whether this SP has a
  // team at all: a solo SP gets no earnings here, just the invite CTA.
  const [range, setRange] = useState<ByProRange>("week");
  const lifetime = useEarningsByPro("all");
  const windowed = useEarningsByPro(range);
  const showEarnings = hasTeam(lifetime.data);
  // A placeholder from the previous tab must not be read as this one's figures.
  const current = windowed.data?.range === range ? windowed.data : undefined;
  const earningsOf = (id: string) => current?.pros.find((p) => p.professional_id === id);
  // Undefined for a solo SP: no figure, no link. A member absent from the
  // response (joined a moment ago) reads "No jobs yet", which is true.
  const figureFor = (id: string): ReactNode =>
    !showEarnings ? undefined : current ? (
      <ProFigure item={earningsOf(id)} />
    ) : windowed.isError ? null : (
      <Skeleton className="h-8 w-14" />
    );
  const pastMembers = showEarnings
    ? (lifetime.data?.pros.filter(
        (p) => p.professional_id !== null && !p.is_active && p.completed_count > 0,
      ) ?? [])
    : [];
  const unassigned = current?.pros.find((p) => p.professional_id === null);

  const others = team.data?.filter((m) => !m.is_self) ?? [];
  const self = team.data?.find((m) => m.is_self);
  const pending = invites.data?.filter((i) => i.status === "PENDING") ?? [];
  const isLoading = team.isLoading || invites.isLoading;
  // SVC-326. A solo SP never sees the switch: switching off with nobody to send
  // would leave them getting no jobs at all, and the backend refuses it
  // (NO_TEAM_TO_DISPATCH). An SP already switched off always sees it, so they
  // can switch back on whatever the list says; for that, "empty" needs them on.
  const takesJobs = self?.accepts_direct_jobs !== false;
  const isEmpty = !isLoading && others.length === 0 && pending.length === 0 && takesJobs;
  const showSelfSwitch = Boolean(self) && (others.length > 0 || !takesJobs);
  // Whether the team can cover for them only matters while they're off.
  const selfPro = useSelfPro(!takesJobs);
  const nobodyAvailable = !takesJobs && selfPro.data?.team_has_assignable_pro === false;

  const changeTakesJobs = (on: boolean) => {
    setSelfPro.mutate(on, {
      onError: (error) => toast.error(teamErrorMessage(error)),
      onSettled: () => setConfirmingOff(false),
    });
  };

  const confirmRemove = () => {
    if (!removing) return;
    const member = removing;
    removeMember.mutate(member.id, {
      onSuccess: (result) => {
        toast.success(`${member.display_name} removed from your team`);
        // The last other Pro went, so the backend switched the SP back on.
        if (result?.self_reenabled) toast("You're taking jobs yourself again");
      },
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

      {nobodyAvailable && (
        <div
          role="status"
          className="mt-4 flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-foreground"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <span>Nobody on your team is available right now, so you won&rsquo;t get new jobs.</span>
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

      {showEarnings && (
        <>
          <RangeTabs
            ranges={TEAM_RANGES}
            value={range}
            onChange={setRange}
            label="Team earnings period"
          />
          <p className="mt-3 text-sm text-muted-foreground">
            {current ? (
              <>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatRupees(current.total_payout)}
                </span>{" "}
                &middot; {current.completed_count} {current.completed_count === 1 ? "job" : "jobs"}{" "}
                {RANGE_META[range].tab.toLowerCase()}
              </>
            ) : windowed.isError ? (
              <button className="text-primary" onClick={() => void windowed.refetch()}>
                Couldn&rsquo;t load earnings. Retry
              </button>
            ) : (
              <Skeleton className="h-5 w-40" />
            )}
          </p>
        </>
      )}

      {!isLoading && team.data && !isEmpty && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground">Team · {team.data.length}</h2>
          <ul className="mt-2 space-y-2">
            {self && (
              <MemberRow
                member={self}
                figure={figureFor(self.id)}
                periodLabel={RANGE_META[range].tab}
                selfSwitch={
                  showSelfSwitch && (
                    <TakesJobsSwitch
                      on={takesJobs}
                      disabled={setSelfPro.isPending}
                      onChange={(on) => (on ? changeTakesJobs(true) : setConfirmingOff(true))}
                    />
                  )
                }
              />
            )}
            {others.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                figure={figureFor(member.id)}
                periodLabel={RANGE_META[range].tab}
                onRemove={() => setRemoving(member)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Directly under Team, so every earnings row on the screen is one run
          that adds up to the line above it. Their figures come from the window,
          their membership from `all`. */}
      {pastMembers.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Past members · {pastMembers.length}
          </h2>
          <ul className="mt-2 space-y-2">
            {pastMembers.map((pro) => (
              <PastMemberRow
                key={pro.professional_id}
                pro={pro}
                figure={figureFor(pro.professional_id!)}
              />
            ))}
          </ul>
        </section>
      )}

      {showEarnings && unassigned && (
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-dashed border-border p-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Not assigned</p>
            <p className="text-xs text-muted-foreground">Jobs finished with no one on them</p>
          </div>
          <ProFigure item={unassigned} />
        </div>
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
            >
              {removeMember.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmingOff}
        onOpenChange={(open) => !open && !setSelfPro.isPending && setConfirmingOff(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop taking jobs yourself?</AlertDialogTitle>
            <AlertDialogDescription>
              New jobs go to your team. You can still accept and assign them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={setSelfPro.isPending}>Keep taking jobs</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                changeTakesJobs(false);
              }}
              disabled={setSelfPro.isPending}
            >
              {setSelfPro.isPending ? "Switching off…" : "Switch off"}
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

/**
 * With a `figure`, the card grows a strip underneath — the window's figure —
 * that opens the member's earnings. A strip rather than a column: on a phone,
 * name, KYC, figure and Remove on one line truncate the name and wrap the
 * badge (seen on device). It also keeps Remove away from the link: siblings,
 * never nested, so a Remove tap can't navigate.
 */
function MemberRow({
  member,
  figure,
  periodLabel,
  onRemove,
  selfSwitch,
}: {
  member: TeamMember;
  figure?: ReactNode;
  periodLabel?: string;
  onRemove?: () => void;
  /** The SP's own row only (SVC-326). */
  selfSwitch?: ReactNode;
}) {
  const body = (
    <>
      <div className="relative">
        <Avatar className="h-10 w-10" aria-hidden>
          {member.profile_photo_url && <AvatarImage src={member.profile_photo_url} alt="" />}
          <AvatarFallback>{firstInitial(member.display_name)}</AvatarFallback>
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
    </>
  );

  return (
    <li className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-3 p-3">
        {body}
        {/* The SP's own row can't be removed: its switch below takes it off jobs. */}
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="text-primary hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            Remove
          </Button>
        )}
      </div>
      {selfSwitch}
      {figure !== undefined && (
        <Link
          to="/provider/team/$professionalId/earnings"
          params={{ professionalId: member.id }}
          className="flex items-center gap-3 border-t border-border px-3 py-2.5"
        >
          <span className="flex-1 text-sm text-muted-foreground">{periodLabel}</span>
          {figure}
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      )}
    </li>
  );
}

/**
 * "I take jobs myself" (SVC-326). Never "online": that is the separate switch
 * that stops the SP getting jobs for the team too.
 */
function TakesJobsSwitch({
  on,
  disabled,
  onChange,
}: {
  on: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 border-t border-border px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">I take jobs myself</span>
        {!on && (
          <span className="block text-xs text-muted-foreground">New jobs go to your team</span>
        )}
      </span>
      <Switch checked={on} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}

/** A removed Pro with history: still openable, so the SP can settle with them. */
function PastMemberRow({ pro, figure }: { pro: ProEarningsItem; figure: ReactNode }) {
  return (
    <li className="rounded-xl border border-border p-3">
      <Link
        to="/provider/team/$professionalId/earnings"
        params={{ professionalId: pro.professional_id! }}
        className="flex items-center gap-3"
      >
        <Avatar className="h-10 w-10" aria-hidden>
          {pro.profile_photo_url && <AvatarImage src={pro.profile_photo_url} alt="" />}
          <AvatarFallback>{firstInitial(pro.display_name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{pro.display_name}</p>
          <p className="text-xs text-muted-foreground">Removed from team</p>
        </div>
        {figure}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
