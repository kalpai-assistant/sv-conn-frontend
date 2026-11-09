/**
 * One SP (SVC-427): who they are, how they're doing, what they offer, their last
 * 30 days of bookings, their latest payouts, their team and invites, and the
 * admin history for them and their team.
 *
 * Every role reads. Admin and ops can force remove a Pro or move them to another
 * SP (the console's "team add"; there is no other admin route that adds a
 * person). There is no Deactivate button: the backend has no reactivate route,
 * so it would be one-way (Tushar's call).
 */
import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BookingStatusPill } from "@/components/bookings/BookingBadges";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { OutcomePill } from "@/components/payouts/PayoutBadges";
import { ActionHistory } from "@/components/teams/ActionHistory";
import { ForceRemoveDialog } from "@/components/teams/ForceRemoveDialog";
import { Fact, PageSection } from "@/components/teams/PageSection";
import { ReassignDialog } from "@/components/teams/ReassignDialog";
import { Roster } from "@/components/teams/Roster";
import {
  AccountPill,
  InviteStatusPill,
  KycStatusPill,
  OnlinePill,
  Pill,
} from "@/components/teams/TeamBadges";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { BOOKING_STATUSES, formatIst } from "@/lib/bookings";
import { formatPaise } from "@/lib/money";
import { historyActor, type PayoutHistoryPage } from "@/lib/payouts";
import {
  canEditTeam,
  describeSpAction,
  formatDay,
  formatServiceArea,
  formatSpRating,
  spActionsPath,
  spBookingsSearch,
  spInvitesPath,
  spPath,
  spPayoutSummaryPath,
  spTeamPath,
  type AdminAction,
  type Invite,
  type SpDetail,
  type TeamPro,
} from "@/lib/teams";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/sps/$spId")({
  component: SpPage,
});

const WRAP = "[overflow-wrap:anywhere]";
const LINK = "font-medium text-primary underline-offset-2 hover:underline";

type Notice = { kind: "success" | "error"; text: string };

function SpPage() {
  const { spId } = Route.useParams();
  // Keyed, so nothing from one SP (a typed reason, a page of history) shows under another.
  return <SpView key={spId} spId={spId} />;
}

function isMissing(error: unknown): boolean {
  // 404 SP_NOT_FOUND, or a 422 for an id that isn't a UUID at all.
  return error instanceof ApiError && (error.status === 404 || error.status === 422);
}

