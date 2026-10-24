/**
 * The persistent trust strip (SVC-387).
 *
 * Three (or two, or four) credibility claims rendered as a tight horizontal
 * row — "Background-verified pros · Full refund guarantee · Support 10am-10pm".
 * Mounted on Home above the service grid (compact variant, 32px tall), the
 * Service detail page (full variant), and the Tracking screen (full variant,
 * the post-booking surface — no dedicated confirmation route exists today).
 *
 * ## Why 3 claims and not 4
 *
 * The ticket enumerates four candidates including "₹10,000 damage cover".
 * We don't ship that claim — it needs a real insurance partnership and we
 * don't have one yet. The hard rule the ticket calls out is "only ship
 * claims we can back"; bluffing it would be worse than omitting it. A
 * follow-up ticket tracks adding the damage claim once the partner lands.
 *
 * ## Icon collapse at narrow widths
 *
 * On the compact variant below 400px, icons hide so the labels can stay
 * single-line. Truncation with ellipsis would turn the trust surface into
 * a riddle ("Background-veri..." is not credible), and dropping to two
 * claims to make room would be worse than just dropping the icons.
 */
import { ArrowLeftRight, FileCheck2, Headphones, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type TrustClaim = {
  id: "verified" | "refund" | "support" | "damage";
  label: string;
  icon: typeof ShieldCheck;
};

/**
 * All four candidate claims, ordered so `.slice(0, 3)` yields the shipping
 * set and `damage` sits last — the one we add back when insurance lands.
 */
export const trustClaims: TrustClaim[] = [
  { id: "verified", label: "Background-verified pros", icon: ShieldCheck },
  { id: "refund", label: "Full refund guarantee", icon: ArrowLeftRight },
  { id: "support", label: "Support 10am–10pm", icon: Headphones },
  { id: "damage", label: "₹10,000 damage cover", icon: FileCheck2 },
];

export type TrustStripVariant = "compact" | "full";

type TrustStripProps = {
  claims?: TrustClaim[];
  variant?: TrustStripVariant;
  className?: string;
};

export function TrustStrip({
  claims = trustClaims.slice(0, 3),
  variant = "compact",
  className,
}: TrustStripProps) {
  const [textOnly, setTextOnly] = useState(false);

  useEffect(() => {
    // jsdom (used by the test env) does not implement matchMedia. Rather than
    // force every suite that mounts a component containing a TrustStrip —
    // ServiceSheet, tracking page, etc. — to stub window.matchMedia, we treat
    // its absence as "no narrow-screen collapse, render the icons" and move
    // on. The real browsers always have it.
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia("(max-width: 400px)");
    const update = () => setTextOnly(media.matches && variant === "compact" && claims.length >= 3);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [claims.length, variant]);

  return (
    <div
      aria-label="Service guarantees"
      className={cn(
        "flex w-full items-center justify-around gap-1 bg-accent text-accent-foreground",
        variant === "compact"
          ? "min-h-8 border-y border-border/60 px-2 py-1"
          : "min-h-10 rounded-md border border-border/70 px-3 py-2",
        className,
      )}
    >
      {claims.map((claim, index) => {
        const Icon = claim.icon;
        return (
          <div
            key={claim.id}
            className={cn(
              "flex min-w-0 flex-none items-center justify-center gap-1.5 whitespace-nowrap text-[10px] font-medium leading-none tracking-[-0.01em] text-muted-foreground",
              variant === "full" && "gap-1 text-[9px] tracking-[-0.01em]",
              index > 0 && variant === "compact" && "border-l border-border/70",
            )}
          >
            {!textOnly && (
              <Icon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-primary"
                strokeWidth={1.8}
              />
            )}
            <span>{claim.label}</span>
          </div>
        );
      })}
    </div>
  );
}
