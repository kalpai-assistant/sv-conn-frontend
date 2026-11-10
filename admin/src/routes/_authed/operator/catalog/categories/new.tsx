/**
 * Create a category (SVC-430): a top-level one (a home tile) or a sub-category of
 * an L1. The slug is made from the name and never changes. On success the new
 * category's page opens. ?parent= preselects the parent.
 *
 * Support can't create, so this page sends them to the tree rather than showing a
 * form every save of which would 403.
 */
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { CatalogBackLink } from "@/components/catalog/CatalogBackLink";
import { CategoryForm } from "@/components/catalog/CategoryForm";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { CATALOG_PATH, canEditCatalog, type CatalogTree } from "@/lib/catalog";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/catalog/categories/new")({
  beforeLoad: ({ context }) => {
    if (!canEditCatalog(context.admin.role)) {
      throw redirect({ to: "/operator/catalog", replace: true });
    }
  },
  validateSearch: (raw: Record<string, unknown>): { parent?: string } => ({
    parent: typeof raw.parent === "string" && raw.parent ? raw.parent : undefined,
  }),
  component: NewCategoryPage,
});

function NewCategoryPage() {
  const navigate = useNavigate();
  const { parent } = Route.useSearch();
  const tree = useApiGet<CatalogTree>(CATALOG_PATH);
  // Only a real L1 that can take sub-categories is preselected.
  const parentId =
    tree.status === "ready" &&
    tree.data.categories.some((l1) => l1.id === parent && l1.services.length === 0)
      ? parent
      : undefined;

  return (
    <div className="max-w-2xl space-y-6">
      <CatalogBackLink />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New category</h1>
        <p className="text-sm text-muted-foreground">
          Its address (slug) is made from the name and never changes. Recorded in the audit log.
        </p>
      </div>
      {tree.status === "loading" && <LoadingState rows={3} />}
      {tree.status === "error" && (
        <ErrorState message="Couldn't load the catalog." onRetry={tree.retry} />
      )}
      {tree.status === "ready" && (
        <div className="rounded-lg border bg-card p-4">
          <CategoryForm
            mode="create"
            categories={tree.data.categories}
            parentId={parentId}
            onCreated={(row) =>
              navigate({
                to: "/operator/catalog/categories/$categoryId",
                params: { categoryId: row.id },
              })
            }
          />
        </div>
      )}
    </div>
  );
}
