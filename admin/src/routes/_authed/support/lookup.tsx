import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_authed/support/lookup")({
  component: () => (
    <PlaceholderPage title="Lookup" description="Find a booking or user by phone or booking ID." />
  ),
});
