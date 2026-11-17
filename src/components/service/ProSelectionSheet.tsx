/**
 * SVC-416: "pick your pro". The SPs who serve the customer's address for one
 * service variant, ranked by the backend (SVC-409), with the price each one
 * charges.
 *
 * Opened from Quick Add (+) on a card, for the service's first variant, and
 * from the ServiceSheet CTA, for the picked variant. A pick writes the SP and
 * its quote onto the cart line (`cart.addQuoted`). The cart display, Edit SP,
 * and sending the quote at checkout are SVC-417's.
 *
 * ## Where the ranking is measured from
 *
 * The address the cart will book against (`useSelectedAddress`, same as the
 * cart and the home LocationBar). An older address without coordinates can't
 * be ranked from, and can't be re-pinned in place either, because edit mode
 * skips the map. So the sheet asks for another address instead of quietly
 * using GPS: the backend refuses a chosen-SP booking for an address with no
 * location, so GPS results would list SPs the booking can't use (comment
 * 14919, item 1). Only a customer with no saved address at all is ranked from
 * the device. Checkout makes them add one, and SVC-411's 409 covers a
 * mismatch.
 *
 * ## Two lists
 *
 * In-range SPs first. Then, under their own heading, the ones priced outside
 * the recommended range (SVC-482). Picking one of those takes a second tap
 * past a warning. `is_boosted` is never read: boost is a ranking tilt, and
 * labelling it would hurt trust.
 *
 * Matches ServiceSheet's hand-rolled backdrop + slide-up rather than the
 * shadcn Sheet, like the app's other sheets.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, MapPin, Star, User, X } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ErrorState } from "@/components/ErrorState";
import { SavedAddressesSheet } from "@/components/SavedAddressesSheet";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { useDragDismiss } from "@/hooks/useDragDismiss";
import { useSelectedAddress } from "@/hooks/useSelectedAddress";
import { useServiceProviders, type API_RankedProvider } from "@/hooks/useApi";
import { pushBackInterceptor } from "@/lib/back-interceptor";
import { useCart } from "@/lib/cart-context";
import { formatRupees } from "@/lib/currency";
import { requestLocation } from "@/lib/geolocation";
import { hapticImpactLight } from "@/lib/haptics";
import { initialsFrom } from "@/lib/initials";
import type { Service } from "@/lib/mock-data";
import {
  MAX_WHY_CHIPS,
  hasSpConflict,
  priceUnitLabel,
  proDisplayName,
  splitProviders,
} from "@/lib/pro-selection";

/**
 * How long to wait for a device fix before giving up. Only reached by a
 * customer with no saved address, and the sheet shows skeletons meanwhile.
 * Ten seconds matches the launch gate: a cold GPS can take that long.
 */
export const DEVICE_LOCATE_TIMEOUT_MS = 10_000;

export const OUT_OF_RANGE_HEADING = "Outside the recommended price";
export const OUT_OF_RANGE_WARNING = "This pro's price is outside our recommended range";

interface ProSelectionSheetProps {
  service: Service;
  variantId: string;
  onClose: () => void;
}

type RankingLocation =
  | { kind: "pending" }
  | { kind: "ready"; lat: number; lng: number }
  /** The selected address has no coordinates. */
  | { kind: "needs-address" }
  /** No saved address, and the device couldn't say where it is. */
  | { kind: "device-failed" };

/**
 * Where to rank from. See the file header for why each case is what it is.
 */
