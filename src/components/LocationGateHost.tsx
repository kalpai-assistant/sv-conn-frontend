/**
 * Wires the launch-time location question to each role's storage (SVC-281).
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

/**
 * Consumer: confirm the delivery address, or set a new one.
 *
 * Confirming is purely local — the address is already stored and already
 * selected, so "yes, still here" needs no write. Only a *change* costs a
 * request.
 */
export function ConsumerLocationGate() {
  const { selected } = useSelectedAddress();
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
      title="Where do you want your service?"
      subtitle="Professionals are matched to your location, so it needs to be right."
      // The locality, not the label. "Yes, I'm at home" is true in every city
      // — see localityFrom for why that breaks the whole mechanism.
      saved={
        selected
          ? { label: localityFrom(selected.full, selected.label), full: selected.full }
          : null
      }
      isSaving={isPending}
      onConfirmSaved={markLocationConfirmed}
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
 * Provider: confirm or move the service-area centre.
 *
 * Unlike the consumer, "confirm" here is also local — the centre is already
 * stored, and re-writing an unchanged value would be a pointless request. Only
 * moving it PATCHes.
 *
 * The radius is deliberately left alone: this screen asks *where* they are, not
 * how far they travel, and silently resetting a considered radius to a default
 * would quietly shrink or widen the jobs they see.
 */
export function ProviderLocationGate({
  lat,
  lng,
  radiusKm,
}: {
  lat: number | null;
  lng: number | null;
  radiusKm: number;
}) {
  const { mutateAsync: updateServiceArea, isPending } = useUpdateServiceArea();
  // A service area is a point, not an address — so the only way to name it is
  // to ask. Null while resolving, and on failure; see useLocalityAt.
  const locality = useLocalityAt(lat, lng);
  const hasArea = lat != null && lng != null;

  return (
    <LocationGate
      title="Where are you working today?"
      subtitle="Only jobs inside your service area reach you, so this decides what you see."
      // "your saved service area" was the placeholder this replaced: true
      // wherever the provider stands, so it confirmed nothing. Until the
      // geocode lands the card is withheld rather than shown with filler — a
      // button that cannot be disagreed with is worse than one more tap.
      saved={hasArea && locality ? { label: locality, full: `Within ${radiusKm} km` } : null}
      isSaving={isPending}
      onConfirmSaved={markLocationConfirmed}
      onUseCurrent={async (lat, lng) => {
        try {
          await updateServiceArea({
            service_area_lat: lat,
            service_area_lng: lng,
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
