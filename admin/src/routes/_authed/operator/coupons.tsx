import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_authed/operator/coupons")({
  component: () => <PlaceholderPage title="Coupons" description="Create and manage coupons." />,
});
