import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useUpdatePayout } from "@/hooks/useApi";
import { validateVpa, validateAccountNumber, validateIfsc } from "@/lib/payout-validation";

type Method = "upi" | "bank";

// SVC-133 — the "How should we pay you?" onboarding step. Collects a UPI VPA or
// bank account + IFSC, validates client-side (mirroring the backend so we don't
// hit a 422), and saves via PATCH /providers/me. Skippable during onboarding.
export function PayoutStep({
  alreadySet,
  onBack,
  onDone,
}: {
  alreadySet: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const updatePayout = useUpdatePayout();
  const [method, setMethod] = useState<Method>("upi");
  const [vpa, setVpa] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectMethod = (next: Method) => {
    setMethod(next);
    setError(null);
  };

  const handleContinue = async () => {
    setError(null);
    let payload;
    if (method === "upi") {
      const err = validateVpa(vpa);
      if (err) return setError(err);
      payload = { payout_vpa: vpa.trim() };
    } else {
      const accErr = validateAccountNumber(accountNumber);
      if (accErr) return setError(accErr);
      const ifscErr = validateIfsc(ifsc);
      if (ifscErr) return setError(ifscErr);
      payload = {
        payout_account_number: accountNumber.trim(),
        payout_ifsc: ifsc.trim().toUpperCase(),
      };
    }
    try {
      await updatePayout.mutateAsync(payload);
      onDone();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn’t save your payout details. Try again.",
      );
    }
  };

  const saving = updatePayout.isPending;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">How should we pay you?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a UPI ID or bank account so we can send your earnings. You can skip this and add it
          later.
        </p>
      </div>

      {alreadySet && (
        <p className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground">
          A payout method is already on file. Enter a new one to replace it, or skip.
        </p>
      )}

      {/* Method toggle — a provider picks UPI or bank, not both. */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary/50 p-1">
        {(["upi", "bank"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => selectMethod(m)}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
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
          <Label htmlFor="vpa">UPI ID</Label>
          <Input
            id="vpa"
            value={vpa}
            onChange={(e) => setVpa(e.target.value)}
            placeholder="name@bank"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
          />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="account">Account number</Label>
            <Input
              id="account"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Account number"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ifsc">IFSC code</Label>
            <Input
              id="ifsc"
              value={ifsc}
              onChange={(e) => setIfsc(e.target.value.toUpperCase())}
              placeholder="HDFC0001234"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </>
      )}

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack} disabled={saving}>
          Back
        </Button>
        <Button className="flex-1" onClick={handleContinue} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & continue"}
        </Button>
      </div>
      <Button variant="ghost" className="w-full" onClick={onDone} disabled={saving}>
        Skip for now
      </Button>
    </div>
  );
}
