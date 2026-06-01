import { useEffect, useState } from "react";
import { X, MapPin, Plus, Clock, CreditCard, Banknote, Loader2 } from "lucide-react";
import type { Service } from "@/lib/mock-data";
import { useAddresses } from "@/hooks/useApi";
import { motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { apiFetch } from "@/lib/api";
import { AddAddressSheet } from "./AddAddressSheet";

interface BookingSheetProps {
  service: Service;
  onClose: () => void;
}

export function BookingSheet({ service, onClose }: BookingSheetProps) {
  const { data: addresses, isLoading: loadingAddresses } = useAddresses();
  const [selectedAddress, setSelectedAddress] = useState<string>("");

  // Default to the first saved address once they load.
  useEffect(() => {
    if (!selectedAddress && addresses && addresses.length > 0) {
      setSelectedAddress(addresses[0]?.id ?? "");
    }
  }, [addresses, selectedAddress]);
  const [scheduleType, setScheduleType] = useState<"now" | "later">("now");
  const [paymentMethod, setPaymentMethod] = useState<"online" | "cash">("online");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showAddAddress, setShowAddAddress] = useState(false);
  const navigate = useNavigate();

  const platformFee = Math.round(service.price * 0.2);
  const total = service.price + platformFee;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      const scheduledAt =
        scheduleType === "now"
          ? new Date(Date.now() + 30 * 60000).toISOString() // 30 mins from now
          : new Date(Date.now() + 24 * 60 * 60000).toISOString(); // Tomorrow

      const response = await apiFetch<any>("/bookings/", {
        method: "POST",
        body: JSON.stringify({
          service_id: service.id,
          address_id: selectedAddress,
          scheduled_at: scheduledAt,
          payment_method: paymentMethod,
        }),
      });

      if (response && response.id) {
        navigate({ to: "/tracking/$bookingId", params: { bookingId: response.id } });
      } else {
        throw new Error("Invalid response");
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to confirm booking. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 flex items-end bg-foreground/40"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-card p-5 pb-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4">
            <h2 className="text-lg font-semibold text-foreground">Confirm Booking</h2>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              {errorMsg}
            </div>
          )}

          {/* Service */}
          <div className="rounded-xl bg-accent/50 p-3 mb-4">
            <p className="text-sm font-semibold text-foreground">{service.name}</p>
            <p className="text-xs text-muted-foreground">{service.duration}</p>
          </div>

          {/* Address */}
          <div className="mb-4">
            <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-primary" /> Select Address
            </p>
            <div className="flex flex-col gap-2">
              {loadingAddresses ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : addresses && addresses.length > 0 ? (
                addresses.map((addr) => (
                  <button
                    key={addr.id}
                    disabled={isSubmitting}
                    onClick={() => setSelectedAddress(addr.id)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      selectedAddress === addr.id ? "border-primary bg-accent" : "border-border"
                    }`}
                  >
                    <p className="text-sm font-medium text-foreground">{addr.label}</p>
                    <p className="text-xs text-muted-foreground">{addr.full}</p>
                  </button>
                ))
              ) : (
                <div className="text-sm text-muted-foreground p-2">No saved addresses.</div>
              )}
              <button
                disabled={isSubmitting}
                onClick={() => setShowAddAddress(true)}
                className="flex items-center gap-2 rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground"
              >
                <Plus className="h-4 w-4" /> Add New Address
              </button>
            </div>
          </div>

          {/* Schedule */}
          <div className="mb-4">
            <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-primary" /> When
            </p>
            <div className="flex gap-2">
              {(["now", "later"] as const).map((type) => (
                <button
                  key={type}
                  disabled={isSubmitting}
                  onClick={() => setScheduleType(type)}
                  className={`flex-1 rounded-xl border p-3 text-center text-sm font-medium transition-colors ${
                    scheduleType === type
                      ? "border-primary bg-accent text-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {type === "now" ? "Now (Instant)" : "Schedule Later"}
                </button>
              ))}
            </div>
          </div>

          {/* Payment */}
          <div className="mb-4">
            <p className="text-sm font-semibold text-foreground mb-2">Payment Method</p>
            <div className="flex gap-2">
              <button
                disabled={isSubmitting}
                onClick={() => setPaymentMethod("online")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors ${
                  paymentMethod === "online"
                    ? "border-primary bg-accent text-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                <CreditCard className="h-4 w-4" /> Pay Online
              </button>
              <button
                disabled={isSubmitting}
                onClick={() => setPaymentMethod("cash")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors ${
                  paymentMethod === "cash"
                    ? "border-primary bg-accent text-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                <Banknote className="h-4 w-4" /> Cash
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-xl bg-accent/50 p-3 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Service amount</span>
              <span className="text-foreground font-medium">₹{service.price}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Platform fee</span>
              <span className="text-foreground font-medium">₹{platformFee}</span>
            </div>
            <div className="mt-2 border-t border-border pt-2 flex justify-between text-base font-semibold">
              <span className="text-foreground">Total</span>
              <span className="text-primary">₹{total}</span>
            </div>
          </div>

          {/* Confirm */}
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || !selectedAddress}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground text-base disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Confirm Booking
          </button>
        </motion.div>
      </motion.div>

      {showAddAddress && <AddAddressSheet onClose={() => setShowAddAddress(false)} />}
    </>
  );
}
