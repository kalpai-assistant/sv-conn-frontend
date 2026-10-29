/**
 * "Here's what we'll do" — horizontal snap-scroll of step cards (SVC-392).
 *
 * Supersedes the collapsible numbered list that SVC-340 shipped. The old
 * list collapsed-by-default kept the sheet short; the new design surfaces
 * steps as a glance-able row because the data behind them is richer now
 * (step icon + duration, not just text).
 *
 * ## Why horizontal + scrollable in a sheet
 *
 * Nested scroll inside the sheet's vertical scroll works fine as long as
 * each inner container has a defined width and `overflow-x`; browsers
 * route the two axes to the correct scroller. The repo's `CategoryRail`
 * and `PromoCarousel` already use the same `snap-x snap-mandatory
 * overflow-x-auto scrollbar-none` pattern on the home page, inside the
 * app's vertical page scroll. Same pattern here.
 *
 * ## Icon mapping
 *
 * `icon` is a free-form string from the backend (SVC-392 contract). A small
 * allow-list maps common keywords to Lucide icons; anything unknown falls
 * back to `Sparkles` — a step card without an icon still renders, no empty
 * circle. SVC-402 widened the list past cleaning to the trades SVC-400's
 * content covers (plumbing, electrical, AC, pest control, appliances,
 * carpentry, painting, salon).
 */
import {
  Bath,
  Bug,
  ChefHat,
  Clock3,
  Drill,
  Fan,
  Hammer,
  PaintRoller,
  Paintbrush,
  Plug,
  Scissors,
  Search,
  Snowflake,
  Sparkles,
  SprayCan,
  WashingMachine,
  Wind,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { UI_ServiceStep } from "@/hooks/useApi";

const stepIcons: Record<string, LucideIcon> = {
  search: Search,
  inspect: Search,
  wind: Wind,
  dust: Wind,
  bath: Bath,
  bathroom: Bath,
  kitchen: ChefHat,
  degrease: ChefHat,
  sparkles: Sparkles,
  mop: Sparkles,
  finish: Sparkles,
  review: Sparkles,
  wrench: Wrench,
  pipe: Wrench,
  zap: Zap,
  plug: Plug,
  fan: Fan,
  snowflake: Snowflake,
  bug: Bug,
  spray: SprayCan,
  hammer: Hammer,
  drill: Drill,
  paint: PaintRoller,
  brush: Paintbrush,
  scissors: Scissors,
  washing: WashingMachine,
};

export function RichStepsSection({ steps }: { steps: UI_ServiceStep[] }) {
  if (steps.length === 0) return null;

  return (
    <section aria-labelledby="steps-heading" className="pt-5">
      <h4 id="steps-heading" className="px-4 text-sm font-semibold text-foreground">
        Here&apos;s what we&apos;ll do
      </h4>
      <div className="scrollbar-none mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {steps.map((step, index) => (
          <StepCard key={`${step.title}-${index}`} step={step} index={index} />
        ))}
      </div>
    </section>
  );
}

function StepCard({ step, index }: { step: UI_ServiceStep; index: number }) {
  // `??` on a possibly-undefined index access gives a `LucideIcon | undefined`
  // union that TSX won't let us render — pin the fallback type with an
  // explicit `LucideIcon` binding.
  const Icon: LucideIcon = (step.icon && stepIcons[step.icon.toLowerCase()]) || Sparkles;
  const stepNumber = String(index + 1).padStart(2, "0");

  return (
    <article className="relative min-w-40 snap-start rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </span>
        <span className="text-xs font-semibold text-muted-foreground">{stepNumber}</span>
      </div>
      <h5 className="min-h-10 text-sm font-semibold leading-tight text-foreground">{step.title}</h5>
      {step.durationMinutes !== undefined && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Clock3 aria-hidden="true" className="size-3.5" /> {step.durationMinutes} min
        </p>
      )}
    </article>
  );
}
