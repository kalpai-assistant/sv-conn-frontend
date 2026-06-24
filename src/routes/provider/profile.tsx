import { createFileRoute } from "@tanstack/react-router";
import { ServicesPicker } from "@/components/provider/ServicesPicker";

export const Route = createFileRoute("/provider/profile")({
  component: ProviderProfilePage,
});

function ProviderProfilePage() {
  return (
    <div className="min-h-screen p-6">
      <h1 className="text-lg font-semibold text-foreground">Provider Profile</h1>
      <ServicesPicker />
    </div>
  );
}
