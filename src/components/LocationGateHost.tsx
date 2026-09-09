/**
 * Wires the location gate to each role's storage (SVC-281).
 *
 * The screen itself (`LocationGate`) is role-agnostic — it asks the question and
 * reports the answer. Where that answer *goes* differs entirely: a consumer's
 * location is an address in their address book, a provider's is the centre of
 * the geo-fence that decides which jobs reach them. Keeping the split here means
 * the screen has no idea which role it is serving.
 */
import { useState } from "react";
import { toast } from "sonner";
import { LocationGate } from "@/components/LocationGate";
import { AddAddressSheet } from "@/components/AddAddressSheet";
import { markLocationConfirmed } from "@/lib/location-gate";
import { useLocalityAt } from "@/hooks/useLocalityAt";
import { localityFrom } from "@/lib/locality";
import { useAddAddress, useUpdateServiceArea } from "@/hooks/useApi";
import { useSelectedAddress } from "@/hooks/useSelectedAddress";
import type { LocationBlockedReason } from "@/hooks/useLocationAvailability";

/**
 * One row per distinct place.
 *
 * The address book legitimately holds duplicates — every tap of "Use my
 * current location" saves another "Home" — and on this screen they render as
 * identical rows the user cannot choose between. The first one wins because
 * it is the older record, and therefore the one anything else already
 * selected.
 *
 * Deliberately not deduping by label: two different addresses both called
 * "Home" are two real choices, and hiding one would silently take away the
 * right answer.
 */
function dedupeByAddress<T extends { full: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.full.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Consumer: pick a delivery address, or set a new one.
 *
 * Picking a saved address is purely local — the address already exists, so
 * "yes, I'm at this one" is a selection, not a write. Only a *new* location
 * costs a request.
 */
export function ConsumerLocationGate({ reason }: { reason: LocationBlockedReason | null }) {
  const { addresses, setSelectedId } = useSelectedAddress();
  const { mutateAsync: addAddress, isPending } = useAddAddress();
  const [manual, setManual] = useState(false);

  if (manual) {
    return (
      <AddAddressSheet
        onClose={() => {
          // The sheet closes on save as well as cancel, and it cannot tell us
          // which. Treating either as answered is deliberate: a user who opened
          // the picker has engaged with the question, and trapping them here
          // because they backed out would make this a dead end.
          markLocationConfirmed();
          setManual(false);
        }}
      />
    );
  }

  return (
    <LocationGate
      reason={reason}
      // Every address, not just the selected one — the common case is "location
      // is off and I'm at home", and a list makes that one tap.
      //
      // Labelled by locality rather than by label: "Home" is true in every city,
      // so a row saying it confirms nothing. See localityFrom.
      //
      // Deduped by address, because "Use my current location" writes a new
      // "Home" every time it is tapped. Found on device: two rows reading
      // "Karve Nagar / Lane Number 7…", identical in every visible respect,
      // with no way to tell which one you were choosing. They also *were* the
      // same place — picking either had the same effect — so the second row
      // was pure noise on a screen whose whole job is a quick decision.
      saved={dedupeByAddress(addresses ?? []).map((a) => ({
        id: a.id,
        label: localityFrom(a.full, a.label),
        full: a.full,
      }))}
      isSaving={isPending}
      onConfirmSaved={(id) => {
        // Selecting is the answer: it is what every later booking reads.
        setSelectedId(id);
        markLocationConfirmed();
      }}
      onUseCurrent={async (lat, lng) => {
        try {
          await addAddress({
            label: "Home",
            full_address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            lat,
            lng,
          });
          markLocationConfirmed();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Couldn't save that location.");
        }
      }}
      onEnterManually={() => setManual(true)}
    />
  );
}

/**
 * Provider: set or confirm the service-area centre.
 *
 * ## Why the copy is not "where are you working today?"
 *
 * It used to be, and that framing was wrong in a way that mattered. A service
 * area is a **standing setting**, not a daily decision: a provider whose area is
 * Karve Nagar has that area whether the app is open or not. "Today" turned a
 * setting into a question, which is part of what justified asking every launch.
 *
 * It also made confirming feel like a lie. A provider sitting at home in
 * Kothrud who serves Karve Nagar should be able to keep Karve Nagar without
 * being asked where their body is.
 *
 * The radius is deliberately left alone: this screen sets *where*, not how far
 * they travel, and silently resetting a considered radius would quietly shrink
 * or widen the jobs they see.
 */
export function ProviderLocationGate({
  lat,
  lng,
  radiusKm,
  reason,
}: {
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  reason: LocationBlockedReason | null;
}) {
  const { mutateAsync: updateServiceArea, isPending } = useUpdateServiceArea();
  // A service area is a point, not an address — so the only way to name it is
  // to ask. Null while resolving, and on failure; see useLocalityAt.
  const locality = useLocalityAt(lat, lng);
  const hasArea = lat != null && lng != null;

  return (
    <LocationGate
      // A missing service area outranks whatever the location probe said. Both
      // can be true at once, and "your device location is off" is the wrong
      // sentence for someone who has simply never set an area — it names a
      // problem that is not the one blocking them.
      //
      // No service_area_center means the PostGIS dispatch query excludes them
      // from every broadcast: online, verified, subscribed, receiving nothing,
      // permanently. So the screen says what to do about *that*.
      title={hasArea ? undefined : "Set your service area"}
      subtitle={
        hasArea
          ? "Only jobs inside your service area reach you."
          : "Only jobs inside your service area reach you. Set the centre, then choose your radius."
      }
      reason={reason}
      // Withheld until the geocode lands rather than shown with filler: a row
      // the provider cannot disagree with is worse than one more tap.
      saved={
        hasArea && locality
          ? [{ id: "service-area", label: locality, full: `Within ${radiusKm} km` }]
          : []
      }
      isSaving={isPending}
      // Already stored and unchanged — keeping it is a local answer, not a write.
      onConfirmSaved={() => markLocationConfirmed()}
      onUseCurrent={async (nextLat, nextLng) => {
        try {
          await updateServiceArea({
            service_area_lat: nextLat,
            service_area_lng: nextLng,
            service_area_radius_km: radiusKm,
          });
          markLocationConfirmed();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Couldn't save your service area.");
        }
      }}
      // The full picker lives on the provider Location screen (SVC-279), which
      // has the map and the radius slider. Sending them there rather than
      // duplicating it keeps one place where a service area is edited.
      onEnterManually={() => {
        markLocationConfirmed();
        window.location.assign("/provider/location");
      }}
    />
  );
}
