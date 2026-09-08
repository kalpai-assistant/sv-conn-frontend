import { useState } from "react";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { X, Loader2 } from "lucide-react";
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
                  <p className="bg-secondary px-4 py-2 text-xs text-muted-foreground">
                    Showing {opening.fallbackLabel} — drag the pin or tap the locate button to set
                    your area.
                  </p>
                )}
                <MapPicker
                  initialCenter={opening.centre}
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
