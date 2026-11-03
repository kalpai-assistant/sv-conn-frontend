import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_authed/operator/kyc")({
  component: () => (
    <PlaceholderPage
      title="KYC"
      description="Review and approve service-provider KYC submissions."
    />
  ),
});
