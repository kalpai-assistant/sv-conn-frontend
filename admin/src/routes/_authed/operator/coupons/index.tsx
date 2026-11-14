/**
 * Coupons (SVC-429): every coupon, newest first, filtered by status, code and
 * personal / global. Filters and page live in the URL, so a refresh or a pasted
 * link opens the same view.
 *
 * An index route on purpose: as coupons.tsx it would be the parent of
 * coupons/$code.tsx, and a coupon's URL would render this list.
 */
import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { CouponList } from "@/components/coupons/CouponList";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Pager } from "@/components/payouts/Pager";
import { BooleanFilter, DirectorySearch, OptionFilter } from "@/components/teams/DirectoryControls";
import { Button } from "@/components/ui/button";
import {
  STATUS_OPTIONS,
  canEditCoupons,
  couponsListPath,
  hasCouponFilters,
  validateCouponsSearch,
  type CouponListPage,
  type CouponsSearch,
} from "@/lib/coupons";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/coupons/")({
  component: CouponsPage,
  validateSearch: validateCouponsSearch,
});

function CouponsPage() {
  const { admin } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const page = search.page ?? 1;
  const list = useApiGet<CouponListPage>(couponsListPath(search));
  const data = list.status === "ready" ? list.data : null;
  const canEdit = canEditCoupons(admin.role);

  function patch(next: Partial<CouponsSearch>) {
    navigate({ search: (prev: CouponsSearch) => ({ ...prev, ...next, page: undefined }) });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Coupons</h1>
          <p className="text-sm text-muted-foreground">
            Every coupon, newest first.{" "}
            {canEdit
              ? "Each create, edit, deactivate and activate is recorded in the audit log."
              : "Read only: your role can view coupons but not change them."}
          </p>
        </div>
        {canEdit && (
          <Button asChild>
            <Link to="/operator/coupons/new">
              <Plus aria-hidden="true" />
              New coupon
            </Link>
          </Button>
        )}
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-3">
        <DirectorySearch
          label="Search"
          placeholder="Any part of the code"
          value={search.q}
          onSearch={(q) => patch({ q })}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <OptionFilter
            label="Status"
            anyLabel="All statuses"
            options={STATUS_OPTIONS}
            value={search.status}
            onChange={(status) => patch({ status })}
          />
          <BooleanFilter
            label="Personal"
            anyLabel="Global and personal"
            yes="Personal only"
            no="Global only"
            value={search.personal}
            onChange={(personal) => patch({ personal })}
          />
          {hasCouponFilters(search) && (
            <div className="flex items-end">
              <Button variant="ghost" onClick={() => navigate({ search: {} })}>
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </div>

      <section aria-label="Coupon list" className="min-w-0 space-y-3">
        {list.status === "loading" && <LoadingState rows={6} />}
        {list.status === "error" && (
          <ErrorState message="Couldn't load coupons." onRetry={list.retry} />
        )}
        {data && data.items.length === 0 && (
          <EmptyState
            message={
              page > 1
                ? "Nothing on this page."
                : hasCouponFilters(search)
                  ? "No coupon matches."
                  : "No coupons yet."
            }
            detail={
              page === 1 && hasCouponFilters(search)
                ? "Try part of the code, or clear a filter."
                : undefined
            }
          />
        )}
        {data && data.items.length > 0 && <CouponList rows={data.items} />}
        {data && (
          <Pager
            label="Coupon pages"
            page={page}
            total={data.total}
            perPage={data.per_page}
            noun={["coupon", "coupons"]}
            onPage={(target) =>
              navigate({
                search: (prev: CouponsSearch) => ({
                  ...prev,
                  page: target > 1 ? target : undefined,
                }),
              })
            }
          />
        )}
      </section>
    </div>
  );
}
