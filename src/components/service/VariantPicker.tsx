/**
 * Variant picker for the service detail screen (SVC-232).
 *
 * Every service is priced through variants — "2 BHK", "SUV", "Filter
 * replacement". Before this existed the app booked without naming one, so the
 * backend fell back to the first variant and every Vehicle Wash was sold at
 * Hatchback pricing regardless of what the customer actually drove.
 *
 * Radio semantics, card presentation: exactly one selection, always one
 * selected, and the whole card is the hit target rather than a small control.
 * A real `<input type="radio">` is kept (visually hidden) so screen readers
 * and keyboard users get grouping and arrow-key movement for free; the visual
 * state is driven from the `selected` boolean, matching how `CategoryGrid`
 * already handles its tiles.
 *
 * Services whose variants carry a `subcategory` (RO Purifier: "Basic" /
 * "Installation" / "Filter") are grouped under headings. A service whose
 * variants are all ungrouped renders one flat list with no heading.
 *
 * SVC-496: each row shows its own "from ₹X" from the service's from-prices
 * row (the one the header reads), labelled when that price is the option's
 * out-of-range fallback. An option no listable pro prices is greyed and
 * can't be picked. With no from-prices row the rows show catalogue prices,
 * like the header. See variantPriceState.
 */
import type { API_ServiceFromPrice } from "@/hooks/useApi";
import type { ServiceVariant } from "@/lib/mock-data";
import { formatRupees } from "@/lib/currency";
import {
  VARIANT_NO_PROS_TEXT,
  VARIANT_OUT_OF_RANGE_TEXT,
  variantPriceState,
} from "@/lib/tile-price-state";

interface VariantPickerProps {
  variants: ServiceVariant[];
  selectedId: string | undefined;
  onSelect: (variantId: string) => void;
  /** The service's from-prices row; undefined = no data (catalogue prices). */
  fromPrices?: API_ServiceFromPrice;
}

export function VariantPicker({ variants, selectedId, onSelect, fromPrices }: VariantPickerProps) {
  // Preserve catalogue order (already sorted by sort_order in mapService)
  // while collecting subcategories in first-seen order, so headings appear in
  // the sequence the catalogue intends.
  const groups = variants.reduce<{ heading: string | null; items: ServiceVariant[] }[]>(
    (acc, variant) => {
      const last = acc[acc.length - 1];
      if (last && last.heading === variant.subcategory) {
        last.items.push(variant);
      } else {
        acc.push({ heading: variant.subcategory, items: [variant] });
      }
      return acc;
    },
    [],
  );

  return (
    <fieldset className="px-4 pt-5">
      <legend className="pb-3 text-base font-semibold text-foreground">Choose an option</legend>

      <div className="flex flex-col gap-4">
        {groups.map((group, groupIndex) => (
          <div key={group.heading ?? `ungrouped-${groupIndex}`}>
            {group.heading && (
              <p className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.heading}
              </p>
            )}

            <div className="flex flex-col gap-2">
              {group.items.map((variant) => {
                const priceState = variantPriceState(fromPrices, variant.id, variant.price);
                const disabled = priceState.kind === "no-pros";
                const selected = !disabled && selectedId === variant.id;
                return (
                  <label
                    key={variant.id}
                    data-testid="variant-row"
                    aria-disabled={disabled || undefined}
                    className={`flex items-center gap-3 rounded-xl border p-4 transition-colors ${
                      disabled
                        ? "cursor-default border-border bg-card opacity-50"
                        : selected
                          ? "cursor-pointer border-primary bg-accent"
                          : "cursor-pointer border-border bg-card"
                    }`}
                  >
                    <input
                      type="radio"
                      name="service-variant"
                      value={variant.id}
                      checked={selected}
                      disabled={disabled}
                      onChange={disabled ? undefined : () => onSelect(variant.id)}
                      className="sr-only"
                    />

                    {/* Drawn rather than using the native control so the dot
                        matches brand colours identically on Android + web. */}
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        selected ? "border-primary" : "border-muted-foreground"
                      }`}
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          selected ? "bg-primary" : "bg-transparent"
                        }`}
                      />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm font-medium ${
                          disabled ? "text-muted-foreground" : "text-foreground"
                        }`}
                      >
                        {variant.label}
                      </span>
                      {variant.duration && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {variant.duration}
                        </span>
                      )}
                      {priceState.kind === "price" && priceState.outsideRange && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {VARIANT_OUT_OF_RANGE_TEXT}
                        </span>
                      )}
                    </span>

                    {priceState.kind === "no-pros" ? (
                      <span className="shrink-0 text-sm font-medium text-muted-foreground">
                        {VARIANT_NO_PROS_TEXT}
                      </span>
                    ) : priceState.kind === "price" ? (
                      <span className="shrink-0 text-right text-sm font-semibold text-foreground">
                        <span className="text-xs font-medium text-muted-foreground">from </span>
                        {formatRupees(priceState.amount)}
                      </span>
                    ) : (
                      <span className="shrink-0 text-sm font-semibold text-foreground">
                        {formatRupees(priceState.amount)}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
