/**
 * Top-of-Home address bar.
 *
 * For an on-demand-services app the service location is the single most
 * consequential piece of context (it decides which providers even see the
 * booking), so it earns first-position real estate — above the search bar
 * and above the categories. Tapping the bar opens the address picker; the
 * label + full-address preview mean users can see at a glance whether the
 * app is set to the right place without having to open anything.
 *
 * Falls back to a "Set your location" prompt when no address is on file
 * (new user).
 *
 * This bar used to carry the note that we deliberately never prompt for GPS on
 * load, because an uninvited permission request converts worse than one tied to
 * a user action. **That reasoning still holds and is still honoured** — but the
 * behaviour it described has been superseded by SVC-281.
 *
 * `LocationGate` in `__root.tsx` now asks, on every launch, where the user is.
 * It does not change the grant-rate argument: the OS dialog still fires only on
 * an explicit tap of "Use my current location", never on load. What changed is
 * that the question is asked at all, because a *stale* address turned out to be
 * costlier than a missing one — a booking placed against yesterday's city finds
 * no providers and fails silently.
 *
 * So this bar is no longer the only place a location gets set, and a user
 * reaching Home has already answered the question once this launch.
 */
import { useState } from "react";
import { MapPin, ChevronDown } from "lucide-react";
import { useSelectedAddress } from "@/hooks/useSelectedAddress";
import { AddressPickerSheet } from "@/components/AddressPickerSheet";

export function LocationBar() {
  const { selected } = useSelectedAddress();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="sticky top-0 z-30 flex w-full items-center gap-3 border-b border-border bg-card px-4 py-3 text-left"
        aria-label="Change delivery address"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent">
          <MapPin className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="text-sm font-semibold text-foreground capitalize">
              {selected?.label || "Set your location"}
            </p>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {selected?.full || "Tap to add an address"}
          </p>
        </div>
      </button>

      {open && <AddressPickerSheet onClose={() => setOpen(false)} />}
    </>
  );
}
