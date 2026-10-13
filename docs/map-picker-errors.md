# Map-picker error UX

Spike doc (SVC-352). Catalogs every failure class on the address map picker,
proposes copy per class, and names follow-up build tickets. No code shipped
here.

> Scope note: this document covers the *frontend* map picker — the
> `MapPicker` sheet reached from the location gate, `AddAddressSheet`, and
> the provider onboarding service-area step. Backend reachability (CDN,
> Google API quota) is named only where it surfaces in the UI; billing /
> quota ops are not scoped.

## Where the picker lives, and the three ways to reach it

| Entry | File | Why it matters here |
| --- | --- | --- |
| `LocationGate` → "Enter address manually" | [src/components/LocationGate.tsx](../src/components/LocationGate.tsx) | The no-permission escape hatch. The failure modes below cannot deadend here, because this screen is the deadend for everything else. |
| `AddAddressSheet` — Add/Edit address | [src/components/AddAddressSheet.tsx](../src/components/AddAddressSheet.tsx) | Primary consumer path. Pin → reverse-geocode → structured fields. |
| Provider onboarding — `ServiceAreaStep` | [src/components/provider/ServiceAreaStep.tsx](../src/components/provider/ServiceAreaStep.tsx) | No full MapPicker today — just a raw `navigator.geolocation.getCurrentPosition`. Follow-up ticket proposal #3 below. |

Shared surface: [src/components/MapPicker.tsx](../src/components/MapPicker.tsx).
Reverse-geocode + autocomplete loader:
[src/lib/google-maps.ts](../src/lib/google-maps.ts). Native/web location
abstraction: [src/lib/geolocation.ts](../src/lib/geolocation.ts).

## 1. Error-class enumeration

Each row names the error class, where it fires, the current handling, and
whether the current UX is honest. Current handling is cited `file:line` from
`main`.

### A. Geolocation — permission denied (user tapped "Block")

Fires from `MapPicker.handleLocateMe` when `err.code === PERMISSION_DENIED`
at [src/components/MapPicker.tsx:139-158](../src/components/MapPicker.tsx).
Also from `LocationGate.locateMe` (via `requestLocation` →
`permission-denied`) at
[src/components/LocationGate.tsx:303-316](../src/components/LocationGate.tsx).

Current UX: platform-aware toast / banner that names both remedies on web
(fixed in SVC-318). On native, named as "Location is off for this app". The
distinction between "user denied the site" and "device toggle off" is now
read from `permissions.query` **after** the refusal
([src/lib/geolocation.ts:200-208](../src/lib/geolocation.ts),
[src/components/LocationGate.tsx:294-307](../src/components/LocationGate.tsx)) —
the fix from SVC-179 / #179.

### B. Geolocation — permission blocked (insecure context / no API)

Fires when `"geolocation" in navigator` is false (desktop over plain HTTP,
old WebView). Caught in `MapPicker` at
[src/components/MapPicker.tsx:129-132](../src/components/MapPicker.tsx) with
a toast; same guard in `ServiceAreaStep` at
[src/components/provider/ServiceAreaStep.tsx:41-44](../src/components/provider/ServiceAreaStep.tsx).

Not reachable in the shipped PWA (served over HTTPS) or in Capacitor (plugin
always present). Reachable in `npm run dev` on bare `http://localhost:8080`.

### C. Geolocation — device location off / no fix within timeout

Fires at
[src/components/MapPicker.tsx:139-158](../src/components/MapPicker.tsx) via
the generic `else` branch of the `PERMISSION_DENIED` check, and from
`LocationGate.locateMe`'s `location-disabled` + `timeout` branches at
[src/components/LocationGate.tsx:317-319](../src/components/LocationGate.tsx).
The 15s timeout is set at
[src/components/MapPicker.tsx:162](../src/components/MapPicker.tsx) and the
retry-on-timeout policy for the gate at
[src/components/LocationGate.tsx:277-279](../src/components/LocationGate.tsx).

