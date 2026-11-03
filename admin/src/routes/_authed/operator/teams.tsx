import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_authed/operator/teams")({
  component: () => (
    <PlaceholderPage title="Teams" description="Service-provider and Pro directory." />
  ),
});
