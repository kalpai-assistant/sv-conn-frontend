/**
 * Thin embedded map strip at the top of the provider job screen
 * (SVC-493, Priority Surface 4).
 *
 * Why this exists: the current job screen is text-only; a provider
 * taps Navigate and lives in Google Maps for the whole travel leg,
 * returning via back-button. UC Partner keeps a thin map pinned so
 * the provider stays inside the app during travel. This is the
 * reciprocal of the consumer's `TrackingMap`: provider pin + customer
 * pin, read-only, same Leaflet + OSM tiles (no paid API).
 *
 * `JobAddress`'s "Navigate" hand-off stays live below the map — the
 * audit explicitly called it supplemental, not a replacement. The
 * floating "Open in Maps" chip over the map is a convenience; the
 * bigger button under it is the one most providers will tap.
 *
 * Failure modes locked by this component:
 *   - no coords on the customer address (older rows, un-geocoded
 *     entries): render nothing. A map centred on null-island is
 *     worse than silence; the JobAddress block below still carries
 *     the address string + Navigate hand-off.
 *   - provider coords unknown (geolocation denied / mocked on web):
 *     map renders with just the customer pin — the strip still
 *     answers "where is the job" even if it can't answer "where
 *     am I relative to it".
 *   - OSM tile CDN block (seen on corporate networks per SVC-357):
 *     `tileerror` is silent here — this is a glance strip, not the
 *     onboarding picker. The grey grid reads as "map didn't load"
 *     and the provider still has JobAddress + Navigate to fall
 *     back on. One toast on this surface would stack with the
 *     consumer-side tracking map in multi-tab flows.
 *   - Framer-motion-disabled-in-tests: no motion is used here on
 *     purpose; the strip is a static visual anchor, nothing to
 *     animate. One less surface to mock.
 *
 * Capacitor trap guarded: Leaflet is imported client-side only;
 * this component has `"use client"` semantics because any route
 * that renders it goes through the SPA mobile build, which skips
 * SSR. (The SSR config bails on Leaflet — see CLAUDE.md.)
 */
import { ExternalLink, MapPin, Navigation } from "lucide-react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { divIcon } from "leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";

import { EtaChip } from "@/components/provider/EtaChip";
import type { Address } from "@/lib/mock-data";
import { useT } from "@/i18n/LanguageProvider";

const STRIP_HEIGHT_PX = 160;

