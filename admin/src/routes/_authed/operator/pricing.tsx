import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_authed/operator/pricing")({
  component: () => (
    <PlaceholderPage title="Pricing" description="Reference prices and pricing configuration." />
  ),
});
