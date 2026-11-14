import { useState, type FormEvent } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { AuthCard } from "@/components/AuthCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSessionToken } from "@/lib/api";
import { authErrorMessage, clearChallenge, login } from "@/lib/auth";

/** Why someone was sent here. Text is looked up, so a crafted link can't inject any. */
const REASONS = {
  session_expired: "Your session has ended. Please sign in again.",
  challenge_expired: "Your sign-in timed out. Please sign in again.",
  logout_unconfirmed:
    "You're signed out in this tab, but the server couldn't confirm it. That session stays valid until it expires.",
};

type LoginReason = keyof typeof REASONS;

function isLoginReason(value: unknown): value is LoginReason {
  return typeof value === "string" && Object.hasOwn(REASONS, value);
}

export const Route = createFileRoute("/login")({
  // Explicitly undefined rather than omitted: the router merges this over the
  // raw URL params, so leaving a bad value out would let it through.
  validateSearch: (search: Record<string, unknown>): { reason?: LoginReason } => ({
    reason: isLoginReason(search.reason) ? search.reason : undefined,
  }),
  beforeLoad: () => {
    if (getSessionToken()) {
      throw redirect({ to: "/" });
    }
    // Back at the first step, so any half-finished login is abandoned.
    clearChallenge();
  },
  component: LoginPage,
});

function LoginPage() {
  const { reason }: { reason?: LoginReason } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { setupRequired } = await login(email, password);
      await navigate({ to: setupRequired ? "/totp-setup" : "/totp" });
    } catch (err) {
      setError(authErrorMessage(err));
      setPassword("");
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Sign in">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          reason && (
            <Alert>
              <AlertDescription>{REASONS[reason]}</AlertDescription>
            </Alert>
          )
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}
