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
import { SavedAddressesSheet } from "@/components/SavedAddressesSheet";
import { markLocationConfirmed } from "@/lib/location-gate";
import { useLocalityAt } from "@/hooks/useLocalityAt";
import { localityFrom } from "@/lib/locality";
import { dedupeByPlace } from "@/lib/nearby";
import { useUpdateServiceArea } from "@/hooks/useApi";
import { useSelectedAddress } from "@/hooks/useSelectedAddress";
import type { LocationBlockedReason } from "@/hooks/useLocationAvailability";

/**
 * Consumer: pick a delivery address, or set a new one.
 *
 * Picking a saved address is purely local — the address already exists, so
 * "yes, I'm at this one" is a selection, not a write. Only a *new* location
 * costs a request.
 */
export function ConsumerLocationGate({ reason }: { reason: LocationBlockedReason | null }) {
  const { addresses, selected, setSelectedId } = useSelectedAddress();
  const [manual, setManual] = useState(false);
  // The full address list, over the gate rather than instead of it (SVC-287).
  // A route would mean navigating away from the screen whose whole job is to
  // block the app; a sheet layers on top and dismisses back to it.
  const [seeAll, setSeeAll] = useState(false);
  // Set when "Use my current location" has acquired a fix, so the picker opens
  // on it. Null means the user chose manual entry and we have no position.
  const [fix, setFix] = useState<[number, number] | null>(null);

  // Over the gate, not instead of it. Rendered before `manual` so the two
  // never stack.
  if (seeAll) {
    return (
      <SavedAddressesSheet
        // No way out but choosing: the gate underneath is what blocks the app,
        // so a back arrow here would offer an escape that does not exist.
        dismissible={false}
        onClose={() => setSeeAll(false)}
        onPick={(id) => {
          // Same answer the gate's own list gives: select, and we are done.
          setSelectedId(id);
          markLocationConfirmed();
          setSeeAll(false);
        }}
      />
    );
  }

  if (manual) {
    return (
      <AddAddressSheet
        // When we have a position, open the map there — this is the whole
        // point of the confirm step (SVC-283). Without it the sheet would
        // re-resolve a centre and could land somewhere other than where the
        // user is standing, having just been told we found them.
        initialCentre={fix}
        onClose={() => {
          // The sheet closes on save as well as cancel, and it cannot tell us
          // which. Treating either as answered is deliberate: a user who opened
          // the picker has engaged with the question, and trapping them here
          // because they backed out would make this a dead end.
          markLocationConfirmed();
          setManual(false);
          setFix(null);
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
      // Deduped by *place*, not by text. Found on device: two rows reading
      // "Karve Nagar / Lane Number 7…", identical in every visible respect,
      // with no way to tell which one you were choosing. They also were the
      // same place — picking either had the same effect — so the second row
      // was pure noise on a screen whose whole job is a quick decision.
      //
      // Text alone no longer catches that. It only ever worked because the old
      // "use my current location" wrote the same synthetic coordinate string
      // every time; now that these addresses are geocoded, one building can
      // come back under two different names. See lib/nearby.
      saved={dedupeByPlace(addresses ?? []).map((a) => ({
        id: a.id,
        label: localityFrom(a.full, a.label),
        full: a.full,
        // The address *type*, kept alongside the locality that replaced it in
        // `label`. Without it the gate could not tell a home from a workplace
        // and drew a pin for both, while the Addresses screen drew a house —
        // one address, two icons (SVC-287).
        kind: a.label,
        isSelected: selected?.id === a.id,
      }))}
      onConfirmSaved={(id) => {
        // Selecting is the answer: it is what every later booking reads.
        setSelectedId(id);
        markLocationConfirmed();
      }}
      // A position is not an address (SVC-283).
      //
      // This used to write one immediately, synthesising `full_address` from
      // the coordinates to satisfy the backend's required field — which is how
      // users ended up with saved addresses called "18.52040, 73.85670". The
      // string was not a display bug; it was what we persisted, and
      // `localityFrom` had nothing to name a row with.
      //
      // Measured on device against Blinkit, Zepto, Urban Company and Pronto:
      // none of them writes an address at this moment. They take the fix, show
      // it, and store something only once the user confirms — Blinkit's
      // "Confirm location / Move the pin to adjust your location" being the
      // clearest form. Zepto does not even keep it as an address; it is a
      // session location, and its saved list stays untouched.
      //
      // So this hands the fix to the picker the app already has, which
      // reverse-geocodes it, shows it on a map, and lets the user correct it
      // before anything is saved. A failed geocode needs no placeholder text:
      // the map still opens on the right spot and the address line is simply
      // empty for them to fill in.
      onUseCurrent={(lat, lng) => {
        setFix([lat, lng]);
        setManual(true);
      }}
      onEnterManually={() => {
        // No position — the picker resolves its own centre, and says so when
        // it is guessing.
        setFix(null);
        setManual(true);
      }}
      onSeeAll={() => setSeeAll(true)}
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
  // to ask. Carries a status, not just a string, so a geocoder failure can be
  // told apart from a lookup still in flight; see useLocalityAt.
  const locality = useLocalityAt(lat, lng);
  const hasArea = lat != null && lng != null;

  // Whether to offer the saved area at all.
  //
  // The original rule was `hasArea && locality` — show it only once named. That
  // reads well until the geocoder is unreachable, at which point a provider
  // with a perfectly good service area loses their one-tap path for a reason
  // that has nothing to do with them, on a screen that blocks the whole app
  // (SVC-309: a missing API key kept this null permanently, so the row simply
  // never appeared).
  //
  // So the row is withheld only while the answer might still arrive. Once the
  // geocoder has failed, or answered with no locality, the area is offered
  // under an honest label instead — the provider knows where they set it, and
  // the radius below distinguishes it well enough to act on.
  const showSavedArea = hasArea && locality.status !== "pending";

  // Named when we know it. When we don't, this says so rather than inventing a
  // place — "a row the provider cannot disagree with is worse than one more
  // tap" still holds; the fix is to be honest, not to disappear.
  const areaLabel = locality.name ?? "Your service area";

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
      saved={
        showSavedArea
          ? [{ id: "service-area", label: areaLabel, full: `Within ${radiusKm} km` }]
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
