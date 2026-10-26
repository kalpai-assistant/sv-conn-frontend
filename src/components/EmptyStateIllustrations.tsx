/**
 * Line-art illustrations for the five SVC-390 empty-state scenarios.
 *
 * Simple SVGs, single-colour (brand primary), paired with a tinted-circle
 * frame — the Dropbox / Linear / Asana silhouette the ticket calls out.
 * Shipped inline rather than via unDraw so one brand colour change
 * (OKLCH hue 262 today, something else tomorrow) carries through without
 * a round-trip to an external editor.
 *
 * Each component renders only the illustration frame; the surrounding
 * EmptyState handles title / description / CTA. Pass the component as the
 * `illustration` prop:
 *
 *   <EmptyState illustration={<BookingsEmptyIllustration />} ... />
 */
import { WifiOff } from "lucide-react";

const svgCommon = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Frame({ children }: { children: React.ReactNode }) {
  // The shared outer wrapper — tinted-blue square with rounded corners, big
  // enough to feel considered without stealing the scroll.
  return (
    <div
      aria-hidden="true"
      className="mb-7 flex size-29 items-center justify-center rounded-3xl bg-primary/10 text-primary"
    >
      {children}
    </div>
  );
}

export function BookingsEmptyIllustration() {
  return (
    <Frame>
      <svg viewBox="0 0 100 100" className="size-20" {...svgCommon}>
        <rect x="22" y="27" width="56" height="48" rx="8" />
        <path d="M32 22v10M68 22v10M22 42h56M35 55h12M35 64h25" />
        <circle cx="68" cy="65" r="11" fill="var(--background)" />
        <path d="m63 65 3 3 7-8" />
      </svg>
    </Frame>
  );
}

export function CartEmptyIllustration() {
  return (
    <Frame>
      <svg viewBox="0 0 100 100" className="size-20" {...svgCommon}>
        <path d="M24 28h8l7 39h35l6-28H36" />
        <circle cx="46" cy="78" r="3" />
        <circle cx="69" cy="78" r="3" />
        <path d="M49 48h18M58 39v18" />
      </svg>
    </Frame>
  );
}

export function AddressEmptyIllustration() {
  return (
    <Frame>
      <svg viewBox="0 0 100 100" className="size-20" {...svgCommon}>
        <path d="M50 77S72 57 72 42a22 22 0 1 0-44 0c0 15 22 35 22 35Z" />
        <circle cx="50" cy="42" r="7" />
        <path d="M24 82h52" />
      </svg>
    </Frame>
  );
}

export function ServiceAreaEmptyIllustration() {
  return (
    <Frame>
      <svg viewBox="0 0 100 100" className="size-20" {...svgCommon}>
        <circle cx="50" cy="48" r="25" />
        <path d="M34 58c9-9 21-9 32 0M38 42h.01M62 42h.01M43 52h14" />
        <path d="M50 23v-8M27 31l-6-6M73 31l6-6" />
      </svg>
    </Frame>
  );
}

export function OfflineIllustration() {
  // Lucide's WifiOff is close enough to a line-illustration style that
  // hand-drawing a parallel SVG would just be noise. Same frame.
  return (
    <Frame>
      <WifiOff aria-hidden="true" className="size-12 stroke-[1.35]" />
    </Frame>
  );
}
