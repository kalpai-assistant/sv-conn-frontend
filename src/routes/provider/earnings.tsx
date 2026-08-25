import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/provider/earnings")({
  component: ProviderEarningsPage,
});

function ProviderEarningsPage() {
  return (
    <div className="min-h-screen p-6">
      <h1 className="text-lg font-semibold text-foreground">Earnings</h1>
      <p className="mt-2 text-sm text-muted-foreground">Coming soon.</p>
    </div>
  );
}
