import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_authed/operator/refunds")({
  component: () => (
    <PlaceholderPage title="Refunds" description="Refund requests and their workflow." />
  ),
});