function useRankingLocation(): RankingLocation {
  const { selected, addresses, isLoading } = useSelectedAddress();
  // Undefined after loading means the list failed; ranking from the device
  // still works, so that is treated like having no address.
  const noAddresses = !isLoading && (addresses?.length ?? 0) === 0;

  const [device, setDevice] = useState<
    | { status: "idle" | "locating" }
    | { status: "ok"; lat: number; lng: number }
    | { status: "failed" }
  >({ status: "idle" });

  useEffect(() => {
    if (!noAddresses) return;
    let cancelled = false;
    setDevice({ status: "locating" });
    void requestLocation(DEVICE_LOCATE_TIMEOUT_MS).then((result) => {
      if (cancelled) return;
      setDevice(
        result.ok && result.coords
          ? { status: "ok", lat: result.coords.lat, lng: result.coords.lng }
          : { status: "failed" },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [noAddresses]);

  if (isLoading) return { kind: "pending" };
  if (selected) {
    return selected.lat != null && selected.lng != null
      ? { kind: "ready", lat: selected.lat, lng: selected.lng }
      : { kind: "needs-address" };
  }
  if (device.status === "ok") return { kind: "ready", lat: device.lat, lng: device.lng };
  if (device.status === "failed") return { kind: "device-failed" };
  return { kind: "pending" };
}

export function ProSelectionSheet({ service, variantId, onClose }: ProSelectionSheetProps) {
  useLockBodyScroll(true);

  const cart = useCart();
  const { setSelectedId } = useSelectedAddress();
  const location = useRankingLocation();
  const ready = location.kind === "ready";
  const query = useServiceProviders(
    service.id,
    variantId,
    ready ? location.lat : null,
    ready ? location.lng : null,
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  // The out-of-range row whose warning strip is showing, if any.
  const [warningFor, setWarningFor] = useState<string | null>(null);
  // The SP waiting on the "Replace cart?" answer.
  const [confirmFor, setConfirmFor] = useState<API_RankedProvider | null>(null);

  // Hardware back closes this sheet first. When opened from ServiceSheet,
  // it registered later, and the last-registered interceptor wins.
  useEffect(
    () =>
      pushBackInterceptor(() => {
        onClose();
        return true;
      }),
    [onClose],
  );

  const drag = useDragDismiss(onClose);
  const variant = service.variants.find((v) => v.id === variantId);

  const commit = (provider: API_RankedProvider, replaceOtherSps: boolean) => {
    const data = query.data;
    if (!data) return;
    cart.addQuoted(
      service,
      variantId,
      {
        spId: provider.sp_id,
        spName: provider.name,
        quotedPrice: provider.price_amount,
        quotedAt: data.quoted_at,
        serviceVariantId: data.service_variant_id ?? variantId,
        outsideRecommendedRange: provider.outside_recommended_range,
      },
      { replaceOtherSps },
    );
    // SVC-398: one Light tap when a line lands. Here rather than on the "+"
    // that opened the sheet, because that tap no longer adds anything.
    hapticImpactLight();
    toast.success(
      `Added — ${proDisplayName(provider.name)} at ${formatRupees(provider.price_amount)}`,
    );
    onClose();
  };

  const choose = (provider: API_RankedProvider) => {
    if (hasSpConflict(cart.items, service.id, provider.sp_id)) {
      setConfirmFor(provider);
      return;
    }
    commit(provider, false);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        data-testid="pro-sheet-backdrop"
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        {...drag}
        role="dialog"
        aria-label="Choose a pro"
        className="safe-bottom fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-h-[85vh] max-w-md flex-col rounded-t-3xl border-t border-border bg-card shadow-2xl"
      >
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex shrink-0 items-start justify-between gap-2 px-4 pb-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Choose a pro</h2>
            <p className="truncate text-xs text-muted-foreground">
              {service.name}
              {variant && service.variants.length > 1 ? ` · ${variant.label}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-secondary"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {location.kind === "needs-address" || location.kind === "device-failed" ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {location.kind === "needs-address"
                  ? "Choose or add an address to see pros"
                  : "We couldn't find your location. Add an address to see pros."}
              </p>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                {location.kind === "needs-address" ? "Choose address" : "Add address"}
              </button>
            </div>
          ) : location.kind === "pending" || query.isLoading ? (
            <ProRowSkeletons />
          ) : query.isError ? (
            <ErrorState
              message="Couldn't load pros for this service."
              onRetry={() => query.refetch()}
            />
          ) : !query.data || query.data.providers.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No pros available for this service in your area yet.
            </p>
          ) : (
            <ProLists
              providers={query.data.providers}
              warningFor={warningFor}
              onTapInRange={(p) => {
                setWarningFor(null);
                choose(p);
              }}
              onTapOutOfRange={(p) => setWarningFor((cur) => (cur === p.sp_id ? null : p.sp_id))}
              onSelectAnyway={choose}
            />
          )}
        </div>
      </motion.div>

      {pickerOpen && (
        <SavedAddressesSheet
          onClose={() => setPickerOpen(false)}
          onPick={(id) => {
            setSelectedId(id);
            setPickerOpen(false);
          }}
        />
      )}

      <AlertDialog
        open={confirmFor !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmFor(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace cart?</AlertDialogTitle>
            <AlertDialogDescription>
              Your cart has services from another pro. One booking goes to one pro, so adding{" "}
              {proDisplayName(confirmFor?.name ?? null)} removes those services.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep cart</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = confirmFor;
                setConfirmFor(null);
                if (target) commit(target, true);
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ProLists({
  providers,
  warningFor,
  onTapInRange,
  onTapOutOfRange,
  onSelectAnyway,
}: {
  providers: API_RankedProvider[];
  warningFor: string | null;
  onTapInRange: (p: API_RankedProvider) => void;
  onTapOutOfRange: (p: API_RankedProvider) => void;
  onSelectAnyway: (p: API_RankedProvider) => void;
}) {
  const { inRange, outOfRange } = splitProviders(providers);
  return (
    <div className="flex flex-col gap-5">
      {inRange.length > 0 && (
        <ul aria-label="Pros" className="flex flex-col gap-3">
          {inRange.map((p) => (
            <li key={p.sp_id}>
              <ProRow provider={p} onTap={() => onTapInRange(p)} />
            </li>
          ))}
        </ul>
      )}
      {outOfRange.length > 0 && (
        <section aria-labelledby="pro-out-of-range-heading">
          <h3
            id="pro-out-of-range-heading"
            className="pb-3 text-sm font-semibold text-muted-foreground"
          >
            {OUT_OF_RANGE_HEADING}
          </h3>
          <ul aria-label={OUT_OF_RANGE_HEADING} className="flex flex-col gap-3">
            {outOfRange.map((p) => {
              const warned = warningFor === p.sp_id;
              return (
                <li key={p.sp_id}>
                  <ProRow provider={p} onTap={() => onTapOutOfRange(p)} expanded={warned} />
                  {warned && (
                    // Destructive at low strength, not amber: night mode swaps
                    // only the :root tokens (SVC-383) and there is no warning
                    // token, so a literal amber would clash in the dark.
                    <div
                      role="alert"
                      className="mt-2 flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                      <p className="flex-1 text-xs text-foreground">{OUT_OF_RANGE_WARNING}</p>
                      <button
                        type="button"
                        onClick={() => onSelectAnyway(p)}
                        className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                      >
                        Select anyway
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * One SP. The whole card is the hit target. The "Select" pill is the visual
 * cue, not a second button, since a button inside a button is invalid.
 */
function ProRow({
  provider,
  onTap,
  expanded,
}: {
  provider: API_RankedProvider;
  onTap: () => void;
  /** Set on out-of-range rows: whether the warning strip is showing. */
  expanded?: boolean;
}) {
  const name = proDisplayName(provider.name);
  const initials = initialsFrom(provider.name);
  const unit = priceUnitLabel(provider.price_unit);
  const chips = provider.why.slice(0, MAX_WHY_CHIPS);

  return (
    <button
      type="button"
      onClick={onTap}
      aria-expanded={expanded}
      data-testid="pro-row"
      className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-secondary/50"
    >
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
      >
        {initials ?? <User className="h-5 w-5" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{name}</span>
          {provider.rating_avg != null ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground">
              <Star aria-hidden className="h-3.5 w-3.5 fill-current text-primary" />
              {provider.rating_avg.toFixed(1)}
              <span className="text-muted-foreground">({provider.rating_count})</span>
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
              New
            </span>
          )}
        </span>

        <span className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-base font-bold text-foreground">
            {formatRupees(provider.price_amount)}
            {unit && <span className="ml-1 text-xs font-medium text-muted-foreground">{unit}</span>}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {provider.distance_km.toFixed(1)} km away
          </span>
        </span>

        {chips.length > 0 && (
          <span className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span
                key={chip}
                data-testid="why-chip"
                className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground"
              >
                {chip}
              </span>
            ))}
          </span>
        )}

        <span className="mt-3 flex justify-end">
          <span
            aria-hidden
            className="rounded-lg border border-primary px-3 py-1 text-xs font-semibold text-primary"
          >
            Select
          </span>
        </span>
      </span>
    </button>
  );
}

function ProRowSkeletons() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading pros" className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          data-testid="pro-row-skeleton"
          className="flex items-start gap-3 rounded-xl border border-border p-4"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
