/** /operator/pricing opens the first tab (SVC-428). The sidebar and the SP page link here. */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/operator/pricing/")({
  beforeLoad: () => {
    throw redirect({ to: "/operator/pricing/categories", replace: true });
  },
});