function SpView({ spId }: { spId: string }) {
  const { admin } = Route.useRouteContext();
  const canEdit = canEditTeam(admin.role);
  const detail = useApiGet<SpDetail>(spPath(spId));
  const team = useApiGet<TeamPro[]>(spTeamPath(spId));
  const [historyPage, setHistoryPage] = useState(1);
  const actions = useApiGet<AdminAction[]>(spActionsPath(spId, historyPage));
  const [removing, setRemoving] = useState<TeamPro | null>(null);
  const [moving, setMoving] = useState<TeamPro | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  function refreshTeam() {
    detail.refresh();
    team.refresh();
    actions.refresh();
  }

  const sp = detail.status === "ready" ? detail.data : null;
  const roster = team.status === "ready" ? team.data : [];

  if (detail.status === "error" && isMissing(detail.error)) {
    return (
      <div className="space-y-6">
        <BackLink />
        <EmptyState
          message="No service provider with this id."
          detail="They may not be an SP, or the link is wrong."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />

      {detail.status === "loading" && <LoadingState rows={2} />}
      {detail.status === "error" && (
        <ErrorState message="Couldn't load this service provider." onRetry={detail.retry} />
      )}
      {sp && <Header sp={sp} />}

      {notice && (
        <Alert
          variant={notice.kind === "error" ? "destructive" : "default"}
          role={notice.kind === "error" ? "alert" : "status"}
          className={notice.kind === "success" ? "border-success/40 bg-success/10" : ""}
        >
          <AlertDescription className={WRAP}>{notice.text}</AlertDescription>
        </Alert>
      )}

      {sp && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Overview sp={sp} />
          <Services sp={sp} />
          <BookingVolume sp={sp} />
          <PayoutsSummary spId={spId} />
        </div>
      )}

      <PageSection
        title="Team"
        aside={
          <Link to="/operator/pros" search={{ sp: spId }} className={`text-sm ${LINK}`}>
            Open in Pro directory
          </Link>
        }
      >
        <p className="text-xs text-muted-foreground">
          Every Pro row this SP has had, removed ones included. The SP&apos;s own profile comes
          first.
        </p>
        {team.status === "loading" && <LoadingState rows={3} />}
        {team.status === "error" && (
          <ErrorState message="Couldn't load the team." onRetry={team.retry} />
        )}
        {team.status === "ready" && roster.length === 0 && (
          <p className="text-sm text-muted-foreground">No Pros, and no profile of their own yet.</p>
        )}
        {roster.length > 0 && (
          <Roster pros={roster} canEdit={canEdit} onRemove={setRemoving} onMove={setMoving} />
        )}
      </PageSection>

      <Invites spId={spId} />

      <PageSection title="Admin history">
        <ActionHistory
          state={actions}
          page={historyPage}
          onPage={setHistoryPage}
          describe={(row) => describeSpAction(row, spId, roster)}
          empty="No admin actions on this SP or their team yet."
        />
      </PageSection>

      {canEdit && (
        <>
          <ForceRemoveDialog
            pro={removing}
            onClose={() => setRemoving(null)}
            onRemoved={(text) => {
              setRemoving(null);
              setNotice({ kind: "success", text });
              refreshTeam();
            }}
          />
          <ReassignDialog
            pro={moving}
            onClose={() => setMoving(null)}
            onMoved={() => {
              setNotice(null);
              refreshTeam();
            }}
          />
        </>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/operator/sps">
        <ArrowLeft aria-hidden="true" />
        All service providers
      </Link>
    </Button>
  );
}

function Header({ sp }: { sp: SpDetail }) {
  const name = sp.name?.trim() || sp.business_name?.trim() || sp.phone;
  return (
    <div className="space-y-2">
      <h1 className={`text-2xl font-semibold tracking-tight ${WRAP}`}>{name}</h1>
      {sp.business_name && sp.business_name.trim() !== name && (
        <p className={`text-sm text-muted-foreground ${WRAP}`}>{sp.business_name}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="tabular-nums">{sp.phone}</span>
        <KycStatusPill status={sp.kyc_status} />
        <AccountPill active={sp.user_is_active} />
        <OnlinePill online={sp.is_online} />
      </div>
      <p className={`font-mono text-xs text-muted-foreground ${WRAP}`}>{sp.user_id}</p>
    </div>
  );
}

function Overview({ sp }: { sp: SpDetail }) {
  return (
    <PageSection title="Overview">
      <dl className="grid gap-3 sm:grid-cols-2">
        <Fact label="Rating">{formatSpRating(sp.avg_rating)}</Fact>
        <Fact label="Completed jobs">
          <span className="tabular-nums">{sp.total_completed_jobs}</span>
        </Fact>
        <Fact label="Active Pros">
          <span className="tabular-nums">{sp.active_pro_count}</span>
        </Fact>
        <Fact label="Joined (IST)">{formatIst(sp.created_at)}</Fact>
        <div className="sm:col-span-2">
          <Fact label="Service area">
            <span className="tabular-nums">{formatServiceArea(sp.service_area)}</span>
          </Fact>
        </div>
      </dl>
    </PageSection>
  );
}

function Services({ sp }: { sp: SpDetail }) {
  return (
    <PageSection
      title="Services offered"
      aside={
        <Link to="/operator/pricing" className={`text-sm ${LINK}`}>
          Pricing
        </Link>
      }
    >
      {sp.services.length === 0 ? (
        <p className="text-sm text-muted-foreground">They don&apos;t offer any service yet.</p>
      ) : (
        <ul aria-label="Services" className="flex flex-wrap gap-2">
          {sp.services.map((service) => (
            <li
              key={service.id}
              className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm"
            >
              <span className={service.is_active ? "" : "text-muted-foreground line-through"}>
                {service.name}
              </span>
              {!service.is_active && <Pill tone="quiet">Retired</Pill>}
            </li>
          ))}
        </ul>
      )}
    </PageSection>
  );
}

function BookingVolume({ sp }: { sp: SpDetail }) {
  const volume = sp.bookings_30d;
  return (
    <PageSection title="Bookings in the last 30 days">
      <p className="text-sm">
        <Link
          to="/operator/bookings"
          search={spBookingsSearch(sp.user_id, volume)}
          className={LINK}
        >
          {volume.total} {volume.total === 1 ? "booking" : "bookings"}
        </Link>{" "}
        <span className="text-muted-foreground">created since {formatDay(volume.since)} (IST)</span>
      </p>
      <ul aria-label="Bookings by status" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {BOOKING_STATUSES.map((status) => {
          const count = volume.by_status[status] ?? 0;
          return (
            <li key={status}>
              <Link
                to="/operator/bookings"
                search={spBookingsSearch(sp.user_id, volume, status)}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-secondary/60"
              >
                <BookingStatusPill status={status} />
                <span className="font-medium tabular-nums">{count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </PageSection>
  );
}

function PayoutsSummary({ spId }: { spId: string }) {
  const history = useApiGet<PayoutHistoryPage>(spPayoutSummaryPath(spId));
  const data = history.status === "ready" ? history.data : null;
  return (
    <PageSection
      title="Payouts"
      aside={
        <Link to="/operator/payouts" search={{ sp: spId }} className={`text-sm ${LINK}`}>
          Open in Payouts
        </Link>
      }
    >
      {history.status === "loading" && <LoadingState rows={2} />}
      {history.status === "error" && (
        <ErrorState message="Couldn't load the payout history." onRetry={history.retry} />
      )}
      {data && data.entries.length === 0 && (
        <p className="text-sm text-muted-foreground">No payouts yet.</p>
      )}
      {data && data.entries.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            The latest {data.entries.length} of {data.total}{" "}
            {data.total === 1 ? "attempt" : "attempts"}. Payouts has the bookings behind them.
          </p>
          <ol aria-label="Latest payouts" className="divide-y rounded-md border">
            {data.entries.map((entry) => (
              <li
                key={entry.audit_id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <OutcomePill outcome={entry.outcome} />
                  <span className="font-medium tabular-nums">
                    {formatPaise(entry.amount_paise)}
                  </span>
                </span>
                <span className={`text-xs text-muted-foreground ${WRAP}`}>
                  {formatIst(entry.created_at)} · {historyActor(entry)}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </PageSection>
  );
}

function Invites({ spId }: { spId: string }) {
  const invites = useApiGet<Invite[]>(spInvitesPath(spId));
  const rows = invites.status === "ready" ? invites.data : null;
  return (
    <PageSection title="Invites">
      {invites.status === "loading" && <LoadingState rows={2} />}
      {invites.status === "error" && (
        <ErrorState message="Couldn't load the invites." onRetry={invites.retry} />
      )}
      {rows && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No invites sent.</p>
      )}
      {rows && rows.length > 0 && (
        <ul aria-label="Invites" className="divide-y rounded-md border">
          {rows.map((invite) => {
            const status = invite.status.toLowerCase();
            return (
              <li
                key={invite.id}
                className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="tabular-nums">{invite.invitee_phone}</span>
                  <p className={`text-xs text-muted-foreground ${WRAP}`}>
                    Sent {formatIst(invite.created_at)}
                    {invite.accepted_at && <> · Accepted {formatIst(invite.accepted_at)}</>}
                    {invite.revoked_at && <> · Revoked {formatIst(invite.revoked_at)}</>}
                    {status === "pending" && <> · Expires {formatIst(invite.expires_at)}</>}
                    {status === "expired" && <> · Expired {formatIst(invite.expires_at)}</>}
                  </p>
                </div>
                <InviteStatusPill status={invite.status} />
              </li>
            );
          })}
        </ul>
      )}
    </PageSection>
  );
}
