/**
 * The SP directory (SVC-427): every service provider, newest first, searched by
 * phone, name or business name, and filtered by account and KYC status. The
 * search, filters and page live in the URL, so a refresh or a pasted link opens
 * the same view.
 *
 * GET /admin/providers sends a bare page with no total (the consumer app's old
 * Teams screen reads that shape), so Next shows while a page comes back full.
 *
 * An index route on purpose: as sps.tsx it would be the parent of sps/$spId.tsx,
 * and an SP's URL would render this list.
 */
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import {
  BooleanFilter,
  DirectorySearch,
  KYC_OPTIONS,
  NextPager,
  OptionFilter,
} from "@/components/teams/DirectoryControls";
import { AccountPill, KycStatusPill, OnlinePill } from "@/components/teams/TeamBadges";
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
  SPS_PAGE_SIZE,
  hasSpFilters,
  mayHaveMore,
  spLabel,
  spsListPath,
  validateSpsSearch,
  type SpRow,
  type SpsSearch,
} from "@/lib/teams";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/sps/")({
  component: SpDirectoryPage,
  validateSearch: validateSpsSearch,
});

const WRAP = "[overflow-wrap:anywhere]";

function prosWord(count: number): string {
  return `${count} ${count === 1 ? "Pro" : "Pros"}`;
}

function SpDirectoryPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const page = search.page ?? 1;
  const list = useApiGet<SpRow[]>(spsListPath(search));
  const rows = list.status === "ready" ? list.data : null;

  function patch(next: Partial<SpsSearch>) {
    navigate({ search: (prev: SpsSearch) => ({ ...prev, ...next, page: undefined }) });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Service providers</h1>
        <p className="text-sm text-muted-foreground">
          Every SP, newest first. Open one to see their team, bookings, payouts and admin history.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-3">
        <DirectorySearch
          label="Search"
          placeholder="Phone, name or business name"
          value={search.q}
          onSearch={(q) => patch({ q })}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <BooleanFilter
            label="Account"
            anyLabel="Active or deactivated"
            yes="Active"
            no="Deactivated"
            value={search.active}
            onChange={(active) => patch({ active })}
          />
          <OptionFilter
            label="KYC"
            anyLabel="Any KYC status"
            options={KYC_OPTIONS}
            value={search.kyc}
            onChange={(kyc) => patch({ kyc })}
          />
          {hasSpFilters(search) && (
            <div className="flex items-end">
              <Button variant="ghost" onClick={() => navigate({ search: {} })}>
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </div>

      <section aria-label="Service provider list" className="min-w-0 space-y-3">
        {list.status === "loading" && <LoadingState rows={6} />}
        {list.status === "error" && (
          <ErrorState message="Couldn't load service providers." onRetry={list.retry} />
        )}
        {rows && rows.length === 0 && (
          <EmptyState
            message={
              page > 1
                ? "Nothing on this page."
                : hasSpFilters(search)
                  ? "No SP matches."
                  : "No service providers yet."
            }
            detail={
              page === 1 && hasSpFilters(search)
                ? "Try part of the phone number, or clear a filter."
                : undefined
            }
          />
        )}
        {rows && rows.length > 0 && <SpList rows={rows} />}
        {rows && (
          <NextPager
            label="SP pages"
            page={page}
            shown={rows.length}
            hasMore={mayHaveMore(rows, SPS_PAGE_SIZE)}
            onPage={(target) =>
              navigate({
                search: (prev: SpsSearch) => ({ ...prev, page: target > 1 ? target : undefined }),
              })
            }
          />
        )}
      </section>
    </div>
  );
}

function SpList({ rows }: { rows: SpRow[] }) {
  return (
    <div className="@container">
      <ul aria-label="Service providers" className="space-y-2 @3xl:hidden">
        {rows.map((row) => (
          <li key={row.user_id}>
            <Link
              to="/operator/sps/$spId"
              params={{ spId: row.user_id }}
              aria-label={`Open ${spLabel(row)}`}
              className="flex items-center gap-3 rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-secondary/60"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className={`font-medium ${WRAP}`}>{row.name?.trim() || row.phone}</p>
                {row.business_name && (
                  <p className={`text-muted-foreground ${WRAP}`}>{row.business_name}</p>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="tabular-nums">{row.phone}</span>
                  <KycStatusPill status={row.kyc_status} />
                  <OnlinePill online={row.is_online} />
                  {!row.user_is_active && <AccountPill active={false} />}
                </div>
                <p className="text-xs text-muted-foreground">{prosWord(row.active_pro_count)}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-lg border @3xl:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SP</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>KYC</TableHead>
              <TableHead>Online</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Team</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.user_id} className="align-top">
                <TableCell className="whitespace-normal">
                  <Link
                    to="/operator/sps/$spId"
                    params={{ spId: row.user_id }}
                    aria-label={`Open ${spLabel(row)}`}
                    className={`font-medium text-primary underline-offset-2 hover:underline ${WRAP}`}
                  >
                    {row.name?.trim() || row.phone}
                  </Link>
                  {row.business_name && (
                    <div className={`text-xs text-muted-foreground ${WRAP}`}>
                      {row.business_name}
                    </div>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{row.phone}</TableCell>
                <TableCell>
                  <KycStatusPill status={row.kyc_status} />
                </TableCell>
                <TableCell>
                  <OnlinePill online={row.is_online} />
                </TableCell>
                <TableCell>
                  <AccountPill active={row.user_is_active} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {prosWord(row.active_pro_count)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
