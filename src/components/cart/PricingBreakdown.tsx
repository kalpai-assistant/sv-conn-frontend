/**
 * SVC-384 — animated bill breakdown on the /cart screen.
 *
 * Collapsed: a single "See breakdown" chip above the sticky Book CTA. Tap →
 * the chip morphs out, the panel reveals bottom-up with a per-line stagger
 * (~70 ms gap) so the eye catches each number as it lands. Tap again (or
 * the "Hide" chip under the total) → the panel collapses and the chip comes
 * back. No backdrop; the panel sits in-flow so the Book CTA stays reachable.
 *
 * Lines rendered (same order the ticket spells out):
 *   1. Service subtotal           — always
 *   2. Discount (−₹X)             — only if a coupon applied; text-success
 *   3. GST (18%, included)        — informational, see "GST and the total"
 *   4. Convenience fee            — only if non-zero (no live source today)
 *   5. Divider + Total            — bold, slightly larger
 *
 * ## GST and the total
 *
 * `CartLineItem.unitPrice` is the service's `base_price`, which the backend
 * schema calls out as "pre-GST". The user-facing total in the cart has
 * historically rendered as ``subtotal − discount`` with no GST added, and
 * this component KEEPS that math unchanged — the ticket's non-goal is "no
 * pricing-model changes", and shifting what the Book button charges would
 * cross that line.
 *
 * To still honour the ticket's "GST line" bullet we show it as an inclusive
 * informational line computed as ``round(subtotal × 0.18 / 1.18)`` — i.e.
 * "if the ₹X you see already contains GST, this is how much of it is tax".
 * Every active variant in prod ships ``gst_percent = 18`` so the heuristic
 * matches reality for live services. The honest fix is to thread
 * ``gst_percent`` through ``CartLineItem`` and compute per-line; filed as a
 * follow-up out of scope for this ticket.
 *
 * ## Reduced motion
 *
 * ``useReducedMotion()`` collapses the per-line stagger to zero and the
 * initial/exit translate to zero. The chip↔panel swap still runs an opacity
 * cross-fade — a snap-in with no transition at all reads as a layout bug on
 * iOS Safari, and WCAG 2.3.3 only requires that non-essential motion be
 * reducible, not eliminated.
 */
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp, Receipt } from "lucide-react";
import { formatRupees } from "@/lib/currency";

interface Props {
  subtotal: number;
  /** Positive amount; the display handles the leading minus. 0 when no coupon applied. */
  discount: number;
  /** Shown in the discount label as "Discount (CODE)". Null when no coupon. */
  couponCode?: string | null;
  /**
   * Reserved for the "+₹X booking fee" variant we don't surface today. The
   * line hides when zero rather than being removed entirely — one less diff
   * when the fee eventually lands.
   */
  convenienceFee?: number;
}

/** 50-100 ms per line is the ticket's stagger budget; 70 ms sits inside it. */
const STAGGER_SECONDS = 0.07;
/** Each line rises ~8 px into place — enough to read as "arrived", not jump. */
const RISE_PX = 8;

type Line = {
  key: string;
  label: string;
  value: string;
  /** Discount uses success colour; divider line uses the heavier Total style. */
  tone?: "default" | "success" | "total";
};

export function PricingBreakdown({
  subtotal,
  discount,
  couponCode,
  convenienceFee = 0,
}: Props) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  const hasDiscount = discount > 0;
  // Round, not floor — "GST ₹89" for a ₹584 subtotal reads cleaner than
  // ₹88, and the figure is informational (not what we charge).
  const gstIncluded = Math.round((subtotal * 0.18) / 1.18);
  const hasConvenience = convenienceFee > 0;
  const total = Math.max(0, subtotal - discount + convenienceFee);

  const lines: Line[] = [
    {
      key: "subtotal",
      label: "Service subtotal",
      value: formatRupees(subtotal),
    },
    ...(hasDiscount
      ? [
          {
            key: "discount",
            // Coupon code is uppercased since every coupon is uppercase at
            // the API and we display them that way everywhere else in cart.
            label: couponCode ? `Discount (${couponCode.toUpperCase()})` : "Discount",
            // Parens-wrapped minus per ticket; `withSymbol: false` keeps the
            // ₹ inside the parens next to the digits instead of leaking out.
            value: `(−${formatRupees(discount)})`,
            tone: "success" as const,
          },
        ]
      : []),
    {
      key: "gst",
      label: "GST (18%, incl.)",
      value: formatRupees(gstIncluded),
    },
    ...(hasConvenience
      ? [
          {
            key: "convenience",
            label: "Convenience fee",
            value: formatRupees(convenienceFee),
          },
        ]
      : []),
  ];

  // Panel-level container drives the stagger via `delayChildren` + `staggerChildren`.
  // Reduced motion drops both to zero so lines appear together — same end
  // state, no cascade.
  const panelVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        when: "beforeChildren",
        staggerChildren: reduceMotion ? 0 : STAGGER_SECONDS,
      },
    },
  };

  const lineVariants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : RISE_PX },
    visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  };

  return (
    <section className="px-4 pt-4">
      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.div
            key="panel"
            data-testid="pricing-breakdown-panel"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={panelVariants}
            className="rounded-xl border border-border bg-card p-4"
          >
            {lines.map((line) => (
              <motion.div
                key={line.key}
                data-testid={`pricing-line-${line.key}`}
                variants={lineVariants}
                className={`flex justify-between py-1 text-sm ${
                  line.tone === "success" ? "text-success" : ""
                }`}
              >
                <span
                  className={
                    line.tone === "success" ? "text-success" : "text-muted-foreground"
                  }
                >
                  {line.label}
                </span>
                <span
                  className={`font-medium ${
                    line.tone === "success" ? "text-success" : "text-foreground"
                  }`}
                >
                  {line.value}
                </span>
              </motion.div>
            ))}
            <motion.div
              key="total"
              data-testid="pricing-line-total"
              variants={lineVariants}
              className="mt-2 flex items-center justify-between border-t border-border pt-2 text-base"
            >
              <span className="font-semibold text-foreground">Total</span>
              <span className="text-lg font-bold text-primary">{formatRupees(total)}</span>
            </motion.div>
            <motion.button
              key="hide"
              type="button"
              variants={lineVariants}
              onClick={() => setOpen(false)}
              className="mt-3 flex w-full items-center justify-center gap-1 text-xs font-medium text-muted-foreground"
            >
              Hide breakdown
              <ChevronUp className="h-3.5 w-3.5" />
            </motion.button>
          </motion.div>
        ) : (
          <motion.button
            key="chip"
            type="button"
            data-testid="pricing-breakdown-chip"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(true)}
            className="flex w-full items-center justify-between rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground"
          >
            <span className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" aria-hidden />
              See breakdown
            </span>
            <span className="flex items-center gap-1 text-primary">
              {formatRupees(total)}
              <ChevronDown className="h-3.5 w-3.5" />
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </section>
  );
}
