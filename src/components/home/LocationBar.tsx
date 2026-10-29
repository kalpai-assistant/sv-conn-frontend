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
 * `LocationGate` in `__root.tsx` asks where the user is when the app cannot
 * work it out — the OS location toggle is off, permission is off, or there is
 * no saved address at all. It does not change the grant-rate argument: the OS
 * dialog still fires only on an explicit tap, never on load.
 *
 * A first version of that gate asked on *every* launch, and this comment used
 * to say so. It was reverted: a daily prompt becomes a reflex, and a reflex
 * cannot notice that the city is wrong, which was the entire point of asking.
 *
 * So this bar is no longer the only place a location gets set — but most users
 * reach Home without having seen the gate, and changing the address here stays
 * the ordinary way to do it.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, ChevronDown } from "lucide-react";
import { useSelectedAddress } from "@/hooks/useSelectedAddress";
import { SavedAddressesSheet } from "@/components/SavedAddressesSheet";
import { AccountAvatar } from "@/components/AccountAvatar";
import { useAuth } from "@/lib/auth-context";

export function LocationBar() {
  const { selected, setSelectedId } = useSelectedAddress();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Two tap targets, not one. The row used to be a single button; the
          avatar cannot nest inside it (interactive elements must not contain
          interactive elements, and the two hit areas would fight), so the
          row became a container and the button a sibling of the avatar —
          the layout Blinkit and Zepto both use.

          Not sticky itself: HomePage pins this row and the in-progress
          booking banner under it in one sticky wrapper (SVC-389), since two
          `sticky top-0` siblings would overlap. */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3">
        <button
          onClick={() => setOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {selected?.full || "Tap to add an address"}
            </p>
          </div>
        </button>

        {/* SVC-273: the only way into Profile now that it has left the tab bar.
            Consumers have no photo field, so this is always initials or the
            person glyph. */}
        <AccountAvatar to="/profile" name={user?.name} />
      </div>

      {/* Portaled out of HomePage's sticky wrapper: that wrapper's z-30 is a
          stacking context, and the sheet's z-50 inside it would sit under the
          z-40 bottom nav. Only ever opened by a tap, so `document` exists. */}
      {open &&
        createPortal(
          <SavedAddressesSheet
            onClose={() => setOpen(false)}
            onPick={(id) => {
              setSelectedId(id);
              setOpen(false);
            }}
          />,
          document.body,
        )}
    </>
  );
}
