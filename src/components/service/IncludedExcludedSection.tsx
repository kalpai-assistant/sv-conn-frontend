/**
 * "What's covered" — side-by-side included / excluded lists (SVC-392).
 *
 * Supersedes the standalone amber `ExclusionsSection` that SVC-340 shipped
 * (the amber card lived at the bottom of the sheet, alone). The new design
 * from SVC-392 pairs inclusions and exclusions so the user sees the scope
 * boundary in one glance — the sheet now surfaces trust-and-scope near the
 * top rather than hiding exclusions behind other sections.
 *
 * ## Rendering rules
 *
 * - If BOTH lists are empty, render nothing — this surface is for services
 *   that have scope copy, not every service.
 * - If only one list has items, render just that column full-width. A lone
 *   "Not included" column at half-width reads as "something's missing".
 * - Success / muted token classes do the semantic colouring; no literal
 *   greens or greys. The app's success is `oklch(0.65 0.17 165)` — a real
 *   green — so the included column reads as checked-off, not as brand blue.
 */
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function IncludedExcludedSection({
  included,
  excluded,
}: {
  included: string[];
  excluded: string[];
}) {
  if (included.length === 0 && excluded.length === 0) return null;

  const bothSides = included.length > 0 && excluded.length > 0;

  return (
    <section aria-labelledby="covered-heading" className="px-4 pt-5">
      <h4 id="covered-heading" className="mb-3 text-sm font-semibold text-foreground">
        What&apos;s covered
      </h4>
      <div className={cn("grid gap-3", bothSides ? "grid-cols-2" : "grid-cols-1")}>
        {included.length > 0 && <IncludedList items={included} />}
        {excluded.length > 0 && <ExcludedList items={excluded} />}
      </div>
    </section>
  );
}

function IncludedList({ items }: { items: string[] }) {
  return (
    <div className="rounded-xl border border-success/20 bg-success/5 p-4">
      <h5 className="mb-3 text-xs font-semibold uppercase tracking-wider text-success">
        What&apos;s included
      </h5>
      <ul className="flex flex-col gap-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs leading-snug text-foreground">
            <Check
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-success"
              strokeWidth={3}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExcludedList({ items }: { items: string[] }) {
  return (
    <div className="rounded-xl border border-border bg-muted p-4">
      <h5 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Not included
      </h5>
      <ul className="flex flex-col gap-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
            <X
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2.5}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
