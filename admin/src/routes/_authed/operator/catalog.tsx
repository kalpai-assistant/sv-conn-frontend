import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_authed/operator/catalog")({
  component: () => (
    <PlaceholderPage title="Catalog" description="Service categories and services." />
  ),
});
