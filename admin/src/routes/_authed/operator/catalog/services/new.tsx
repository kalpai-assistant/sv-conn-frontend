/**
 * Create a service (SVC-430) in a category that holds no sub-categories. On
 * success the new service's page opens. ?category= preselects the category.
 *
 * Support can't create, so this page sends them to the tree.
 */
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { CatalogBackLink } from "@/components/catalog/CatalogBackLink";
import { ServiceForm } from "@/components/catalog/ServiceForm";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { CATALOG_PATH, canEditCatalog, findCategory, type CatalogTree } from "@/lib/catalog";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/catalog/services/new")({
  beforeLoad: ({ context }) => {
    if (!canEditCatalog(context.admin.role)) {
      throw redirect({ to: "/operator/catalog", replace: true });
    }
  },
  validateSearch: (raw: Record<string, unknown>): { category?: string } => ({
    category: typeof raw.category === "string" && raw.category ? raw.category : undefined,
  }),
  component: NewServicePage,
});

function NewServicePage() {
  const navigate = useNavigate();
  const { category } = Route.useSearch();
  const tree = useApiGet<CatalogTree>(CATALOG_PATH);
  // Only a category that can hold services is preselected.
  const categoryId =
    tree.status === "ready" && category
      ? findCategory(tree.data.categories, category)?.children.length === 0
        ? category
        : undefined
      : undefined;

  return (
    <div className="max-w-2xl space-y-6">
      <CatalogBackLink />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New service</h1>
        <p className="text-sm text-muted-foreground">
          It books at its base price until variants are added. Recorded in the audit log.
        </p>
      </div>
      {tree.status === "loading" && <LoadingState rows={4} />}
      {tree.status === "error" && (
        <ErrorState message="Couldn't load the catalog." onRetry={tree.retry} />
      )}
      {tree.status === "ready" && (
        <div className="rounded-lg border bg-card p-4">
          <ServiceForm
            mode="create"
            categories={tree.data.categories}
            categoryId={categoryId}
            onCreated={(row) =>
              navigate({
                to: "/operator/catalog/services/$serviceId",
                params: { serviceId: row.id },
              })
            }
          />
        </div>
      )}
    </div>
  );
}
