/** The formula tab (SVC-428): ranking weights, boost window and sheet TTL. */
import { createFileRoute } from "@tanstack/react-router";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { FormulaForm } from "@/components/pricing/FormulaForm";
import { CONFIG_PATH, canEditPricing, type PricingConfigRow } from "@/lib/pricing";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/pricing/formula")({
  component: FormulaTab,
});

function FormulaTab() {
  const { admin } = Route.useRouteContext();
  const config = useApiGet<PricingConfigRow[]>(CONFIG_PATH);
  const canEdit = canEditPricing(admin.role);

  return (
    <section aria-label="Pricing formula" className="min-w-0 max-w-2xl space-y-3">
      {!canEdit && (
        <p className="text-sm text-muted-foreground">
          Read only: your role can view pricing but not change it.
        </p>
      )}
      {config.status === "loading" && <LoadingState rows={6} />}
      {config.status === "error" && (
        <ErrorState message="Couldn't load the pricing formula." onRetry={config.retry} />
      )}
      {config.status === "ready" && <FormulaForm rows={config.data} canEdit={canEdit} />}
    </section>
  );
}
