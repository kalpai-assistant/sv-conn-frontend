/**
 * SVC-290: the service detail is now a bottom sheet, not a full page.
 *
 * This route survives as a deep-link stub so shared URLs still work — the
 * old shape used to render a full page here, so links posted before SVC-290
 * are already out in the wild. A cold hit lands on Home with the sheet
 * auto-opened for that service id; the URL replaces to `/` so back does not
 * bounce between the redirect and the home the sheet already covers.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServiceSheet } from "@/lib/service-sheet-context";

export const Route = createFileRoute("/service/$serviceId")({
  component: ServiceDeepLinkRedirect,
});

function ServiceDeepLinkRedirect() {
  const { serviceId } = Route.useParams();
  const navigate = useNavigate();
  const { openService } = useServiceSheet();

  useEffect(() => {
    openService(serviceId);
    // `replace` so back doesn't return to this stub and re-open the sheet
    // in an infinite loop.
    void navigate({ to: "/", replace: true });
  }, [serviceId, openService, navigate]);

  return null;
}
