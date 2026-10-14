/**
 * Admin teams: find an owner (SVC-329).
 *
 * Searches owners (users with a provider profile) by phone, name or business
 * name; an empty box lists every owner, newest first. A row opens that
 * owner's team. The backend returns bare pages with no total, so "Load more"
 * shows until a page comes back short.
 *
 * Index route on purpose: as `admin.teams.tsx` it would be the parent of
 * `admin.teams.$spUserId.tsx`, and an owner's URL would render this list.
 *
 * Auth: gated by admin role via the AppGate in __root.tsx.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, Loader2, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { KycBadge } from "@/components/admin/KycBadge";
import { useAdminProviderSearch, type API_AdminProviderRow } from "@/hooks/useApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export const Route = createFileRoute("/admin/teams/")({
  component: AdminTeamsPage,
});

function AdminTeamsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const search = useAdminProviderSearch(useDebouncedValue(q));
  const rows = search.data?.pages.flat() ?? [];
  const tooShort = q.trim().length === 1;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6 flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Teams</h1>
          <p className="text-sm text-muted-foreground">
            Find a service provider to see their team, invites and admin history.
          </p>
        </div>
      </header>

      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label="Search owners"
          placeholder="Phone, name or business name"
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {tooShort && (
          <p className="mt-1 text-xs text-muted-foreground">Type at least 2 characters.</p>
        )}
      </div>

      {search.isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {search.isError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">
            {search.error instanceof Error ? search.error.message : "Couldn't load owners."}
          </p>
          <Button variant="outline" size="sm" onClick={() => search.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!search.isLoading && !search.isError && rows.length === 0 && (
        <div className="rounded-lg border border-border bg-secondary/30 p-8 text-center">
          <p className="text-sm font-medium text-foreground">No owners match.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try part of the phone number, or the business name.
          </p>
        </div>
      )}

      {/* Phones get cards (SVC-355): at 340px Online and the team size were
          off-screen behind a sideways swipe. */}
      {rows.length > 0 && (
        <ul aria-label="Owners" className="space-y-2 sm:hidden">
          {rows.map((row) => (
            <li key={row.user_id}>
              <OwnerCard
                row={row}
                onOpen={() =>
                  navigate({ to: "/admin/teams/$spUserId", params: { spUserId: row.user_id } })
                }
              />
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">KYC</th>
                <th className="px-3 py-2 font-medium">Online</th>
                <th className="px-3 py-2 text-right font-medium">Team</th>
                <th className="px-3 py-2" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <OwnerRow
                  key={row.user_id}
                  row={row}
                  onOpen={() =>
                    navigate({ to: "/admin/teams/$spUserId", params: { spUserId: row.user_id } })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>Showing {rows.length}</span>
        {search.hasNextPage && (
          <Button
            variant="outline"
            size="sm"
            disabled={search.isFetchingNextPage}
            onClick={() => search.fetchNextPage()}
          >
            {search.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** What one owner shows, shared by the table row and the phone card (SVC-355). */
const ownerRowData = (row: API_AdminProviderRow) => ({
  name: row.name ?? "(no name)",
  online: row.is_online ? "Online" : "Offline",
  members: `${row.active_pro_count} ${row.active_pro_count === 1 ? "member" : "members"}`,
});

function OwnerRow({ row, onOpen }: { row: API_AdminProviderRow; onOpen: () => void }) {
  const { name, online, members } = ownerRowData(row);
  return (
    <tr
      className="cursor-pointer border-t border-border transition-colors hover:bg-secondary/40"
      onClick={onOpen}
    >
      <td className="px-3 py-2">
        <div className="font-medium text-foreground">{name}</div>
        {row.business_name && (
          <div className="text-xs text-muted-foreground">{row.business_name}</div>
        )}
        {!row.user_is_active && (
          <Badge variant="destructive" className="mt-1">
            Deactivated
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums">{row.phone}</td>
      <td className="px-3 py-2">
        <KycBadge status={row.kyc_status} />
      </td>
      <td className="px-3 py-2">{online}</td>
      <td className="px-3 py-2 text-right tabular-nums">{members}</td>
      <td className="px-3 py-2 text-right">
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </td>
    </tr>
  );
}

/** One owner under `sm`: every table column; the whole card opens the team. */
function OwnerCard({ row, onOpen }: { row: API_AdminProviderRow; onOpen: () => void }) {
  const { name, online, members } = ownerRowData(row);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`owner-card-${row.user_id}`}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left text-sm transition-colors hover:bg-secondary/40"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div>
          <span className="font-medium text-foreground">{name}</span>
          {row.business_name && (
            <span className="text-muted-foreground"> · {row.business_name}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="tabular-nums">{row.phone}</span>
          <KycBadge status={row.kyc_status} />
          <Badge variant={row.is_online ? "default" : "outline"}>{online}</Badge>
          {!row.user_is_active && <Badge variant="destructive">Deactivated</Badge>}
        </div>
        <div className="text-xs tabular-nums text-muted-foreground">{members}</div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
