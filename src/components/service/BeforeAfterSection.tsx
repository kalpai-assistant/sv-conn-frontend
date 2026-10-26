/**
 * "Before / after" photos — tangible proof of what the service delivers
 * (SVC-392).
 *
 * One pair rendered by default; services that have multiple pairs get the
 * same horizontal-scroll-with-snap pattern the home rails use, so a user
 * can swipe through examples. The section hides entirely when the backend
 * sends no pairs — never render empty "Before" / "After" labels.
 *
 * Only applicable to a subset of services (deep clean, painting, pest
 * control). The ticket calls these out explicitly as the "when it makes
 * sense" list; everything else sends an empty array.
 *
 * Images are lazy-loaded and asked for in the sheet-width size (750px wide,
 * WebP) — the sheet is `max-w-md` (~448px) and photos are the heaviest
 * item on this surface.
 */
import type { UI_BeforeAfterPair } from "@/hooks/useApi";

export function BeforeAfterSection({ pairs }: { pairs: UI_BeforeAfterPair[] }) {
  if (pairs.length === 0) return null;

  const single = pairs.length === 1;

  return (
    <section aria-labelledby="before-after-heading" className="px-4 pt-5">
      <h4 id="before-after-heading" className="mb-3 text-sm font-semibold text-foreground">
        Before &amp; after
      </h4>
      <div
        className={
          single ? "flex gap-2" : "scrollbar-none flex snap-x snap-mandatory gap-3 overflow-x-auto"
        }
      >
        {pairs.map((pair, i) => (
          <PairCard key={i} pair={pair} single={single} />
        ))}
      </div>
    </section>
  );
}

function PairCard({ pair, single }: { pair: UI_BeforeAfterPair; single: boolean }) {
  return (
    <div
      className={
        single ? "flex flex-1 gap-2" : "flex min-w-[calc(100%-1rem)] shrink-0 snap-start gap-2"
      }
    >
      <PhotoWithLabel url={pair.beforeUrl} label="Before" />
      <PhotoWithLabel url={pair.afterUrl} label="After" />
    </div>
  );
}

function PhotoWithLabel({ url, label }: { url: string; label: string }) {
  return (
    <figure className="relative flex-1 overflow-hidden rounded-xl bg-muted">
      <img
        src={`${url}?w=750&fm=webp`}
        alt={label}
        loading="lazy"
        className="aspect-square w-full object-cover"
      />
      <figcaption className="absolute left-2 top-2 rounded-md bg-background/85 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-foreground backdrop-blur-sm">
        {label}
      </figcaption>
    </figure>
  );
}
