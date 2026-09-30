import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A provider's business logo, or the default one (SVC-337).
 *
 * The one place the "no logo" fallback lives. The backend stores NULL when a
 * provider has not uploaded a logo — never a placeholder URL — so every screen
 * that shows a logo renders this and gets the same default. It is drawn inline
 * rather than loaded from a file: nothing to fetch, so it also shows offline and
 * in the APK before any network is up.
 *
 * `src` is either a stored URL or an object URL for a logo picked but not yet
 * uploaded. A URL that fails to load falls back to the default rather than
 * showing a broken image.
 */
export function BusinessLogo({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  // A new source gets a fresh chance to load.
  useEffect(() => setFailed(false), [src]);

  const frame = cn(
    "flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white",
    className,
  );

  if (src && !failed) {
    return (
      <div className={frame}>
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={frame}>
      <DefaultBusinessLogo title={alt} />
    </div>
  );
}

/** Storefront mark in the app's primary colour. */
function DefaultBusinessLogo({ title }: { title: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" role="img" aria-label={title} className="h-full w-full">
      <rect width="64" height="64" className="fill-primary/10" />
      <g className="stroke-primary" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 26l4-10h24l4 10" />
        <path d="M16 26q4 6 8 0q4 6 8 0q4 6 8 0q4 6 8 0" />
        <path d="M19 30v16h26V30" />
        <path d="M29 46v-9h6v9" />
      </g>
    </svg>
  );
}
