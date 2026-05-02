import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { MapPicker } from "./MapPicker";
import { useAddAddress } from "@/hooks/useApi";

export function AddAddressSheet({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"map" | "form">("map");
  const [lat, setLat] = useState(0);
  const [lng, setLng] = useState(0);
  const [addressLine, setAddressLine] = useState("");
  const [label, setLabel] = useState("Home");
  const { mutateAsync: addAddress, isPending } = useAddAddress();
  const [errorMsg, setErrorMsg] = useState("");

  const handleLocationSelected = (l: number, g: number, addr: string) => {
    setLat(l);
    setLng(g);
    setAddressLine(addr);
  };

  const handleSave = async () => {
    try {
      setErrorMsg("");
      await addAddress({ label: label.toLowerCase(), full_address: addressLine, lat, lng });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save address");
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
            {step === "map" ? "Pin Location" : "Address Details"}
          </h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-secondary">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {step === "map" ? (
          <div className="flex-1 flex flex-col relative min-h-0">
            <MapPicker onLocationSelected={handleLocationSelected} />
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
