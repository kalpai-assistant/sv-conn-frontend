# Native (iOS / Android) Configuration

This doc covers the Capacitor-generated native projects under `ios/` and `android/` — the parts that live outside the web bundle and won't move when you run `npm run cap:sync`.

If you change a permission, splash screen, deep-link scheme, or app entitlement, **document the change here and run a clean native build before merging**. See [First-build verification](#first-build-verification-sc-68) below.

---

## Prerequisites

Run `npm run doctor` (added in SC-68) to check all of these in one shot.

| Tool        | Version      | Used for                                    | Install                          |
| ----------- | ------------ | ------------------------------------------- | -------------------------------- |
| Node.js     | ≥ 22 (LTS)   | Web build, npm                              | nvm `nvm install --lts`          |
| npm         | ≥ 10         | Package manager                             | bundled with Node                |
| JDK         | **17 or 21** | Android Gradle (Gradle 8.14.3 reqs JDK 17+) | `brew install --cask temurin@17` |
| Android SDK | API 36       | Android build                               | Android Studio → SDK Manager     |
| Xcode       | ≥ 15         | iOS build                                   | Mac App Store                    |
| CocoaPods   | ≥ 1.14       | iOS plugin install                          | `brew install cocoapods`         |

**We use `npm`, not `bun`.** The `bun.lockb` was removed in SC-68. All `package.json` scripts use `npm` under the hood (`cap:sync`, `cap:android`, `cap:ios`). If you see a `bun` command in older docs or branches, it's stale.

---

## Permissions matrix

| Capability            | iOS source                                                                                       | Android source                                                                  | Used by                                   |
| --------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------- |
| Camera                | `Info.plist` → `NSCameraUsageDescription`                                                        | `AndroidManifest.xml` → `android.permission.CAMERA` + `uses-feature`            | KYC capture (SC-26)                       |
| Photo library read    | `Info.plist` → `NSPhotoLibraryUsageDescription`                                                  | `READ_MEDIA_IMAGES` (API 33+) + `READ_EXTERNAL_STORAGE` (API ≤32, maxSdk-gated) | KYC document upload                       |
| Photo library save    | `Info.plist` → `NSPhotoLibraryAddUsageDescription`                                               | not required on Android                                                         | Booking receipt download                  |
| Location (foreground) | `Info.plist` → `NSLocationWhenInUseUsageDescription`                                             | `ACCESS_COARSE_LOCATION` + `ACCESS_FINE_LOCATION`                               | Address picker, real-time tracking (v1.1) |
| Push notifications    | `App.entitlements` → `aps-environment` + `Info.plist` → `UIBackgroundModes: remote-notification` | `POST_NOTIFICATIONS` (API 33+)                                                  | FCM dispatch + booking updates (SC-16)    |
| Network               | implicit                                                                                         | `INTERNET` + `ACCESS_NETWORK_STATE`                                             | All API calls                             |

**Background location is out of scope for beta.** If we add it post-beta (v1.1 real-time tracking), iOS needs `NSLocationAlwaysAndWhenInUseUsageDescription` + `UIBackgroundModes: location`, and Android needs `ACCESS_BACKGROUND_LOCATION` with a separate runtime grant flow.

---

## iOS

### Files of interest

- `ios/App/App/Info.plist` — usage strings, background modes, supported orientations.
- `ios/App/App/App.entitlements` — APNs entitlement. Wired into the Xcode project (`project.pbxproj`) under `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;` for both Target Debug and Release configurations. **Don't remove this entry** — without it the entitlement isn't packaged into the signed binary and push notifications silently fail on real devices. The file isn't listed in Xcode's file navigator (it's referenced by path, not as a `PBXFileReference`), but it still builds.
- `ios/App/App/AppDelegate.swift` — UIApplicationDelegate. No changes needed for SC-67.

### APNs environment

`App.entitlements` ships with `aps-environment = development`. **Before App Store / TestFlight build**, switch to `production` (Xcode usually handles this via build configuration, but verify).

### Push capability in Xcode

Already wired in `project.pbxproj` (Target Debug + Release have `CODE_SIGN_ENTITLEMENTS`). The first time someone opens the project in Xcode:

1. Verify Target App → Signing & Capabilities shows **Push Notifications** and **Background Modes: Remote notifications**. If either is missing, Xcode will offer to add it — accept; this only writes back what's already declared in `App.entitlements` and `Info.plist`.
2. Make sure the development team is selected (depends on your Apple Developer account being active — SC-71).

### Bundle identifier

`com.eazyserv.app` (from `capacitor.config.ts`). Must match the App Store Connect app ID (SC-61).

---

## Android

### Files of interest

- `android/app/src/main/AndroidManifest.xml` — permissions, activity declarations, FileProvider.
- `android/variables.gradle` — SDK versions. Currently:
  - `minSdkVersion = 24` (Android 7.0)
  - `targetSdkVersion = 36`, `compileSdkVersion = 36` — **above Play's required target of 34** ✓
- `android/app/build.gradle` — read SDK versions from `variables.gradle`.

### Runtime permissions

All listed permissions in the manifest are **install-time declarations**. The OS surfaces a runtime prompt only when the app calls the corresponding API the first time:

- Camera, Location, Photo: prompt fires on first plugin call. Capacitor plugins handle the prompt.
- Push notifications (API 33+): `@capacitor/push-notifications` → `requestPermissions()` fires the system prompt. See SC-16.

### Permission rationale (Android best practice)

Before triggering a runtime prompt for Location or Camera the first time, show a one-screen rationale ("we need this because…") so the user understands the ask. Implement in the calling component (e.g., the KYC step in SC-26 should show a rationale sheet before camera open). This is not enforced by the OS but reduces denial rates significantly.

### App signing

Beta uses Play App Signing — see SC-59. Upload key lives in secrets store, not in this repo.

---

## Common gotchas

- **`npm run cap:sync` does not pick up Info.plist changes** if they're inside the file already — it only adds missing keys from `capacitor.config.ts`. Manual edits to Info.plist (like the usage strings here) are preserved across syncs.
- **Xcode "Update to recommended settings"** prompt can rewrite Info.plist on save. If you accept it, re-check the usage strings are still present.
- **AndroidManifest.xml merging** — Capacitor plugins inject their own manifest entries at build time. If a plugin adds a permission you didn't declare here, document it.
- **`npm run cap:sync` regenerates `MainActivity.java` only if it doesn't exist** — safe to edit by hand.
- **Android Studio first-open prompts** for SDK download + license acceptance. Do this once, then `./gradlew` works from the CLI.

---

## Push notifications

### Receiving + routing (SC-69)

`src/lib/notifications.ts` owns the tap → in-app navigation layer.

**Pure mapping** — `routeForPayload({ event, booking_id }, role)` returns the
target route. Exported so it can be unit-tested in isolation once a frontend
test framework lands.

**React glue** — `useNotificationRouter()` is wired from `AppGate` inside
`__root.tsx`. It:

- Lazy-loads `@capacitor/push-notifications` so the web build stays plugin-free.
- Listens for `pushNotificationActionPerformed` (tap on a notification when the
  app is killed or in the background) and navigates per `routeForPayload`.
- Listens for `pushNotificationReceived` (foreground arrival) and only
  auto-navigates for the time-critical `new_request` case. Other foreground
  arrivals are intentionally ignored — the user is presumably already looking
  at the tracking screen and yanking them is jarring.

**Payload contract** — the backend sends `data = { event, booking_id }` on
every booking-lifecycle push (see `backend/app/tasks/notification_tasks.py`).
Capacitor delivers it on `notification.data` for both listener events.

**Event → route:**

| Event         | Provider tap                       | Consumer tap     |
| ------------- | ---------------------------------- | ---------------- |
| `new_request` | `/provider?incomingBookingId={id}` | (impossible)     |
| `accepted`    | `/provider/job/{id}`               | `/tracking/{id}` |
| `en_route`    | `/provider/job/{id}`               | `/tracking/{id}` |
| `in_progress` | `/provider/job/{id}`               | `/tracking/{id}` |
| `completed`   | `/provider/job/{id}`               | `/tracking/{id}` |
| `cancelled`   | `/provider/job/{id}`               | `/tracking/{id}` |
| `expired`     | `/provider/job/{id}`               | `/tracking/{id}` |

`/provider/job/{id}` doesn't exist yet — SC-19 / SC-20 builds it. Until then,
those taps land on the NotFound route. Acceptable for a phased rollout.

**Token registration** is NOT in this lib — that's SC-16 / junior's work. Add
your `requestPermissions()` + `register()` + `PATCH /users/me/fcm-token` flow
in a separate place (e.g. a dedicated FCM hook called from `AppGate` or after
login).

### Out of scope for beta

- **Universal Links / App Links** (web URL → native app handoff). Adds
  `apple-app-site-association` + `assetlinks.json` complexity; not needed
  unless we send links in SMS/email. Post-beta.
- **Background location** while a job is in progress. Tied to the deferred
  v1.1 real-time tracking work.
- **iOS rich notifications** (attachments, actions). Plain push is enough.

---

## First-build verification (SC-68)

### Headless steps (no device required)

These three run anywhere with Node + npm and verify the web bundle integrates
cleanly into both native projects. Last run on `main` 2026-06-28 — all green.

```bash
npm install
npm run build:mobile         # → dist-mobile/
npx cap sync android         # → copies web bundle + registers plugins for Android
npx cap sync ios             # → copies web bundle + registers plugins for iOS
```

Each `cap sync` should end with `Sync finished in <Xs>` and list the registered
plugins. Currently expected on `main`:

- `@capacitor/app`
- `@capacitor/push-notifications`
- `@capacitor/splash-screen`
- `@capacitor/status-bar`
- `@capacitor/camera` (once SVC-93 merges)

### Native build + device install (requires real tooling)

```bash
# Android — requires JDK 17+ and the Android SDK
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

```bash
# iOS — requires macOS + Xcode + CocoaPods
cd ios/App && pod install
open App.xcworkspace          # build + run from Xcode on simulator or device
```

### Walk-through

On a physical device (Android first since iOS needs a paid Apple Dev account):

1. App launches without crash, lands on phone-entry screen.
2. Enter phone → OTP screen appears within 2s.
3. Use the staging OTP (`123456` in dev) → home screen renders with categories.
4. Open a service → BookingSheet opens with addresses + Pay Now.
5. Force-close app, send a test push from Firebase Console with
   `data={event:"new_request", booking_id:"<uuid>"}` → tap the notification →
   app launches and routes to the right screen (SC-69).

Anything that crashes during launch or these flows, file a P0.

### Known gaps blocking full verification

- **Apple Developer org account** (SC-71) — once approved, iOS builds can be
  signed for real-device install. Until then, simulator + free 7-day signing
  only.
- **Google Play Console** (SC-72) — release-signed AAB requires the upload
  keystore. Debug builds don't.
- **APNs auth key** (SC-74) — without it, push notifications fail silently
  on iOS in production. Debug builds work via Firebase Cloud Messaging on
  development tokens.
