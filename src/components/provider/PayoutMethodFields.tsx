import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PayoutMethodFormState } from "@/hooks/usePayoutMethodForm";

// The UPI / bank toggle and its inputs, extracted from the SVC-133 onboarding step
// so the SVC-148 edit screen renders the identical fields instead of a copy that
// drifts. State and validation live in usePayoutMethodForm; this is markup only.
export function PayoutMethodFields({
  form,
  disabled = false,
  idPrefix = "payout",
}: {
  form: PayoutMethodFormState;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const { method, setMethod, vpa, setVpa, accountNumber, setAccountNumber, ifsc, setIfsc, error } =
    form;

  return (
    <div className="space-y-5">
      {/* Method toggle — a provider enters UPI or bank, not both. Sending both in
          one request is a 422, since "which one is active" would have no answer. */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary/50 p-1">
        {(["upi", "bank"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            disabled={disabled}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50",
              method === m
                ? "bg-background text-foreground shadow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "upi" ? "UPI ID" : "Bank account"}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      {method === "upi" ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-vpa`}>UPI ID</Label>
          <Input
            id={`${idPrefix}-vpa`}
            value={vpa}
            onChange={(e) => setVpa(e.target.value)}
            placeholder="name@bank"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
            disabled={disabled}
          />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-account`}>Account number</Label>
            <Input
              id={`${idPrefix}-account`}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Account number"
              inputMode="numeric"
              autoComplete="off"
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-ifsc`}>IFSC code</Label>
            <Input
              id={`${idPrefix}-ifsc`}
              value={ifsc}
              // Upper-cased as they type: the server upper-cases it anyway, and the
              // validation regex is upper-only, so lowercase input would otherwise
              // fail client-side for something the backend would have accepted.
              onChange={(e) => setIfsc(e.target.value.toUpperCase())}
              placeholder="HDFC0001234"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              disabled={disabled}
            />
          </div>
        </>
      )}
    </div>
  );
}
