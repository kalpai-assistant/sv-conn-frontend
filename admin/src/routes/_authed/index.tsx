import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/")({
  component: () => (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Admin console</h1>
      <p className="text-sm text-muted-foreground">Pick a screen from the sidebar.</p>
    </div>
  ),
});
