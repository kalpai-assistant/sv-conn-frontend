import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSetVariantPrice, type API_SpVariantPricing } from "@/hooks/useApi";
import { errorText } from "@/i18n/errors";
import { formatPaise, formatRupees } from "@/i18n/format";
import { useT } from "@/i18n/LanguageProvider";
import type { Translate } from "@/i18n";
import {
  displayRange,
  isOutsideRange,
  parsePrice,
  previewTakeHome,
  priceText,
  toPaise,
} from "@/lib/sp-pricing";

// The currency symbol in front of the price box: not a word, so not translated.
const RUPEE = "₹";

/**
 * One variant on the SP's "Services I offer" pricing (SVC-412): the platform
 * price and recommended range, the SP's own price with Save, the on/off switch,
 * and what the SP receives at that price.
 *
 * Its own component because SVC-413 adds a "Market near you" panel to it.
 *
 * - The switch needs a price: the server refuses on/off without one (422
 *   PRICE_REQUIRED). A variant priced for the first time starts on.
 * - An out-of-range price is a warning, never a refusal: it saves after a
 *   confirm, and the server's `outside_recommended_range` flags it.
 * - "You receive" is a live preview while the SP types (the same maths as the
 *   backend, from `commission_pct` and `gst_pct`); a saved price shows the
 *   server's `take_home`.
 */
export function VariantPriceRow({ variant }: { variant: API_SpVariantPricing }) {
  const { t, lang } = useT("provider");
  const save = useSetVariantPrice();
  const [draft, setDraft] = useState(() => priceText(variant.price_amount));
  const [blurred, setBlurred] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const parsed = parsePrice(draft);
  const savedPaise = variant.price_amount === null ? null : toPaise(variant.price_amount);
  const editing = parsed.ok && parsed.paise !== savedPaise;
  const canSave = editing && !save.isPending;
  const showInvalid = blurred && !parsed.ok && (draft.trim() !== "" || savedPaise !== null);
  const range = variant.recommended_range;
  const shownRange = range ? displayRange(range) : null;
  const unit = unitLabel(variant.price_unit, t);

  const commit = (paise: number) =>
    save.mutate({ variantId: variant.variant_id, priceAmount: paise / 100 });

  const onSave = () => {
    if (!parsed.ok || !canSave) return;
    if (isOutsideRange(parsed.paise, range)) setConfirmOpen(true);
    else commit(parsed.paise);
  };

  const usePlatformPrice = () => {
    setDraft(priceText(variant.platform_price));
    setBlurred(false);
    commit(toPaise(variant.platform_price));
  };

  // Typed or in flight → the client's preview; saved → the server's figures.
  let receive: { amount: string; commission: string; gst: string } | null = null;
  if (parsed.ok && (editing || save.isPending)) {
    const p = previewTakeHome(parsed.paise, variant.commission_pct, variant.gst_pct);
    receive = {
      amount: formatPaise(p.receives, lang),
      commission: formatPaise(p.commission, lang),
      gst: formatPaise(p.gst, lang),
    };
  } else if (variant.take_home) {
    receive = {
      amount: formatRupees(variant.take_home.sp_receives, lang),
      commission: formatRupees(variant.take_home.commission, lang),
      gst: formatRupees(variant.take_home.commission_gst, lang),
    };
  }

  return (
    <li className="p-4" data-testid={`variant-${variant.variant_id}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-medium text-foreground">{variant.label}</p>
        <Switch
          checked={variant.is_active === true}
          disabled={variant.price_amount === null || save.isPending}
          onCheckedChange={(on) => save.mutate({ variantId: variant.variant_id, isActive: on })}
          aria-label={t("services.pricing.offer", { label: variant.label })}
        />
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {t("services.pricing.platformPrice", {
          amount: formatRupees(variant.platform_price, lang),
        })}
        {shownRange && (
          <>
            {" · "}
            {/* One unit, so a narrow screen never splits "₹1,875 –" from "₹3,123". */}
            <span className="whitespace-nowrap">
              {t("services.pricing.recommended", {
                low: formatRupees(shownRange.low, lang),
                high: formatRupees(shownRange.high, lang),
              })}
            </span>
          </>
        )}
      </p>

      {variant.price_amount === null && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-primary">{t("services.pricing.setYourPrice")}</p>
          {/* The server refuses a price of 0, so a variant the catalogue
              prices at 0 has nothing to copy. */}
          {variant.platform_price > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={save.isPending}
              onClick={usePlatformPrice}
            >
              {t("services.pricing.usePlatformPrice", {
                amount: formatRupees(variant.platform_price, lang),
              })}
            </Button>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {t("services.pricing.yourPrice")}
        </span>
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {RUPEE}
          </span>
          <Input
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (save.isError) save.reset();
            }}
            onBlur={() => setBlurred(true)}
            aria-label={t("services.pricing.priceFor", { label: variant.label })}
            aria-invalid={showInvalid}
            className="pl-7"
          />
        </div>
        {unit && <span className="shrink-0 text-xs text-muted-foreground">{unit}</span>}
        <Button type="button" size="sm" disabled={!canSave} onClick={onSave}>
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            t("services.pricing.save")
          )}
        </Button>
      </div>

      {showInvalid && (
        <p className="mt-1 text-xs text-destructive">{t("services.pricing.invalid")}</p>
      )}

      {variant.outside_recommended_range && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          {t("services.pricing.outsideRange")}
        </p>
      )}

      {receive && (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            {t("services.pricing.youReceive", { amount: receive.amount })}
          </span>{" "}
          {t("services.pricing.breakdown", { commission: receive.commission, gst: receive.gst })}
        </p>
      )}

      {save.isError && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {errorText(save.error, t("services.pricing.saveFailed"), lang)}
        </p>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("services.pricing.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {shownRange &&
                parsed.ok &&
                t("services.pricing.confirmBody", {
                  price: formatPaise(parsed.paise, lang),
                  low: formatRupees(shownRange.low, lang),
                  high: formatRupees(shownRange.high, lang),
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("services.pricing.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (parsed.ok) commit(parsed.paise);
              }}
            >
              {t("services.pricing.confirmSave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/** The service's unit; the SP never picks one. An unknown unit has no label. */
function unitLabel(priceUnit: string, t: Translate): string | null {
  switch (priceUnit) {
    case "PER_VISIT":
      return t("services.pricing.unit.perVisit");
    case "PER_SQFT":
      return t("services.pricing.unit.perSqft");
    case "PER_HOUR":
      return t("services.pricing.unit.perHour");
    case "PER_ITEM":
      return t("services.pricing.unit.perItem");
    default:
      return null;
  }
}