// Customer pin: brand-blue dot with a white halo. Matches the existing
// TrackingMap marker shape so a provider who also tracks their own
// consumer bookings sees one visual language. Hex literal is tolerated
// here because Leaflet's divIcon HTML renders before Tailwind utility
// classes resolve — the CSS variable approach doesn't survive the
// handoff. See CLAUDE.md on tokens-vs-leaflet.
const CUSTOMER_ICON = divIcon({
  className: "sc-marker-customer",
  html: `<div style="
    width: 32px; height: 32px; border-radius: 999px;
    background: white;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 10px rgba(25,87,210,0.35);
    border: 3px solid #1957D2;
  "><div style="
    width: 10px; height: 10px; border-radius: 999px;
    background: #1957D2;
  "></div></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Provider pin: inverted — filled brand blue with a white dot — so the
// two pins never look identical on a glance. Deliberately NOT the
// MapPicker/Navigate chevron icon (reserved for the "where I'm going"
// signal in other surfaces).
const PROVIDER_ICON = divIcon({
  className: "sc-marker-provider",
  html: `<div style="
    width: 32px; height: 32px; border-radius: 999px;
    background: #1957D2;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 10px rgba(25,87,210,0.5);
    border: 3px solid white;
  "><div style="
    width: 10px; height: 10px; border-radius: 999px;
    background: white;
  "></div></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

/**
 * Keep the map centred on the midpoint between pins so both are
 * visible when the provider moves — on static mode the useEffect
 * fires once; on live-location updates (future wire-up via
 * backend/app/routers/tracking.py), it re-centres on each render.
 */
function FitBothPins({ a, b }: { a: [number, number]; b: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (b) {
      const bounds: [[number, number], [number, number]] = [
        [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
        [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
      ];
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } else {
      map.setView(a, 15);
    }
  }, [a, b, map]);
  return null;
}

function directionsUrl(address: Address): string {
  const destination =
    address.lat != null && address.lng != null
      ? `${address.lat},${address.lng}`
      : encodeURIComponent(address.full);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

export function JobMapStrip({
  customerAddress,
  providerLocation,
  distanceKm,
}: {
  customerAddress: Address;
  /**
   * The provider's current lat/lng, if the app has it. Live tracking
   * is not wired in Phase 4 — a static snapshot is enough to carry
   * the strip's value (provider glance: "am I heading the right way,
   * roughly"). When `null` the map still renders with just the
   * customer pin + ETA chip (if distance supplied).
   */
  providerLocation?: { lat: number; lng: number } | null;
  /**
   * Straight-line distance from provider to customer, in km. Passed
   * through to `EtaChip`; both EtaChip's null-handling and this
   * component's are independent — the strip can render without ETA
   * (nothing to show), and ETA can render below the map without the
   * strip.
   */
  distanceKm?: number | null;
}) {
  const { t } = useT("provider");

  // Customer coords are the anchor. Without them the whole strip is
  // not worth rendering — the JobAddress tile below still answers
  // where the job is, via its text + Navigate hand-off.
  const customerLat = customerAddress.lat;
  const customerLng = customerAddress.lng;
  if (customerLat == null || customerLng == null) return null;

  const customerPin: [number, number] = [customerLat, customerLng];
  const providerPin: [number, number] | null =
    providerLocation != null ? [providerLocation.lat, providerLocation.lng] : null;

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border"
      style={{ height: STRIP_HEIGHT_PX }}
      role="region"
      aria-label={t("jobDetail.mapAriaLabel")}
    >
      <MapContainer
        center={customerPin}
        zoom={14}
        zoomControl={false}
        dragging={false}
        touchZoom={false}
        doubleClickZoom={false}
        scrollWheelZoom={false}
        boxZoom={false}
        keyboard={false}
        attributionControl={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={customerPin} icon={CUSTOMER_ICON} />
        {providerPin && <Marker position={providerPin} icon={PROVIDER_ICON} />}
        <FitBothPins a={customerPin} b={providerPin} />
      </MapContainer>

      {/* ETA chip on the top-left. `pointer-events-none` so it never
          intercepts a tap intended for the map (which is disabled for
          interaction anyway, but future-proofs it). */}
      {distanceKm != null && (
        <div className="pointer-events-none absolute left-3 top-3 z-[500]">
          <EtaChip distanceKm={distanceKm} />
        </div>
      )}

      {/* Floating "Open in Maps" chip bottom-right. Supplemental to
          the JobAddress Navigate button below — some providers tap
          the map first instead of scrolling. `z-[500]` beats Leaflet's
          default control layer (z-index 400). */}
      <a
        href={directionsUrl(customerAddress)}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-3 right-3 z-[500] inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-md hover:bg-accent dark:bg-card dark:text-foreground"
      >
        <Navigation className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        <span>{t("jobDetail.mapOpenInMaps")}</span>
        <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      </a>

      {/* Legend badge: two-dot key, bottom-left. Keeps a glance-only
          surface interpretable without a tutorial. `pointer-events-none`
          so it can't eat taps. Icons kept inline SVG so they match the
          Leaflet divIcon palette one-to-one. */}
      <div
        className="pointer-events-none absolute bottom-3 left-3 z-[500] inline-flex items-center gap-2 rounded-full bg-card/90 px-2.5 py-1 text-[11px] text-foreground shadow-sm dark:bg-card/90"
        aria-hidden="true"
      >
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-primary bg-background" />
          <span>{t("jobDetail.mapLegendYou")}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3 text-primary" />
          <span>{t("jobDetail.mapLegendCustomer")}</span>
        </span>
      </div>
    </div>
  );
}
