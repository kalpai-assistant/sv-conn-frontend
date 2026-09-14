/**
 * "In use" — the address a booking would go to right now (SVC-287).
 *
 * One component rather than the same span written twice, because it appears on
 * two screens that must agree: the location gate and the Addresses list. Two
 * copies drift, and a badge that says one thing in one place and another
 * somewhere else is worse than no badge — the user cannot tell which screen is
 * lying.
 *
 * Green, not the brand blue. Blue is this app's accent and sits on every
 * primary control, so a blue badge reads as decoration; green is only ever
 * used for state that is *good and current* (`StatusStepper`, the map's
 * live-position dot). "In use" is exactly that kind of fact.
 *
 * It reports; it never sets. Which address is active is decided by tapping a
 * row here or by the picker — never by the badge, which has no tap target of
 * its own.
 */
import { Check } from "lucide-react";

export function InUseBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
      <Check className="h-3 w-3" />
      In use
    </span>
  );
}
