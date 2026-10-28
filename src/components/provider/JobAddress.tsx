import { MapPin, Navigation2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Address } from "@/lib/mock-data";
import { useT } from "@/i18n/LanguageProvider";

/**
 * Where the job is, plus a hand-off to the device maps app (SVC-171).
 *
 * The text alone doesn't finish the job: a provider who has to retype a
 * free-text Indian address into Google Maps and trust its geocoder is the
 * failure SVC-170 exists to remove. So coordinates are used when the consumer's
 * address was geocoded, and the address string is the fallback when it wasn't —
 * which is exactly why the backend types `lat`/`lng` nullable rather than
 * refusing to answer.
 *
 * One universal Google Maps URL rather than per-platform `geo:` / `maps:`
 * schemes: it opens the native app on both Android and iOS when installed, and
 * degrades to the browser in the PWA, so the web and Capacitor builds behave the
 * same without a platform check.
 */
function directionsUrl(address: Address): string {
  const destination =
    address.lat != null && address.lng != null
      ? `${address.lat},${address.lng}`
      : encodeURIComponent(address.full);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

export function JobAddress({
  address,
  showNavigate = true,
}: {
  address: Address;
  showNavigate?: boolean;
}) {
  const { t } = useT();
  // `null` address is only reachable on the admin bulk listing, never on the
  // routes this screen calls — so an absent address is a bug to stay quiet about,
  // not an empty state to design.
  if (!address.full) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex gap-3">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          {address.label && (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {address.label}
            </p>
          )}
          <p className="mt-0.5 text-sm text-foreground">{address.full}</p>
        </div>
      </div>

      {showNavigate && (
        <Button asChild variant="outline" className="mt-3 w-full">
          {/* Leaves the app, so it opens in a new context rather than replacing it. */}
          <a href={directionsUrl(address)} target="_blank" rel="noopener noreferrer">
            <Navigation2 className="h-4 w-4" />
            {t("job.navigate")}
          </a>
        </Button>
      )}
    </div>
  );
}
