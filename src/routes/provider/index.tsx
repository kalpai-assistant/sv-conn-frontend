import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/provider/")({
  component: ProviderHomePage,
});

function ProviderHomePage() {
  return (
    <div className="min-h-screen p-6">
      <h1 className="text-lg font-semibold text-foreground">Provider Home</h1>
      <p className="mt-2 text-sm text-muted-foreground">Coming soon.</p>
    </div>
  );
}
