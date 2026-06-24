import { createFileRoute } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { useProviderProfile } from "@/hooks/useApi";

export const Route = createFileRoute("/provider/")({
  component: ProviderHomePage,
});

function ProviderHomePage() {
  const { data: profile } = useProviderProfile();

  return (
    <div className="min-h-screen p-6">
      <h1 className="text-lg font-semibold text-foreground">Provider Home</h1>

      {profile?.kyc_status === "submitted" && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-900">Pending verification</p>
            <p className="text-amber-800">
              Your documents are under review. You can start taking jobs once your KYC is verified.
            </p>
          </div>
        </div>
      )}

      <p className="mt-4 text-sm text-muted-foreground">Coming soon.</p>
    </div>
  );
}
