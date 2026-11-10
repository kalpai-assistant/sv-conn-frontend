/**
 * The catalog (SVC-430): every category and service, active or not, as a tree.
 * L1 → its sub-categories → their services. A name filter narrows it in the
 * browser: the whole tree comes in one call, so there is nothing to page.
 *
 * Admin and ops get "New category" and "New service"; support reads only.
 *
 * An index route on purpose: as catalog.tsx it would be the parent of the
 * category and service pages, and their URLs would render this tree.
 */
import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { CatalogTree } from "@/components/catalog/CatalogTree";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CATALOG_PATH,
  canEditCatalog,
  filterTree,
  treeCounts,
  type CatalogTree as Tree,
} from "@/lib/catalog";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/catalog/")({
  component: CatalogPage,
});

function CatalogPage() {
  const { admin } = Route.useRouteContext();
  const canEdit = canEditCatalog(admin.role);
  const tree = useApiGet<Tree>(CATALOG_PATH);
  const [query, setQuery] = useState("");
  const data = tree.status === "ready" ? tree.data : null;
  const shown = data ? filterTree(data.categories, query) : [];
  const counts = data ? treeCounts(data.categories) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Catalog</h1>
          <p className="text-sm text-muted-foreground">
            Categories and services, active or not. Prices here are base prices; formulas are on the
            pricing screen.{" "}
            {canEdit
              ? "Each create, edit, deactivate and activate is recorded in the audit log."
              : "Read only: your role can view the catalog but not change it."}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/operator/catalog/categories/new">
                <Plus aria-hidden="true" />
                New category
              </Link>
            </Button>
            <Button asChild>
              <Link to="/operator/catalog/services/new">
                <Plus aria-hidden="true" />
                New service
              </Link>
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-1.5 rounded-lg border bg-card p-3">
        <Label htmlFor="catalog-filter">Filter by name</Label>
        <Input
          id="catalog-filter"
          type="search"
          value={query}
          autoComplete="off"
          placeholder="A category or service name"
          onChange={(event) => setQuery(event.target.value)}
        />
        {counts && (
          <p className="text-xs text-muted-foreground">
            {counts.categories} categories · {counts.services} services
          </p>
        )}
      </div>

      <section aria-label="Catalog tree" className="min-w-0 space-y-3">
        {tree.status === "loading" && <LoadingState rows={6} />}
        {tree.status === "error" && (
          <ErrorState message="Couldn't load the catalog." onRetry={tree.retry} />
        )}
        {data && shown.length === 0 && (
          <EmptyState
            message={query.trim() ? "Nothing matches that name." : "No categories yet."}
            detail={query.trim() ? "Try part of the name." : undefined}
          />
        )}
        {shown.length > 0 && <CatalogTree categories={shown} />}
      </section>
    </div>
  );
}
