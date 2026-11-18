import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingRegion } from "@/components/skeletons/LoadingRegion";
import { useMarketInsights, type API_SpVariantPricing } from "@/hooks/useApi";
import { formatRupees } from "@/i18n/format";
import { useT } from "@/i18n/LanguageProvider";
import type { Translate } from "@/i18n";
import { barPosition, missingStanding } from "@/lib/market-insights";

/**
 * "Market near you" under one variant's price (SVC-413): how many service
 * providers in the SP's area price this variant, their lowest / median /
 * highest, and which third of them the SP's own price is in.
 *
 * - Fetched only while open (Radix unmounts the closed content).
 * - A save or on/off of this row resets the query (useSetVariantPrice), and
 *   `saving` shows the Skeleton meanwhile, so the old "you" is never painted.
 * - Aggregates only and never the percentile number; the server sends nothing
 *   below 3 service providers. Competitors' prices are cached for up to an
 *   hour server-side, which the footnote says.
 */
export function MarketPanel({
  variant,
  saving,
}: {
  variant: API_SpVariantPricing;
  saving: boolean;
}) {
  const { t } = useT("provider");
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="-mx-4 -mb-4 mt-3">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center justify-between border-t border-border px-4 py-2.5 text-xs font-semibold text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          {t("services.pricing.market.toggle")}
          <ChevronDown
            className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <MarketBody variant={variant} saving={saving} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function MarketBody({ variant, saving }: { variant: API_SpVariantPricing; saving: boolean }) {
  const { t, lang } = useT("provider");
  const market = useMarketInsights(variant.variant_id, true);

  if (!saving && market.isError && !market.data) {
    return <MarketError onRetry={() => market.refetch()} />;
  }
  if (saving || !market.data) {
    return (
      <LoadingRegion>
        <div className="space-y-2 px-4 pb-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-full" />
        </div>
      </LoadingRegion>
    );
  }
  const data = market.data;
  const stats = data.area_stats;
  if (data.insufficient_competition || !stats) {
    return (
      <p className="px-4 pb-4 text-xs text-muted-foreground">
        {t("services.pricing.market.insufficient")}
      </p>
    );
  }

  const missing = missingStanding(variant);
  const median = barPosition(stats.median_price, stats.min_price, stats.max_price);
  const you =
    data.my_price === null ? null : barPosition(data.my_price, stats.min_price, stats.max_price);

  return (
    <div className="space-y-2 px-4 pb-4">
      <p className="text-xs font-medium text-foreground">
        {t("services.pricing.market.count", { count: stats.sp_count })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("services.pricing.market.figures", {
          min: formatRupees(stats.min_price, lang),
          median: formatRupees(stats.median_price, lang),
          max: formatRupees(stats.max_price, lang),
        })}
      </p>

      <MarketBar median={median} you={you} t={t} />

      {stats.my_bucket ? (
        <p className="text-xs font-semibold text-foreground">{bucketText(stats.my_bucket, t)}</p>
      ) : (
        missing && (
          <p className="text-xs font-medium text-primary">
            {missing === "unset"
              ? t("services.pricing.market.setPrice")
              : t("services.pricing.market.switchOn")}
          </p>
        )
      )}

      <p className="text-[11px] text-muted-foreground">{t("services.pricing.market.footnote")}</p>
    </div>
  );
}

function MarketError({ onRetry }: { onRetry: () => void }) {
  const { t } = useT("provider");
  return (
    <div className="flex items-center justify-between gap-3 px-4 pb-4">
      <p className="text-xs text-destructive">{t("services.pricing.market.loadFailed")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-foreground"
      >
        {t("services.tryAgain")}
      </button>
    </div>
  );
}

/**
 * The lowest-to-highest bar: the median as a tall tick, the SP as a dot above
 * it. The tick sticks out above and below the dot, so both stay visible when
 * they coincide. aria-hidden: the text figures above say the same.
 */
function MarketBar({ median, you, t }: { median: number; you: number | null; t: Translate }) {
  return (
    <div aria-hidden className="pt-1" data-testid="market-bar">
      {/* The inset keeps a marker at 0% or 100% inside the row. */}
      <div className="px-2">
        <div className="relative h-5">
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-muted" />
          <div
            className="absolute top-0 h-5 w-0.5 -translate-x-1/2 rounded-full bg-foreground/60"
            style={{ left: `${median}%` }}
            data-testid="market-median"
          />
          {you !== null && (
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background"
              style={{ left: `${you}%` }}
              data-testid="market-you"
            />
          )}
        </div>
      </div>
      <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
        {you !== null && (
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-primary" />
            {t("services.pricing.market.legendYou")}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-0.5 rounded-full bg-foreground/60" />
          {t("services.pricing.market.legendMedian")}
        </span>
      </div>
    </div>
  );
}

function bucketText(bucket: "lower" | "middle" | "upper", t: Translate): string {
  switch (bucket) {
    case "lower":
      return t("services.pricing.market.bucket.lower");
    case "middle":
      return t("services.pricing.market.bucket.middle");
    case "upper":
      return t("services.pricing.market.bucket.upper");
  }
}
