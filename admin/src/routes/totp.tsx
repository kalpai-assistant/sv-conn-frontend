import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { AuthCard } from "@/components/AuthCard";
import { TotpCodeForm } from "@/components/TotpCodeForm";
import { getSessionToken } from "@/lib/api";
import { getChallengeToken } from "@/lib/auth";

export const Route = createFileRoute("/totp")({
  beforeLoad: () => {
    if (getSessionToken()) {
      throw redirect({ to: "/" });
    }
    // The challenge is memory-only, so a reload or a pasted URL lands here without one.
    const challenge = getChallengeToken();
    if (!challenge) {
      throw redirect({ to: "/login", search: { reason: "challenge_expired" } });
    }
    return { challenge };
  },
  component: TotpPage,
});

function TotpPage() {
  const { challenge } = Route.useRouteContext();

  return (
    <AuthCard
      title="Enter your code"
      description="Open your authenticator app and enter the 6-digit code for EazyServ Admin."
    >
      <TotpCodeForm challenge={challenge} />
      <Link
        to="/login"
        className="mt-4 block text-center text-sm text-muted-foreground hover:underline"
      >
        Back to sign in
      </Link>
    </AuthCard>
  );
}
