import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MapPicker } from "@/components/MapPicker";
import { useMapOpeningCentre } from "@/hooks/useMapOpeningCentre";
import { useUpdateServiceArea } from "@/hooks/useApi";
import { errorText } from "@/i18n/errors";
import { useT } from "@/i18n/LanguageProvider";

/**
 * SVC-257 → SVC-358: "Where do you work?" onboarding step. Captures the
 * provider's service-area centre + radius, then PATCHes /providers/me. Without
 * this, the PostGIS dispatch renders the provider invisible to every incoming
 * booking — the go-online toggle refuses with `SERVICE_AREA_MISSING` and this
 * step re-appears.
 *
 * Originally a single `getCurrentPosition` call: whatever the first GPS fix
 * returned became the saved centre, with no visual correction. SVC-352 catalogued
 * the failure modes — a provider inside a mall, in a basement, or with a stale
 * cached fix was dropped at the wrong pin with no way to correct it short of
 * leaving onboarding and finding the eventual Service Location screen. This
 * step now mounts the same `MapPicker` the address screens use so the provider
 * sees where the pin is before they confirm it.
 *
 * Reuses the exact AddAddressSheet pattern (SVC-281/SVC-283): `useMapOpeningCentre`
 * walks permission → saved address → fallback so the map opens somewhere the
 * provider recognises before they do anything. The hook returns `null` while
 * it is still resolving — mounting the map before it answers would drag the
 * view out from under a provider who started moving the pin immediately.
 *
 * Radius bounds (SVC-358): 1–25km. The backend validator in
 * `app/schemas/provider.py::ProviderUpdate` accepts 1–100, so the ceiling is a
 * product choice — onboarding promotes a tight starting radius a provider
 * expands later from the Service Location screen, rather than letting them
 * commit to a 50km catchment on day one.
 */

const RADIUS_MIN_KM = 1;
const RADIUS_MAX_KM = 25;
const RADIUS_DEFAULT_KM = 10;

export function ServiceAreaStep({
  initialLat,
  initialLng,
  initialRadiusKm,
  onBack,
  onDone,
}: {
  initialLat?: number | null;
  initialLng?: number | null;
  initialRadiusKm?: number;
  onBack: () => void;
  onDone: () => void;
}) {
  const updateServiceArea = useUpdateServiceArea();
  const opening = useMapOpeningCentre();
  // Our labels only (SVC-376): the map, the geocoder's place names and the
  // fallback city stay as the map gives them.
  const { t, lang } = useT("provider");

  // `picked` is set as the provider moves the pin (or confirms a map-opened
  // centre by actually touching the map). `userMoved` guards against the
  // mount-time reverse-geocode report MapPicker fires for its own default
  // centre — see the provider/location.tsx screen for the full story. The
  // same bug applies here: if the hook falls back to Bangalore for a provider
  // in Pune and we treat the mount-time report as a choice, Save becomes a
  // one-tap 840km relocation.
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(
    initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null,
  );
  const [radiusKm, setRadiusKm] = useState<number>(initialRadiusKm ?? RADIUS_DEFAULT_KM);
  const [error, setError] = useState<string | null>(null);
  const userMoved = useRef(false);

  // Where to open the map. A caller-supplied centre (editing an existing area
  // mid-onboarding, re-entering the step) wins outright — it is a point the
  // provider already confirmed, not an inference. Otherwise defer to the hook,
  // which may still be resolving — the map stays unmounted while `centre` is
  // null so it never renders somewhere wrong.
  const seededCentre: [number, number] | null =
    initialLat != null && initialLng != null ? [initialLat, initialLng] : null;
  const openingCentre = seededCentre ?? opening.centre;
  const hasSeededCentre = seededCentre !== null;

  const handleLocationSelected = (lat: number, lng: number) => {
    // Same guard as provider/location.tsx: MapPicker reverse-geocodes its own
    // opening centre on mount and reports it, so we hear about a centre nobody
    // moved. Accepting that would enable Continue and let a provider confirm
    // a fallback (Bangalore) as their service area with no interaction.
    if (!hasSeededCentre && !userMoved.current) return;
    setPicked({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });
  };

  const save = async () => {
    setError(null);
    if (picked === null) {
      setError(t("serviceArea.pinRequired"));
      return;
    }
    try {
      await updateServiceArea.mutateAsync({
        service_area_lat: picked.lat,
        service_area_lng: picked.lng,
        service_area_radius_km: radiusKm,
      });
      onDone();
    } catch (err) {
      setError(errorText(err, t("serviceArea.saveFailed"), lang));
    }
  };

  const saving = updateServiceArea.isPending;
  const canSave = picked !== null && !saving;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("serviceArea.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("serviceArea.intro")}</p>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      <div className="space-y-2">
        <Label>{t("serviceArea.centre")}</Label>
        {/* Same banner the address sheet shows when the hook falls back to a
            constant: name the guess so the provider knows to move the pin
            rather than confirming a city they do not work in. */}
        {!hasSeededCentre && opening.source === "fallback" && (
          <p className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
            {t("serviceArea.fallback", { place: opening.fallbackLabel })}
          </p>
        )}
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="h-64">
            {openingCentre === null ? (
              // Hook still resolving. Mounting MapPicker now and recentring
              // after would drag the view out from under a provider who starts
              // moving the pin immediately — the SVC-281 problem.
              <div className="flex h-full items-center justify-center bg-muted">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <MapPicker
                // Keyed on the opening coordinates so a late-arriving seeded
                // centre remounts the map rather than drifting a mounted one.
                key={openingCentre.join(",")}
                initialCenter={openingCentre}
                onLocationSelected={handleLocationSelected}
                onUserMoved={() => {
                  userMoved.current = true;
                }}
              />
            )}
          </div>
        </div>
        {picked !== null && (
          <p className="text-xs text-muted-foreground">
            {t("serviceArea.savedCentre")}{" "}
            <span className="font-mono">
              {picked.lat.toFixed(4)}, {picked.lng.toFixed(4)}
            </span>
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="radius">{t("serviceArea.travel")}</Label>
          <span className="text-sm font-medium text-foreground">
            {t("serviceArea.km", { km: radiusKm })}
          </span>
        </div>
        <input
          id="radius"
          type="range"
          min={RADIUS_MIN_KM}
          max={RADIUS_MAX_KM}
          step={1}
          value={radiusKm}
          onChange={(e) => setRadiusKm(Number(e.target.value))}
          className="w-full accent-primary"
          aria-label={t("serviceArea.radiusLabel")}
        />
        <p className="text-xs text-muted-foreground">{t("serviceArea.outside")}</p>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          {t("serviceArea.back")}
        </Button>
        <Button className="flex-1" disabled={!canSave} onClick={save}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("serviceArea.continue")}
        </Button>
      </div>
    </div>
  );
}
