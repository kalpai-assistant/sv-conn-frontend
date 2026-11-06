/** The 6-digit code entry, shared by /totp and /totp-setup (SVC-422). */
import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { authErrorMessage, clearChallenge, verifyTotp } from "@/lib/auth";

const CODE_LENGTH = 6;

export function TotpCodeForm({ challenge }: { challenge: string }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (code.length !== CODE_LENGTH || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await verifyTotp(challenge, code);
      await navigate({ to: "/", replace: true });
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.code === "INVALID_CHALLENGE") {
        clearChallenge();
        await navigate({ to: "/login", search: { reason: "challenge_expired" }, replace: true });
        return;
      }
      if (err instanceof ApiError && err.code === "TOTP_SETUP_REQUIRED") {
        await navigate({ to: "/totp-setup", replace: true });
        return;
      }
      if (err instanceof ApiError && err.code === "INVALID_TOTP_CODE") {
        // A wrong code and one used in the last 120 s are the same error.
        setError("That code is wrong or was just used. Wait for the next code and try again.");
      } else {
        setError(authErrorMessage(err));
      }
      setCode("");
      inputRef.current?.focus();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="totp-code">6-digit code</Label>
        <Input
          ref={inputRef}
          id="totp-code"
          value={code}
          // Pasted codes often arrive as "123 456".
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          className="text-center font-mono tracking-widest"
        />
      </div>
      <Button type="submit" className="w-full" disabled={code.length !== CODE_LENGTH || submitting}>
        {submitting ? "Verifying…" : "Verify"}
      </Button>
    </form>
  );
}
