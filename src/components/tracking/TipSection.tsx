/**
 * Consumer tip UI — a chip row for common amounts, a custom option,
 * and a live-updated line that shows what the pro will receive.
 *
 * 100% of the amount flows to the provider (matches
 * ``backend/app/models/coupon.py`` docstring). Editable after
 * submission — a second submit *replaces* rather than accumulates,
 * mirroring the server semantics (see PR #77's
 * ``BookingService.set_tip``).
 *
 * Rendered on the tracking page below the payment block once the
 * booking is COMPLETED. Deliberately separate from ReviewSheet: the
 * two are related in the wireframe but they're independent actions
 * on the backend (a consumer who skips leaving a review can still
 * tip, and vice versa), and combining them would tempt UI code into
 * one-must-imply-the-other assumptions.
 */
import { useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSetTip } from "@/hooks/useSetTip";
import { formatRupees } from "@/lib/currency";

interface TipSectionProps {
  bookingId: string;
  currentTip: number;
}

const CHIP_AMOUNTS = [20, 50, 100] as const;

export function TipSection({ bookingId, currentTip }: TipSectionProps) {
  const setTip = useSetTip();
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const submit = async (amount: number) => {
    try {
      await setTip.mutateAsync({ bookingId, amount });
      setShowCustom(false);
      setCustomValue("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to set tip. Please try again.";
      toast.error(msg);
    }
  };

  const handleCustomSubmit = () => {
    const n = Number(customValue);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    // Backend caps at ₹10,000; catch that at the boundary too so the
    // user gets a specific message rather than a generic 422.
    if (n > 10_000) {
      toast.error("Tips are capped at ₹10,000");
      return;
    }
    submit(n);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
          <Heart className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Add a tip</p>
          <p className="text-xs text-muted-foreground">
            100% goes to your pro. Optional; you can change it any time before payout.
          </p>
        </div>
      </div>

      {/* Chip row + custom trigger. Selected chip highlights so the
          current tip is always obvious — including "no tip" (all chips
          off). */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        <ChipButton
          label="Skip"
          selected={currentTip === 0 && !showCustom}
          disabled={setTip.isPending}
          onClick={() => submit(0)}
        />
        {CHIP_AMOUNTS.map((n) => (
          <ChipButton
            key={n}
            label={formatRupees(n)}
            selected={currentTip === n && !showCustom}
            disabled={setTip.isPending}
            onClick={() => submit(n)}
          />
        ))}
      </div>

      {/* Custom row. Only shown after the user asks for it, since 90%+
          will pick one of the chips. */}
      {!showCustom ? (
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className="mt-3 w-full text-center text-xs font-medium text-primary"
        >
          Or enter a custom amount
        </button>
      ) : (
        <div className="mt-3 flex gap-2">
          <div className="flex flex-1 items-center gap-1 rounded-xl border border-border px-3 py-2">
            <span className="text-sm font-medium text-muted-foreground">₹</span>
            <input
              type="number"
              inputMode="numeric"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              placeholder="Amount"
              className="flex-1 bg-transparent text-sm outline-none"
              autoFocus
            />
          </div>
          <button
            onClick={handleCustomSubmit}
            disabled={!customValue || setTip.isPending}
            className="flex items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {setTip.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </button>
        </div>
      )}

      {/* Current-state line. Reads live from the booking so a page
          refresh (or an update from another surface) reflects here. */}
      {currentTip > 0 && (
        <p className="mt-3 text-center text-xs text-success">
          Thank you! Tipped {formatRupees(currentTip)}
        </p>
      )}
    </section>
  );
}

function ChipButton({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-11 rounded-xl border text-sm font-medium transition-colors disabled:opacity-50 ${
        selected
          ? "border-primary bg-accent text-foreground"
          : "border-border text-muted-foreground hover:border-primary"
      }`}
    >
      {label}
    </button>
  );
}
