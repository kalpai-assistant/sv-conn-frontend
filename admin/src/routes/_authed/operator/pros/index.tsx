/**
 * The Pro directory (SVC-427): every Pro row across every SP, newest first, with
 * the SP each belongs to. Removed rows are included unless filtered out. The
 * search, filters and page live in the URL.
 *
 * The SP filter has no picker of its own: it arrives from an SP page's "Open in
 * Pro directory", and shows here as a chip that clears it.
 *
 * KYC is the effective status: a Pro-for-self shows its SP's.
 */
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, X } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Pager } from "@/components/payouts/Pager";
import {
  BooleanFilter,
  DirectorySearch,
  KYC_OPTIONS,
  OptionFilter,
} from "@/components/teams/DirectoryControls";
import { KycStatusPill, MembershipPills, OnlinePill } from "@/components/teams/TeamBadges";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PROS_PAGE_SIZE,
  hasProFilters,
  prosListPath,
  spLabel,
  spPath,
  validateProsSearch,
  type ProListPage,
  type ProMembership,
  type ProRow,
  type ProsSearch,
  type SpRow,
} from "@/lib/teams";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/pros/")({
  component: ProDirectoryPage,
  validateSearch: validateProsSearch,
});

const WRAP = "[overflow-wrap:anywhere]";

const MEMBERSHIP_OPTIONS: { value: ProMembership; label: string }[] = [
  { value: "active", label: "On a team" },
  { value: "removed", label: "Removed" },
];

function ProDirectoryPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const page = search.page ?? 1;
  const list = useApiGet<ProListPage>(prosListPath(search));
  const data = list.status === "ready" ? list.data : null;

  function patch(next: Partial<ProsSearch>) {
    navigate({ search: (prev: ProsSearch) => ({ ...prev, ...next, page: undefined }) });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pros</h1>
        <p className="text-sm text-muted-foreground">
          Every Pro on every SP&apos;s team, removed ones included, newest first. KYC is what the
          Pro works under: an SP&apos;s own profile shows the SP&apos;s KYC.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-3">
        <DirectorySearch
          label="Search"
          placeholder="Phone or name"
          value={search.q}
          onSearch={(q) => patch({ q })}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <OptionFilter
            label="Team membership"
            anyLabel="On a team or removed"
            options={MEMBERSHIP_OPTIONS}
            value={search.status}
            onChange={(status) => patch({ status })}
          />
          <OptionFilter
            label="KYC"
            anyLabel="Any KYC status"
            options={KYC_OPTIONS}
            value={search.kyc}
            onChange={(kyc) => patch({ kyc })}
          />
          <BooleanFilter
            label="Online"
            anyLabel="Online or offline"
            yes="Online"
            no="Offline"
            value={search.online}
            onChange={(online) => patch({ online })}
          />
        </div>
        {(search.sp || hasProFilters(search)) && (
          <div className="flex flex-wrap items-center gap-2">
            {search.sp && <SpChip spId={search.sp} onClear={() => patch({ sp: undefined })} />}
            {hasProFilters(search) && (
              <Button variant="ghost" size="sm" onClick={() => navigate({ search: {} })}>
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>

      <section aria-label="Pro list" className="min-w-0 space-y-3">
        {list.status === "loading" && <LoadingState rows={6} />}
        {list.status === "error" && (
          <ErrorState message="Couldn't load Pros." onRetry={list.retry} />
        )}
        {data && data.items.length === 0 && (
          <EmptyState
            message={
              page > 1
                ? "Nothing on this page."
                : hasProFilters(search)
                  ? "No Pro matches."
                  : "No Pros yet."
            }
            detail={
              page === 1 && hasProFilters(search)
                ? "Try part of the phone number, or clear a filter."
                : undefined
            }
          />
        )}
        {data && data.items.length > 0 && <ProList rows={data.items} />}
        {data && (
          <Pager
            label="Pro pages"
            page={page}
            total={data.total}
            perPage={PROS_PAGE_SIZE}
            noun={["Pro", "Pros"]}
            onPage={(target) =>
              navigate({
                search: (prev: ProsSearch) => ({ ...prev, page: target > 1 ? target : undefined }),
              })
            }
          />
        )}
      </section>
    </div>
  );
}

/** The SP filter, named: the URL holds only the id. */
function SpChip({ spId, onClear }: { spId: string; onClear: () => void }) {
  const sp = useApiGet<SpRow>(spPath(spId));
  const name = sp.status === "ready" ? spLabel(sp.data) : sp.status === "error" ? spId : "…";
  return (
    <span
      role="group"
      aria-label="SP filter"
      className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted py-0.5 pr-1 pl-3 text-sm"
    >
      <span className={`min-w-0 ${WRAP}`}>SP: {name}</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 rounded-full"
        aria-label="Clear the SP filter"
        onClick={onClear}
      >
        <X aria-hidden="true" />
      </Button>
    </span>
  );
}

function SpLink({ row }: { row: ProRow }) {
  return (
    <Link
      to="/operator/sps/$spId"
      params={{ spId: row.service_provider.user_id }}
      className={`text-primary underline-offset-2 hover:underline ${WRAP}`}
    >
      {spLabel(row.service_provider)}
    </Link>
  );
}

function ProList({ rows }: { rows: ProRow[] }) {
  return (
    <div className="@container">
      <ul aria-label="Pros" className="space-y-2 @3xl:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className={`space-y-2 rounded-lg border p-3 text-sm ${
              row.is_active ? "bg-card" : "bg-muted/40 text-muted-foreground"
            }`}
          >
            <Link
              to="/operator/pros/$proId"
              params={{ proId: row.id }}
              aria-label={`Open ${row.display_name}`}
              className="flex items-center gap-3"
            >
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className={`font-medium ${WRAP}`}>{row.display_name}</span>
                  <MembershipPills pro={row} />
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="tabular-nums">{row.phone}</span>
                  <KycStatusPill status={row.kyc_status} />
                  <OnlinePill online={row.is_online} />
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
            <p className="text-xs text-muted-foreground">
              SP: <SpLink row={row} />
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-lg border @3xl:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pro</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>SP</TableHead>
              <TableHead>KYC</TableHead>
              <TableHead>Online</TableHead>
              <TableHead className="text-right">Active jobs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                className={`align-top ${row.is_active ? "" : "bg-muted/40 text-muted-foreground"}`}
              >
                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      to="/operator/pros/$proId"
                      params={{ proId: row.id }}
                      aria-label={`Open ${row.display_name}`}
                      className={`font-medium text-primary underline-offset-2 hover:underline ${WRAP}`}
                    >
                      {row.display_name}
                    </Link>
                    <MembershipPills pro={row} />
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">{row.phone}</TableCell>
                <TableCell className="whitespace-normal">
                  <SpLink row={row} />
                </TableCell>
                <TableCell>
                  <KycStatusPill status={row.kyc_status} />
                </TableCell>
                <TableCell>
                  <OnlinePill online={row.is_online} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.active_job_count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
