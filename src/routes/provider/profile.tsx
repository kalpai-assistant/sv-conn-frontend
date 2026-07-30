import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, WalletCards } from "lucide-react";
import { ServicesPicker } from "@/components/provider/ServicesPicker";
import { useProviderProfile } from "@/hooks/useApi";

export const Route = createFileRoute("/provider/profile")({
  component: ProviderProfilePage,
});

function ProviderProfilePage() {
  const { data: profile } = useProviderProfile();

  return (
    <div className="min-h-screen p-6">
      <h1 className="text-lg font-semibold text-foreground">Provider Profile</h1>

      {/* Payout method summary → the SVC-148 edit screen. Shows the active method's
          label inline so the common case (checking where the money goes) needs no tap. */}
      <Link
        to="/provider/payout"
        className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-secondary/50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <WalletCards className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Payout method</p>
            <p className="truncate text-sm text-muted-foreground">
              {profile?.payout_set
                ? (profile.payout_display ??
                  (profile.payout_method === "bank" ? "Bank account on file" : "UPI ID on file"))
                : "Not set up yet"}
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>

      <ServicesPicker />
    </div>
  );
}
