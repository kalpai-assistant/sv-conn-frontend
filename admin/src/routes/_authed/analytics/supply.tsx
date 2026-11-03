import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_authed/analytics/supply")({
  component: () => <PlaceholderPage title="Supply" description="Supply gaps and provider churn." />,
});
