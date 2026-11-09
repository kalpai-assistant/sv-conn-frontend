/**
 * One Pro row (SVC-427): who they are, the SP they belong to, their rating and
 * jobs, their recent bookings and the admin actions on this row.
 *
 * A Pro row belongs to one SP. Moving a person makes a new row under the new SP
 * (or reactivates an old one). Each row's history shows the move from its own
 * side, and links to the other row: see describeProAction.
 */
import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRightLeft, UserMinus } from "lucide-react";
import { BookingStatusPill } from "@/components/bookings/BookingBadges";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { ActionHistory } from "@/components/teams/ActionHistory";
import { ForceRemoveDialog } from "@/components/teams/ForceRemoveDialog";
import { Fact, PageSection } from "@/components/teams/PageSection";
import { ReassignDialog } from "@/components/teams/ReassignDialog";
import { KycStatusPill, MembershipPills, OnlinePill, Pill } from "@/components/teams/TeamBadges";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { formatIst, itemsSummary, shortId, type BookingListPage } from "@/lib/bookings";
import {
  canEditTeam,
  describeProAction,
  formatProRating,
  isActionable,
  proActionsPath,
  proJobsPath,
  proPath,
  spLabel,
  type AdminAction,
  type ProDetail,
} from "@/lib/teams";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/pros/$proId")({
  component: ProPage,
});

const WRAP = "[overflow-wrap:anywhere]";
const LINK = "font-medium text-primary underline-offset-2 hover:underline";

type Notice = { kind: "success" | "error"; text: string };

function ProPage() {
  const { proId } = Route.useParams();
  return <ProView key={proId} proId={proId} />;
}

function ProView({ proId }: { proId: string }) {
  const { admin } = Route.useRouteContext();
  const detail = useApiGet<ProDetail>(proPath(proId));
  const jobs = useApiGet<BookingListPage>(proJobsPath(proId));
  const [historyPage, setHistoryPage] = useState(1);
  const actions = useApiGet<AdminAction[]>(proActionsPath(proId, historyPage));
  const [dialog, setDialog] = useState<"remove" | "move" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  function refreshAll() {
    detail.refresh();
    actions.refresh();
  }

  const pro = detail.status === "ready" ? detail.data : null;
  // Removed rows and an SP's own profile: the backend refuses both, so neither is offered.
  const canAct = pro !== null && canEditTeam(admin.role) && isActionable(pro);

  if (
    detail.status === "error" &&
    detail.error instanceof ApiError &&
    (detail.error.status === 404 || detail.error.status === 422)
  ) {
    return (
      <div className="space-y-6">
        <BackLink />
        <EmptyState message="No Pro with this id." detail="The link may be wrong." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />

      {detail.status === "loading" && <LoadingState rows={2} />}
      {detail.status === "error" && (
        <ErrorState message="Couldn't load this Pro." onRetry={detail.retry} />
      )}

      {pro && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <h1 className={`text-2xl font-semibold tracking-tight ${WRAP}`}>{pro.display_name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="tabular-nums">{pro.phone}</span>
              <KycStatusPill status={pro.kyc_status} />
              <OnlinePill online={pro.is_online} />
              {pro.is_active && <Pill tone="good">On the team</Pill>}
              <MembershipPills pro={pro} />
            </div>
            <p className={`font-mono text-xs text-muted-foreground ${WRAP}`}>{pro.id}</p>
          </div>
          {canAct && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setDialog("move")}>
                <ArrowRightLeft aria-hidden="true" />
                Reassign
              </Button>
              <Button
                variant="outline"
                className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDialog("remove")}
              >
                <UserMinus aria-hidden="true" />
                Force remove
              </Button>
            </div>
          )}
        </div>
      )}

      {notice && (
        <Alert
          variant={notice.kind === "error" ? "destructive" : "default"}
          role={notice.kind === "error" ? "alert" : "status"}
          className={notice.kind === "success" ? "border-success/40 bg-success/10" : ""}
        >
          <AlertDescription className={WRAP}>{notice.text}</AlertDescription>
        </Alert>
      )}

      {pro && (
        <PageSection title="Overview">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Service provider">
              <Link
                to="/operator/sps/$spId"
                params={{ spId: pro.service_provider.user_id }}
                className={LINK}
              >
                {spLabel(pro.service_provider)}
              </Link>
              <span className="block text-xs tabular-nums text-muted-foreground">
                {pro.service_provider.phone}
              </span>
            </Fact>
            <Fact label="Rating">{formatProRating(pro.rating_avg, pro.rating_count)}</Fact>
            <Fact label="Completed jobs">
              <span className="tabular-nums">{pro.completed_job_count}</span>
            </Fact>
            <Fact label="Active jobs">
              <span className="tabular-nums">{pro.active_job_count}</span>
            </Fact>
            {pro.is_self && (
              <Fact label="Takes jobs themselves">{pro.accepts_direct_jobs ? "Yes" : "No"}</Fact>
            )}
            <Fact label="Joined this team (IST)">{formatIst(pro.created_at)}</Fact>
          </dl>
        </PageSection>
      )}

      <PageSection
        title="Recent jobs"
        aside={
          <Link to="/operator/bookings" search={{ pro: proId }} className={`text-sm ${LINK}`}>
            See all in Bookings
          </Link>
        }
      >
        {jobs.status === "loading" && <LoadingState rows={3} />}
        {jobs.status === "error" && (
          <ErrorState message="Couldn't load this Pro's jobs." onRetry={jobs.retry} />
        )}
        {jobs.status === "ready" && jobs.data.bookings.length === 0 && (
          <p className="text-sm text-muted-foreground">No jobs on this Pro row yet.</p>
        )}
        {jobs.status === "ready" && jobs.data.bookings.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground">
              The newest {jobs.data.bookings.length} of {jobs.data.total}, by when they were booked.
              Times are in IST.
            </p>
            <ul aria-label="Recent jobs" className="divide-y rounded-md border">
              {jobs.data.bookings.map((booking) => (
                <li
                  key={booking.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <Link
                      to="/operator/bookings"
                      search={{ booking: booking.id }}
                      aria-label={`Booking ${shortId(booking.id)}`}
                      className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                    >
                      {shortId(booking.id)}
                    </Link>
                    <BookingStatusPill status={booking.status} />
                    <span className={WRAP}>{itemsSummary(booking.items)}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatIst(booking.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </PageSection>

      <PageSection title="Admin history">
        <ActionHistory
          state={actions}
          page={historyPage}
          onPage={setHistoryPage}
          describe={(row) => describeProAction(row, proId)}
          empty="No admin actions on this Pro row yet."
        />
      </PageSection>

      {/* On the role, not canAct: after a reassign the refetched row is removed, and
          the dialog must outlive that to show its success step. */}
      {canEditTeam(admin.role) && pro && (
        <>
          <ForceRemoveDialog
            pro={dialog === "remove" ? pro : null}
            onClose={() => setDialog(null)}
            onRemoved={(text) => {
              setDialog(null);
              setNotice({ kind: "success", text });
              refreshAll();
            }}
          />
          <ReassignDialog
            pro={dialog === "move" ? pro : null}
            onClose={() => setDialog(null)}
            onMoved={() => {
              setNotice(null);
              refreshAll();
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
      <Link to="/operator/pros">
        <ArrowLeft aria-hidden="true" />
        All Pros
      </Link>
    </Button>
  );
}