Current UX in `MapPicker`: toast "Couldn't get your location. Move the pin
to set it instead." The pin stays where the map opened and the user can
drag; the picker does not deadend.

### D. Geolocation — timeout vs "silently never resolves" on Android WebView

The native path uses `@capacitor/geolocation` which maps the plugin's
`GLOC-0010` to `"timeout"`
([src/lib/geolocation.ts:114, 123](../src/lib/geolocation.ts)). The *web*
path from `MapPicker.handleLocateMe` goes direct to
`navigator.geolocation.getCurrentPosition`
([src/components/MapPicker.tsx:135](../src/components/MapPicker.tsx)) with a
15s bound. **Historical** (pre-SVC-281): no timeout, which on Android
WebView could silently hang indefinitely — see the comment at
[src/components/MapPicker.tsx:120-124](../src/components/MapPicker.tsx) and
the measurement in
[src/hooks/useLocationAvailability.ts:76-80](../src/hooks/useLocationAvailability.ts)
("still silent at 20s").

The 15s bound in `MapPicker` is independent of the gate's `PROBE_TIMEOUT_MS`
(10s) and the gate's `LOCATE_TIMEOUT_MS` (20s). Three timeouts, three
callers; worth consolidating (follow-up #1).

### E. Google Maps JS SDK — script load failure (CDN unreachable / blocked)

`google-maps.ts` lazy-loads via `importLibrary("geocoding" | "places")`
([src/lib/google-maps.ts:88, 118, 136, 173](../src/lib/google-maps.ts)). On
a failed load the promise rejects and bubbles.

Current handling:
- `MapPicker.fetchAddress` catches the throw at
  [src/components/MapPicker.tsx:74-82](../src/components/MapPicker.tsx) and
  surfaces `GEOCODE_FAILED` ("Could not fetch address"). `AddAddressSheet`
  recognises that constant and blanks the address line
  ([src/components/AddAddressSheet.tsx:183-196](../src/components/AddAddressSheet.tsx))
  rather than storing the failure string as the address.
- `PlacesSearchBar` swallows session-create + prediction + place-details
  failures at
  [src/components/PlacesSearchBar.tsx:60-64](../src/components/PlacesSearchBar.tsx),
  [src/components/PlacesSearchBar.tsx:91-95](../src/components/PlacesSearchBar.tsx),
  and
  [src/components/PlacesSearchBar.tsx:113-117](../src/components/PlacesSearchBar.tsx).
  The bar stays visible, suggestions never populate. User sees a search box
  that doesn't suggest.

### F. Google Maps API — quota / 403 / referrer restriction

Same code path as E: the SDK rejects on the `geocode()` or `getDetails()`
call. In Chrome DevTools these show as `OVER_QUERY_LIMIT`, `REQUEST_DENIED`,
or `UNKNOWN_ERROR`. From the user's seat it looks identical to a CDN block:
`GEOCODE_FAILED` on reverse-geocode and silent empty predictions on
Autocomplete.

**Dashboard-only diagnosis.** Nothing in the UI tells the user vs. us
apart. Flagged below in Found during spike.

### G. Reverse-geocode — "no results"

Google answered with an empty `results` array. `reverseGeocode` returns
`null` at [src/lib/google-maps.ts:91-92](../src/lib/google-maps.ts).
`MapPicker.fetchAddress` reads that as `GEOCODE_UNKNOWN` ("Unknown
Location") at
[src/components/MapPicker.tsx:71](../src/components/MapPicker.tsx) and the
caller recognises it via `isGeocodeFailure`
([src/lib/geocode-result.ts:24-27](../src/lib/geocode-result.ts)) and blanks
the field.

Realistic triggers: pin in the sea, open fields, un-mapped settlements.

### H. Offline (navigator.onLine lies)

`useOnlineStatus` ([src/hooks/useOnlineStatus.ts](../src/hooks/useOnlineStatus.ts),
SVC-351) treats `navigator.onLine === false` as truth and `true` as
unproven — the first fetch's failure is the real signal. The
`LocationGate.offline` branch
([src/components/LocationGate.tsx:341-359](../src/components/LocationGate.tsx))
uses it and skips rendering the map at all.

**Inside `MapPicker`**: no `useOnlineStatus` reference today. A user who
drops offline *while* inside the map picker (sheet already open) sees the
reverse-geocode fail and lands on "Could not fetch address" — no WiFi-off
affordance, no retry CTA. Flagged below.

### I. Capacitor plugin errors on Android

`@capacitor/geolocation` reports codes `GLOC-0003` (denied), `GLOC-0007 /
0017 / 0009` (disabled), `GLOC-0010` (timeout). Mapped at
[src/lib/geolocation.ts:102-114, 116-123](../src/lib/geolocation.ts).
Anything outside the whitelist falls through to `"unavailable"` at
[src/lib/geolocation.ts:142](../src/lib/geolocation.ts), which the gate
copies as "Where are you?" with no accusation. The plugin prefix has
changed between majors before, which is why matching is substring, not
equality ([src/lib/geolocation.ts:95-97](../src/lib/geolocation.ts)).

### J. iOS-specific — read permission, don't guess

`canProbeWithoutGesture()` returns false on iOS web
([src/lib/geolocation.ts:341-344](../src/lib/geolocation.ts)); the gate's
launch probe reads `peekBrowserPermission()` instead of calling
`getCurrentPosition`, because Safari refuses an ungestured call outright and
reports `PERMISSION_DENIED` in 6ms with no prompt shown — history is in
SVC-319 and the follow-ups SVC-318, iOS-permission-read, and
denied-vs-switched-off. The `MapPicker` locate button is user-gestured, so
the probe-vs-ask distinction does not reach the picker itself — but a user
who taps "Enable" on the gate, cancels, falls through to "Enter address
manually", lands here, and taps the picker's own locate button is making
two calls over two surfaces where the first one's result is not threaded
through to the second. Noted; low-impact.

## 2. Per-class copy proposals

Short user-facing lines. Each pairs with an actionable next step. No apology
spiral. All proposed only — nothing shipped in this ticket.

| Class | Headline | Next step |
| --- | --- | --- |
| A — permission denied, native | Location is off for this app. | **Open app settings** (deep link; see follow-up #2) *or* **Move the pin**. |
| A — permission denied, web | Location is blocked for this site. | **Open browser settings** (platform-specific help link) *or* **Move the pin**. |
| B — permission blocked (insecure context) | Location isn't available here. | **Move the pin** (no second CTA — settings cannot fix this). |
| C — device off (native) | Your phone's location is off. | **Turn on Location** (raise system dialog via `enableDeviceLocation` — the SVC-283 pattern already in `LocationGate`). |
| C — device off (web — guessed) | Location Services may be off. | **Try again** *or* **Move the pin**. (Web cannot name the real cause — see SVC-318 note.) |
| D — timeout, Android | Still looking… | **Try again** *or* **Move the pin**. After one retry, demote to C's copy. |
| E — SDK load failure | We can't load the map right now. | **Try again** (one attempt reloads `importLibrary`). If a cached address exists, offer **Use "Home"**. |
| F — API quota / 403 | Address lookup is unavailable right now. | **Try again later**, keep the pin draggable. Operator-facing: Sentry alarm, not user copy. |
| G — reverse-geocode no results | We can't name this spot. | **Drop pin on the nearest street**, with search bar focused as the alternative. |
| H — offline mid-session | You're offline. | **Try again** when connectivity returns. (`useOnlineStatus` already supports this at the gate — port it into the picker; follow-up #1.) |
| I — Capacitor "unavailable" | Where are you? | Fall through to search bar + drag. No accusation of a specific cause. |
| J — iOS, no prompt possible | Tap to allow location. | Current gate copy ("Where are you?") stands. No change proposed. |

## 3. Frequency ranking (beta)

**Sentry not queried in this spike.** The frontend ships `@sentry/react`
and `VITE_SENTRY_DSN` ([src/lib/sentry.ts](../src/lib/sentry.ts)), but
Sentry's web UI/API isn't reachable from the sandbox I'm writing this in.
Ranking is an educated guess, confidence annotated. **Vipul: before
spawning build tickets, cross-check the top-3 against the Sentry
`geolocation`/`google-maps` tags for a 7-day window.**

| Rank | Class | Est. frequency | Confidence |
| --- | --- | --- | --- |
| 1 | A — permission denied (web + native combined) | High | High. Primary complaint pattern driving SVC-179/#179/#178. |
| 2 | D — timeout on cold-start Android | High | High. Measured spread 1ms–8256ms + "still silent at 20s" in [useLocationAvailability.ts:76-80](../src/hooks/useLocationAvailability.ts). |
| 3 | C — device off (native) | Medium | Medium-high. SVC-283 ticket history + the enable-device-location dialog shipped specifically because this was common. |
| 4 | G — reverse-geocode no results | Medium | Medium. India coverage is good; mostly rural / sea-pin cases. |
| 5 | H — offline mid-session (not boot) | Medium | Medium. Boot-offline is handled by SVC-351; mid-session isn't instrumented. |
| 6 | E — Google Maps SDK load failure | Low | Low-medium. Depends on corporate / ISP CDN blocks. |
| 7 | J — iOS no-prompt | Low | High. Only affects iOS PWA at launch; MapPicker's locate button is gestured, so iOS is normal here. |
| 8 | F — API quota / 403 | Rare | Medium. Beta volume is below Google's free tier; would spike on a referrer-restriction misconfiguration. |
| 9 | B — insecure-context / no `navigator.geolocation` | Rare | High. PWA is HTTPS, Capacitor plugin always present. Dev-only. |
| 10 | I — Capacitor "unavailable" | Rare | Medium. Catch-all for the long tail of plugin codes we haven't mapped. |

## 4. Android landmines

- **`navigator.onLine === true` through a real cell-signal drop.** Measured
  on OEM WebViews (SVC-351 commit message, [useOnlineStatus.ts:12-18](../src/hooks/useOnlineStatus.ts)).
  **Detect:** React Query `isError` on the first fetch is the real
  "offline"; the hook's `true` is advisory only.
- **Permission `granted` but `getCurrentPosition` hangs.** The WebView's
  own geolocation grant is separate from the app's — Android granted
  `ACCESS_FINE_LOCATION`, the WebView never did
  ([lib/geolocation.ts:9-14](../src/lib/geolocation.ts)). **Detect:** probe
  via `@capacitor/geolocation.checkPermissions()` instead of
  `navigator.permissions.query()`.
- **No `POSITION_UNAVAILABLE`, just a timeout.** Some OEMs don't raise code
  2 even when GPS is physically off; they time out at the client-set bound.
  **Detect:** bound every `getCurrentPosition` call. Any call without an
  explicit `timeout` is a potential infinite spinner (see
  [MapPicker.tsx:120-124](../src/components/MapPicker.tsx) for the fix
  history). Current status: all three callers bound their timeouts.
- **Alert() blocks the WebView.** Not geolocation per se, but historically
  bit `MapPicker` — comment at
  [MapPicker.tsx:116-119](../src/components/MapPicker.tsx). Rule: never
  `alert()` from map code; use `toast`.
- **Cold-start timing is useless.** Four consecutive cold starts on one
  device: 1ms, 43ms, 836ms, 8256ms, location on throughout
  ([useLocationAvailability.ts:76-80](../src/hooks/useLocationAvailability.ts)).
  **Detect:** retry timeouts (the gate already does, 2x); treat first-call
  slowness as warm-up, not evidence.

## 5. iOS landmines

- **Ungestured `getCurrentPosition` on Safari returns PERMISSION_DENIED in
  6ms with no prompt** — see SVC-319 and the fix at
  [lib/geolocation.ts:325-344](../src/lib/geolocation.ts). The picker's
  locate button is user-gestured, so this doesn't bite inside `MapPicker`
  itself. The gate's launch probe is the surface. **Rule:** never trigger
  `requestLocation` from an effect without a user tap on iOS web.
- **`permissions.query` returns `"prompt"` for both "never asked" and
  "device Location Services off".** Measured on iOS 18.7 / Safari 26
  ([lib/geolocation.ts:63-82](../src/lib/geolocation.ts),
  [LocationGate.tsx:294-307](../src/components/LocationGate.tsx)).
  **Detect:** combine the pre-call `permissions.query` with a post-refusal
  re-read and the elapsed-time heuristic (`refusedInstantly`,
  [lib/geolocation.ts:63-82](../src/lib/geolocation.ts)) — the fix from
  SVC-179.
- **PWA vs Capacitor diverge.** On PWA, `@capacitor/geolocation`
  `requestPermissions` throws `unimplemented`
  ([LocationGate.tsx](../src/components/LocationGate.tsx) via `requestLocation` flow at [lib/geolocation.ts:169-182](../src/lib/geolocation.ts)); the code is explicitly native-only. On Capacitor,
  the plugin raises the iOS system sheet. Any new geolocation path must
  branch on `Capacitor.isNativePlatform()` and never call plugin-only methods
  on web — the SVC-318 fix.
- **PlacesService needs a DOM node** for its attribution overlay even when
  no map is rendering — see
  [google-maps.ts:157-160](../src/lib/google-maps.ts). The lazy detached div
  is correct. Rarely-firing bug surface: if a future caller instantiates
  `PlacesService` server-side (SSR) it throws — SSR already short-circuits
  via `typeof window` guards in `useOnlineStatus` but not everywhere.
- **Rarely-firing: Permissions API absent entirely.** Older Safari (< 16)
  threw on `permissions.query({name:"geolocation"})`. Current handling
  returns `null` ([lib/geolocation.ts:378-382](../src/lib/geolocation.ts))
  and the caller treats it as "prompt" — correct, but the long tail of
  Safari-with-no-permissions-API still exists and gets the fallback
  elapsed-time heuristic.

## 6. The "do nothing" case

Not every error class earns bespoke copy. **F (quota/403), I (Capacitor
long-tail "unavailable"), and the long tail of browser-specific oddities
are all fine with the current generic `GEOCODE_FAILED` or "Where are you?"
fallback.** The user is given a draggable pin and a search bar, both of
which work without the device knowing anything about where it is. Spending
UX effort to distinguish a 403 from a CDN block for someone who just needs
to type "Kharadi" is a worse investment than a dashboard alarm on 403s and
leaving the user's screen alone. Vipul's bar for bespoke copy should be:
*does naming this cause change the remedy?* If not, leave it generic.

## 7. Follow-up ticket proposals

Vipul to triage. Not filed by this spike.

### Proposal A — consolidate geolocation timeouts + add `useOnlineStatus` inside `MapPicker`

**Scope:**
- Replace `navigator.geolocation.getCurrentPosition` in
  `MapPicker.handleLocateMe`
  ([MapPicker.tsx:135-163](../src/components/MapPicker.tsx)) with the shared
  `requestLocation` from `lib/geolocation.ts`, so the picker gets the native
  plugin on native and the same web fallback on web.
- Thread `useOnlineStatus` into `MapPicker` and skip the reverse-geocode
  (showing a "You're offline, drop the pin and we'll resolve the address
  when you reconnect" affordance) rather than lighting up
  `GEOCODE_FAILED`.
- One `MAP_PICKER_LOCATE_TIMEOUT_MS` constant instead of the three current
  bounds (15s picker, 20s gate locate, 10s gate probe).

**Non-goals:** redesigning the picker UI; adding an "I'm offline" badge to
the top of the sheet.

**Effort:** 1–2 days (one PR). Includes tests for offline-while-open and
timeout retry.

**Priority:** Medium. Fixes rank-2 (D) and rank-5 (H) at once.

### Proposal B — deep-link to app settings on native permission denial

**Scope:**
- Add a "Open settings" button to the toast / banner on class A (native).
  Capacitor already ships `@capacitor/app` with `openUrl` — the native
  settings schemes are `app-settings:` on iOS and
  `android.settings.APPLICATION_DETAILS_SETTINGS` with the app package on
  Android.
- Fire from both `MapPicker.handleLocateMe` and
  `LocationGate.locateMe`'s denied branch.

**Non-goals:** web (no equivalent); redesigning the error banner.

**Effort:** 0.5–1 day (one PR). Covered by two component tests + one native
smoke-test on each OS.

**Priority:** High for the beta cohort — rank-1 class, and today's remedy
is a sentence the user has to carry over to a settings app they then have
to find.

### Proposal C — upgrade `ServiceAreaStep` to use `MapPicker`

**Scope:**
- Replace `ServiceAreaStep`'s single `getCurrentPosition` call
  ([src/components/provider/ServiceAreaStep.tsx:39-65](../src/components/provider/ServiceAreaStep.tsx))
  with the full `MapPicker` + a radius slider.
- The current code comment at line 15-17 explicitly flags this as a
  follow-up: *"Full map picker + reverse geocode are follow-ups tracked in
  the ticket body."*

**Non-goals:** changing the backend's `service_area_center + radius_km`
model; adding polygon service areas.

**Effort:** 1 day (one PR). Reuses `MapPicker`, `useMapOpeningCentre`,
`handleLocationSelected` patterns from `AddAddressSheet`.

**Priority:** Low-medium. Providers onboard once; the single-call UX is
acceptable but inconsistent with the consumer flow, and a provider dropped
in the wrong place by a bad GPS fix has no visual way to correct it today
(they'd have to leave onboarding and re-enter).

## Found during spike

Not blocking, but surfaced while reading:

- **`MapPicker.fetchAddress` fires once on mount, with no `useOnlineStatus`
  guard** ([MapPicker.tsx:101-104](../src/components/MapPicker.tsx)). A
  user who opens the picker on a dropped connection sees "Fetching
  location…" → "Could not fetch address" with no retry affordance *inside*
  the picker. The gate's offline branch catches the pre-sheet case; the
  post-sheet case is covered only by `AddAddressSheet` blanking the
  address line (SVC-283). Proposal A fixes this.
- **`PlacesSearchBar` fails silently on token-create** at
  [PlacesSearchBar.tsx:60-64](../src/components/PlacesSearchBar.tsx) — a
  user whose Google key is misconfigured sees a search box that just
  doesn't suggest, with no "Autocomplete unavailable" hint. Low-impact: the
  pin-drag path still works, which is the point of the comment at line
  62-64. Noted, not proposed.
- **The 15s timeout in `MapPicker.handleLocateMe` is independent of the
  gate's 20s** ([MapPicker.tsx:162](../src/components/MapPicker.tsx) vs
  [LocationGate.tsx:94](../src/components/LocationGate.tsx)). Not a bug —
  it's shorter because the picker already renders a usable map while the
  locate call runs — but worth a comment so a future refactor doesn't
  "unify" them to a single bound.
- **No `tileerror` handler on the `TileLayer`**
  ([MapPicker.tsx:176-179](../src/components/MapPicker.tsx)). OSM tile CDN
  blocks (seen on some corporate networks) render a grey grid with no
  copy. react-leaflet exposes `eventHandlers.tileerror` on `TileLayer`
  which could toast once. Not proposed as its own ticket; could bundle
  into Proposal A.

**No regressions from prior fixes found.** The SVC-179 denied-vs-switched-off
distinction is intact at
[LocationGate.tsx:294-307](../src/components/LocationGate.tsx); the SVC-319
no-ungestured-probe guard is intact at
[lib/geolocation.ts:341-344](../src/lib/geolocation.ts); the SVC-318
`requestPermissions`-is-native-only guard is intact at
[lib/geolocation.ts:169-182](../src/lib/geolocation.ts).

## Non-goals of this spike

- No code changes anywhere outside this document.
- No Sentry dashboard access during the spike — rankings are educated
  guesses, annotated.
- No proposal to collapse the three timeout bounds into one *in this
  ticket*; that goes with Proposal A.
- No native settings deep-link implemented — Proposal B.
