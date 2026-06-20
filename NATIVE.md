# Native (iOS / Android) Configuration

This doc covers the Capacitor-generated native projects under `ios/` and `android/` — the parts that live outside the web bundle and won't move when you run `bun cap:sync`.

If you change a permission, splash screen, deep-link scheme, or app entitlement, **document the change here and run a clean native build before merging**. See [SC-68](../SPRINTS_M2.md) for the first-build verification procedure.

---

## Permissions matrix

| Capability | iOS source | Android source | Used by |
|---|---|---|---|
| Camera | `Info.plist` → `NSCameraUsageDescription` | `AndroidManifest.xml` → `android.permission.CAMERA` + `uses-feature` | KYC capture (SC-26) |
| Photo library read | `Info.plist` → `NSPhotoLibraryUsageDescription` | `READ_MEDIA_IMAGES` (API 33+) + `READ_EXTERNAL_STORAGE` (API ≤32, maxSdk-gated) | KYC document upload |
| Photo library save | `Info.plist` → `NSPhotoLibraryAddUsageDescription` | not required on Android | Booking receipt download |
| Location (foreground) | `Info.plist` → `NSLocationWhenInUseUsageDescription` | `ACCESS_COARSE_LOCATION` + `ACCESS_FINE_LOCATION` | Address picker, real-time tracking (v1.1) |
| Push notifications | `App.entitlements` → `aps-environment` + `Info.plist` → `UIBackgroundModes: remote-notification` | `POST_NOTIFICATIONS` (API 33+) | FCM dispatch + booking updates (SC-16) |
| Network | implicit | `INTERNET` + `ACCESS_NETWORK_STATE` | All API calls |

**Background location is out of scope for beta.** If we add it post-beta (v1.1 real-time tracking), iOS needs `NSLocationAlwaysAndWhenInUseUsageDescription` + `UIBackgroundModes: location`, and Android needs `ACCESS_BACKGROUND_LOCATION` with a separate runtime grant flow.

---

## iOS

### Files of interest

- `ios/App/App/Info.plist` — usage strings, background modes, supported orientations.
- `ios/App/App/App.entitlements` — APNs entitlement. **New file.** Must be referenced from the Xcode project (`ios/App/App.xcodeproj/project.pbxproj`) under `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;` for both Debug and Release configurations. **This is a follow-up step that requires opening Xcode** — `bun cap:sync` will not wire it up.
- `ios/App/App/AppDelegate.swift` — UIApplicationDelegate. No changes needed for SC-67.

### APNs environment

`App.entitlements` ships with `aps-environment = development`. **Before App Store / TestFlight build**, switch to `production` (Xcode usually handles this via build configuration, but verify).

### Push capability in Xcode

After opening Xcode for the first time:
1. Target App → Signing & Capabilities → `+ Capability` → Push Notifications.
2. This automatically updates the entitlements file and provisioning profile.
3. Background Modes capability → enable **Remote notifications** (matches `UIBackgroundModes` in Info.plist).

### Bundle identifier

`com.serviceconnect.app` (from `capacitor.config.ts`). Must match the App Store Connect app ID (SC-61).

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

- **`bun cap:sync` does not pick up Info.plist changes** if they're inside the file already — it only adds missing keys from `capacitor.config.ts`. Manual edits to Info.plist (like the usage strings here) are preserved across `cap:sync` runs.
- **Xcode "Update to recommended settings"** prompt can rewrite Info.plist on save. If you accept it, re-check the usage strings are still present.
- **AndroidManifest.xml merging** — Capacitor plugins inject their own manifest entries at build time. If a plugin adds a permission you didn't declare here, document it.
- **`bun cap:sync` regenerates `MainActivity.java` only if it doesn't exist** — safe to edit by hand.

---

## First-build verification (SC-68)

Procedure:

```bash
# Android
bun run build:mobile
bun cap:sync android
cd android && ./gradlew assembleDebug
# Install APK on physical device: android/app/build/outputs/apk/debug/app-debug.apk
```

```bash
# iOS
bun run build:mobile
bun cap:sync ios
cd ios/App && pod install
open App.xcworkspace   # build + run from Xcode on simulator or device
```

Walk the happy path on a real device. Anything that crashes, file a P0.
