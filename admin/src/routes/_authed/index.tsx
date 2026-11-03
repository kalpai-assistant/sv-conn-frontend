import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authed/")({
  component: () => (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Admin console</h1>
      <p className="text-sm text-muted-foreground">
        Pick a screen from the sidebar. Every screen is a placeholder for now.
      </p>
      {/* Brand check (SVC-421 acceptance): must paint in the shared primary blue. */}
      <Button>Primary action</Button>
    </div>
  ),
});
