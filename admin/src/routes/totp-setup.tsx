import { useEffect, useState } from "react";
import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { AuthCard } from "@/components/AuthCard";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { TotpCodeForm } from "@/components/TotpCodeForm";
import { ApiError, getSessionToken } from "@/lib/api";
import { authErrorMessage, clearChallenge, getChallengeToken, startTotpSetup } from "@/lib/auth";

export const Route = createFileRoute("/totp-setup")({
  beforeLoad: () => {
    if (getSessionToken()) {
      throw redirect({ to: "/" });
    }
    const challenge = getChallengeToken();
    if (!challenge) {
      throw redirect({ to: "/login", search: { reason: "challenge_expired" } });
    }
    return { challenge };
  },
  component: TotpSetupPage,
});

function TotpSetupPage() {
  const { challenge } = Route.useRouteContext();
  const navigate = useNavigate();
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // startTotpSetup shares one call per challenge, so StrictMode's second
    // effect gets the same QR rather than a new secret. `attempt` only re-runs
    // this after a failure, once the failed call has been forgotten.
    startTotpSetup(challenge).then(
      (url) => {
        if (!cancelled) setOtpauthUrl(url);
      },
      (err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === "INVALID_CHALLENGE") {
          clearChallenge();
          void navigate({ to: "/login", search: { reason: "challenge_expired" }, replace: true });
        } else if (err instanceof ApiError && err.code === "TOTP_ALREADY_ACTIVE") {
          void navigate({ to: "/totp", replace: true });
        } else {
          setError(authErrorMessage(err));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [challenge, navigate, attempt]);

  return (
    <AuthCard
      title="Set up your authenticator"
      description="Scan the QR code with an authenticator app, then enter the 6-digit code it shows."
    >
      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        />
      ) : otpauthUrl ? (
        <div className="space-y-4">
          {/* White behind the code whatever the theme, or a dark-mode QR won't scan. */}
          <div className="flex justify-center rounded-lg bg-white p-3">
            <QRCodeSVG value={otpauthUrl} size={192} title="Authenticator QR code" />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Can&apos;t scan it? Enter this key:</p>
            <code
              data-testid="totp-setup-key"
              className="block select-all break-all rounded-md bg-muted px-3 py-2 font-mono text-sm"
            >
              {new URL(otpauthUrl).searchParams.get("secret")}
            </code>
          </div>
          <TotpCodeForm challenge={challenge} />
        </div>
      ) : (
        <LoadingState />
      )}
      <Link
        to="/login"
        className="mt-4 block text-center text-sm text-muted-foreground hover:underline"
      >
        Back to sign in
      </Link>
    </AuthCard>
  );
}
