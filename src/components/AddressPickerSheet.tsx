/**
 * Bottom sheet for choosing which saved address a booking (or Home's
 * location context) should use.
 *
 * Distinct from AddAddressSheet, which is the map-based flow for creating a
 * new address. This sheet PICKS from existing addresses; it opens
 * AddAddressSheet on demand for "add new". Split rather than combined
 * because the two flows have opposite ergonomics: pick is a two-tap decision
 * (open → tap the right row → auto-close on select), add is a five-step
 * form. Bundling them would penalise the common case.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { X, MapPin, Plus, Check, Loader2 } from "lucide-react";
import { useSelectedAddress } from "@/hooks/useSelectedAddress";
import { AddAddressSheet } from "./AddAddressSheet";

interface AddressPickerSheetProps {
  onClose: () => void;
}

export function AddressPickerSheet({ onClose }: AddressPickerSheetProps) {
  const { selected, setSelectedId, addresses, isLoading } = useSelectedAddress();
  const [showAdd, setShowAdd] = useState(false);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    // Close on select — matches the mental model of a picker. The picker
    // has done its job the moment the user commits, and holding it open
    // would just add a second dismissal tap.
    onClose();
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-foreground/40"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-h-[75vh] max-w-md flex-col rounded-t-3xl bg-card shadow-2xl safe-bottom"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 className="text-base font-semibold text-foreground">Select address</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary"
            aria-label="Close address picker"
          >
            <X className="h-4 w-4 text-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : addresses && addresses.length > 0 ? (
            <div className="flex flex-col gap-2">
              {addresses.map((addr) => {
                const isSelected = selected?.id === addr.id;
                return (
                  <button
                    key={addr.id}
                    onClick={() => handleSelect(addr.id)}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                      isSelected ? "border-primary bg-accent" : "border-border hover:bg-secondary"
                    }`}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground capitalize">
                        {addr.label}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{addr.full}</p>
                    </div>
                    {isSelected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No saved addresses yet.
            </p>
          )}

          <button
            onClick={() => setShowAdd(true)}
            className="mt-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-border p-3 text-sm font-medium text-muted-foreground hover:bg-secondary"
          >
            <Plus className="h-4 w-4" /> Add new address
          </button>
        </div>
      </motion.div>

      {showAdd && <AddAddressSheet onClose={() => setShowAdd(false)} />}
    </>
  );
}
