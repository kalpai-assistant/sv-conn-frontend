import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_authed/analytics/overview")({
  component: () => <PlaceholderPage title="Overview" description="GMV, take rate and retention." />,
});
