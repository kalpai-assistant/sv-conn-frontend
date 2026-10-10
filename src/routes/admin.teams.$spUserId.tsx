/**
 * Admin: one owner's team (SVC-329).
 *
 * Every Pro row the owner has ever had, removed ones included and marked,
 * with KYC, online, "takes jobs themselves" and active-job count; their
 * invite history; and the admin audit history for them and their team. Each
 * active member except the owner's own row can be force-removed or
 * reassigned.
 *
 * The header is GET /admin/providers/{id} (#203): business name, KYC, online
 * and account status. While that loads or if it fails, the owner's own
 * Pro-for-self row stands in for the name and phone.
 *
 * Auth: gated by admin role via the AppGate in __root.tsx.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowLeft, ArrowRightLeft, History, Loader2, Mail, UserMinus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KycBadge } from "@/components/admin/KycBadge";
import { ForceRemoveDialog } from "@/components/admin/ForceRemoveDialog";
import { ReassignDialog } from "@/components/admin/ReassignDialog";
import {
  useAdminOwnerActions,
  useAdminProvider,
  useAdminProviderInvites,
  useAdminProviderTeam,
  type API_AdminInviteRow,
  type API_AdminProviderRow,
  type API_AdminTeamPro,
} from "@/hooks/useApi";
import { describeAction, ownerLabel } from "@/lib/admin-team";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/admin/teams/$spUserId")({
  component: AdminOwnerPage,
});

const ago = (iso: string) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
const when = (iso: string) => `${new Date(iso).toLocaleString()} (${ago(iso)})`;

function AdminOwnerPage() {
  const { spUserId } = Route.useParams();
  const team = useAdminProviderTeam(spUserId);
  const owner = useAdminProvider(spUserId);
  const [removing, setRemoving] = useState<API_AdminTeamPro | null>(null);
  const [moving, setMoving] = useState<API_AdminTeamPro | null>(null);

  const selfRow = team.data?.find((p) => p.is_self) ?? null;
  const notFound = [owner.error, team.error].some(
    (e) => e instanceof ApiError && e.code === "SP_NOT_FOUND",
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/admin/teams">
          <ArrowLeft className="mr-2 h-4 w-4" />
          All owners
        </Link>
      </Button>

      <OwnerHeader spUserId={spUserId} owner={owner.data ?? null} selfRow={selfRow} />

      {notFound ? (
        <p className="rounded-lg border border-border bg-secondary/30 p-6 text-center text-sm">
          No service provider with this id.
        </p>
      ) : (
        <div className="space-y-8">
          <TeamSection query={team} onRemove={setRemoving} onMove={setMoving} />
          <InvitesSection spUserId={spUserId} />
          <AuditSection spUserId={spUserId} team={team.data ?? []} />
        </div>
      )}

      <ForceRemoveDialog pro={removing} onClose={() => setRemoving(null)} />
      <ReassignDialog pro={moving} onClose={() => setMoving(null)} />
    </div>
  );
}

function OwnerHeader({
  spUserId,
  owner,
  selfRow,
}: {
  spUserId: string;
  owner: API_AdminProviderRow | null;
  selfRow: API_AdminTeamPro | null;
}) {
  const title = owner ? ownerLabel(owner) : (selfRow?.display_name ?? "Service provider");
  const phone = owner?.phone ?? selfRow?.phone ?? null;
  return (
    <header className="mb-6 flex items-start gap-3">
      <Users className="mt-1 h-6 w-6 text-primary" />
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {phone && <span className="tabular-nums">{phone}</span>}
          {owner && <KycBadge status={owner.kyc_status} />}
          {owner && (
            <Badge variant={owner.is_online ? "default" : "outline"}>
              {owner.is_online ? "Online" : "Offline"}
            </Badge>
          )}
          {owner && !owner.user_is_active && <Badge variant="destructive">Deactivated</Badge>}
          <span className="font-mono text-xs">{spUserId}</span>
        </div>
      </div>
    </header>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Users; children: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </h2>
  );
}

function TeamSection({
  query,
  onRemove,
  onMove,
}: {
  query: ReturnType<typeof useAdminProviderTeam>;
  onRemove: (p: API_AdminTeamPro) => void;
  onMove: (p: API_AdminTeamPro) => void;
}) {
  return (
    <section aria-labelledby="team-heading">
      <div id="team-heading">
        <SectionTitle icon={Users}>Team</SectionTitle>
      </div>
      {query.isLoading && <Skeleton className="h-24 w-full" />}
      {query.isError && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive bg-destructive/5 p-4 text-sm text-destructive">
          <span>
            {query.error instanceof Error ? query.error.message : "Couldn't load the team."}
          </span>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {query.data && query.data.length === 0 && (
        <p className="rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
          No team members, and no profile of their own yet.
        </p>
      )}
      {query.data && query.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Member</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">KYC</th>
                <th className="px-3 py-2 font-medium">Online</th>
                <th className="px-3 py-2 font-medium">Takes jobs themselves</th>
                <th className="px-3 py-2 text-right font-medium">Active jobs</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((p) => (
                <MemberRow key={p.id} pro={p} onRemove={onRemove} onMove={onMove} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MemberRow({
  pro,
  onRemove,
  onMove,
}: {
  pro: API_AdminTeamPro;
  onRemove: (p: API_AdminTeamPro) => void;
  onMove: (p: API_AdminTeamPro) => void;
}) {
  const actionable = pro.is_active && !pro.is_self;
  return (
    <tr
      data-testid={`member-${pro.id}`}
      className={`border-t border-border ${pro.is_active ? "" : "bg-secondary/20 text-muted-foreground"}`}
    >
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={pro.is_active ? "font-medium text-foreground" : "line-through"}>
            {pro.display_name}
          </span>
          {pro.is_self && <Badge variant="secondary">Owner</Badge>}
          {!pro.is_active && <Badge variant="outline">Removed</Badge>}
          {!pro.user_is_active && <Badge variant="destructive">Deactivated</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">Joined {ago(pro.created_at)}</div>
      </td>
      <td className="px-3 py-2 tabular-nums">{pro.phone}</td>
      <td className="px-3 py-2">
        <KycBadge status={pro.kyc_status} />
      </td>
      <td className="px-3 py-2">{pro.is_online ? "Online" : "Offline"}</td>
      <td className="px-3 py-2">{pro.is_self ? (pro.accepts_direct_jobs ? "Yes" : "No") : "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums">{pro.active_job_count}</td>
      <td className="px-3 py-2">
        {actionable && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onMove(pro)}>
              <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
              Reassign
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => onRemove(pro)}
            >
              <UserMinus className="mr-1 h-3.5 w-3.5" />
              Force-remove
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

const INVITE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  accepted: "default",
  revoked: "destructive",
  expired: "outline",
};

function InvitesSection({ spUserId }: { spUserId: string }) {
  const invites = useAdminProviderInvites(spUserId);
  return (
    <section>
      <SectionTitle icon={Mail}>Invites</SectionTitle>
      {invites.isLoading && <Skeleton className="h-16 w-full" />}
      {invites.isError && <p className="text-sm text-destructive">Couldn't load invites.</p>}
      {invites.data && invites.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No invites sent.</p>
      )}
      {invites.data && invites.data.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {invites.data.map((inv) => (
            <InviteRow key={inv.id} invite={inv} />
          ))}
        </ul>
      )}
    </section>
  );
}

function InviteRow({ invite }: { invite: API_AdminInviteRow }) {
  const status = invite.status.toLowerCase();
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
      <div>
        <span className="tabular-nums text-foreground">{invite.invitee_phone}</span>
        <div className="text-xs text-muted-foreground">
          Sent {when(invite.created_at)}
          {invite.accepted_at && <> · Accepted {when(invite.accepted_at)}</>}
          {invite.revoked_at && <> · Revoked {when(invite.revoked_at)}</>}
          {status === "pending" && <> · Expires {when(invite.expires_at)}</>}
          {status === "expired" && <> · Expired {when(invite.expires_at)}</>}
        </div>
      </div>
      <Badge variant={INVITE_VARIANT[status] ?? "outline"} className="capitalize">
        {status}
      </Badge>
    </li>
  );
}

function AuditSection({ spUserId, team }: { spUserId: string; team: API_AdminTeamPro[] }) {
  const actions = useAdminOwnerActions(spUserId);
  const rows = actions.data?.pages.flat() ?? [];
  return (
    <section>
      <SectionTitle icon={History}>Admin history</SectionTitle>
      {actions.isLoading && <Skeleton className="h-16 w-full" />}
      {actions.isError && (
        <p className="text-sm text-destructive">Couldn't load the admin history.</p>
      )}
      {!actions.isLoading && !actions.isError && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No admin actions on this team yet.</p>
      )}
      {rows.length > 0 && (
        <ol className="divide-y divide-border rounded-lg border border-border">
          {rows.map((row) => {
            const { summary, notes, otherOwnerId } = describeAction(row, spUserId, team);
            return (
              <li key={row.id} className="space-y-1 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-foreground">{summary}</span>
                  <span className="text-xs text-muted-foreground">{when(row.created_at)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  By {row.admin_name ?? "an admin"}
                  {row.reason && <> · Reason: “{row.reason}”</>}
                </div>
                {notes.map((n) => (
                  <div key={n} className="text-xs text-muted-foreground">
                    {n}
                  </div>
                ))}
                {otherOwnerId && (
                  <Link
                    to="/admin/teams/$spUserId"
                    params={{ spUserId: otherOwnerId }}
                    className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Open the other team
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {actions.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          disabled={actions.isFetchingNextPage}
          onClick={() => actions.fetchNextPage()}
        >
          {actions.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
        </Button>
      )}
    </section>
  );
}
