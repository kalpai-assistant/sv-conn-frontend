import { useState } from "react";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { X, Loader2, Navigation } from "lucide-react";
import { motion } from "framer-motion";
import { MapPicker } from "./MapPicker";
import { useAddAddress, useUpdateAddress } from "@/hooks/useApi";
import { useMapOpeningCentre } from "@/hooks/useMapOpeningCentre";

/** The address being edited, when the sheet is opened from Edit (SVC-277). */
export interface EditingAddress {
  id: string;
  label: string;
  full: string;
}

export function AddAddressSheet({
  onClose,
  editing,
}: {
  onClose: () => void;
  editing?: EditingAddress;
}) {
  // Sheets are mounted only while open, so locking on mount is the same as
  // locking on open. Without this the page scrolls behind the backdrop.
  useLockBodyScroll(true);

  // Editing opens straight on the form. The map step exists to pick a point
  // for a brand-new address; someone correcting a flat number should not have
  // to re-pin their building, and re-pinning is how a small text edit turns
  // into a moved location.
  const [step, setStep] = useState<"map" | "form">(editing ? "form" : "map");
  const [lat, setLat] = useState(0);
  const [lng, setLng] = useState(0);
  const [addressLine, setAddressLine] = useState(editing?.full ?? "");
  const [label, setLabel] = useState(
    editing ? editing.label.charAt(0).toUpperCase() + editing.label.slice(1) : "Home",
  );
  const { mutateAsync: addAddress, isPending: isAdding } = useAddAddress();
  const { mutateAsync: updateAddress, isPending: isUpdating } = useUpdateAddress();
  const isPending = isAdding || isUpdating;
  const [errorMsg, setErrorMsg] = useState("");
  // Where the map should open. Null until resolved — see useMapOpeningCentre.
  const opening = useMapOpeningCentre();
  const [locating, setLocating] = useState(false);
  // Set once the user asks for their position, so the map recentres on it.
  const [override, setOverride] = useState<[number, number] | null>(null);

  /** Ask for the current position — an explicit user action, so prompting here
   *  is exactly right. `useMapOpeningCentre` deliberately never does this. */
  const locateMe = () => {
    if (!("geolocation" in navigator)) {
      setErrorMsg("Location isn't available on this device.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setOverride([pos.coords.latitude, pos.coords.longitude]);
      },
      (err) => {
        setLocating(false);
        // Code 1 is a denial, and on Android that is one-shot — say where to
        // fix it rather than inviting a retry that resolves instantly.
        setErrorMsg(
          err.code === 1
            ? "Location permission is off. Turn it on in your device settings, or drag the pin."
            : "Couldn't get your location. Drag the pin instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const handleLocationSelected = (l: number, g: number, addr: string) => {
    setLat(l);
    setLng(g);
    setAddressLine(addr);
  };

  const handleSave = async () => {
    try {
      setErrorMsg("");
      if (editing) {
        // Coordinates are omitted unless the user actually re-pinned: sending
        // the initial 0,0 would move the address to the Gulf of Guinea. The
        // backend keeps the existing point when lat/lng are absent.
        const moved = lat !== 0 || lng !== 0;
        await updateAddress({
          addressId: editing.id,
          label: label.toLowerCase(),
          full_address: addressLine,
          ...(moved ? { lat, lng } : {}),
        });
      } else {
        await addAddress({ label: label.toLowerCase(), full_address: addressLine, lat, lng });
      }
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save address");
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed bottom-0 left-0 right-0 z-50 flex h-[85vh] flex-col rounded-t-3xl border-t border-border bg-card shadow-2xl safe-bottom"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 className="text-lg font-semibold text-foreground">
            {step === "map" ? "Pin Location" : editing ? "Edit Address" : "Address Details"}
          </h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-secondary">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {step === "map" ? (
          <div className="flex-1 flex flex-col relative min-h-0">
            {/* SVC-281: don't mount the map until we know where to open it.
                Rendering first and recentring after would drag the view out
                from under anyone who started moving the pin immediately. */}
            {opening.centre === null ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* AC2: a wrong-city map used to be silent. If we are guessing,
                    name the guess so the user knows to move it rather than
                    trusting a pin 840km from home. */}
                {opening.source === "fallback" && (
                  <div className="border-b border-border bg-secondary px-4 py-3">
                    <p className="text-xs text-muted-foreground">
                      We don&apos;t know where you are yet, so this map is a guess.
                    </p>
                    {/* A button, not a sentence pointing at the small icon
                        inside the map. The provider Location screen has had one
                        since SVC-279; the consumer sheet only had the icon, so
                        the fix for a wrong-city map was hidden in the corner of
                        the wrong-city map. */}
                    <button
                      type="button"
                      onClick={locateMe}
                      disabled={locating}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-2.5 text-sm font-medium text-foreground disabled:opacity-50"
                    >
                      {locating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Navigation className="h-4 w-4 text-primary" />
                      )}
                      {locating ? "Locating…" : "Use my current location"}
                    </button>
                  </div>
                )}
                <MapPicker
                  // `initialCenter` seeds MapPicker's state once, so changing
                  // it cannot move an already-rendered map. Keying on the
                  // coordinates remounts it instead — which is what makes "use
                  // my current location" actually jump the pin rather than
                  // silently fetching a position and doing nothing with it.
                  key={(override ?? opening.centre)?.join(",")}
                  initialCenter={override ?? opening.centre}
                  onLocationSelected={handleLocationSelected}
                />
              </>
            )}
            <div className="p-4 border-t border-border bg-card">
              <button
                onClick={() => setStep("form")}
                className="w-full h-12 bg-primary text-primary-foreground font-semibold rounded-xl"
              >
                Confirm Location
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {errorMsg && (
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
                {errorMsg}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Label</label>
              <div className="flex gap-2">
                {["Home", "Work", "Other"].map((l) => (
                  <button
                    key={l}
                    onClick={() => setLabel(l)}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      label === l
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Complete Address</label>
              <textarea
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[100px]"
                placeholder="House No, Building, Street..."
              />
            </div>

            <div className="mt-auto pt-4">
              <button
                onClick={handleSave}
                disabled={isPending}
                className="w-full flex items-center justify-center h-12 bg-primary text-primary-foreground font-semibold rounded-xl disabled:opacity-70"
              >
                {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save Address"}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </>
  );
}
