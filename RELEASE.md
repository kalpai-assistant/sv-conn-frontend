# Eazyserv — Android release build runbook

Beta ships via direct APK on `eazyserv.com/download` — no Play Store. This
doc covers the signed-APK build side (SVC-160). PWA "release" is just a
Cloudflare deploy of the web build; nothing to sign.

> **TL;DR for shipping**: cutting a release is a single `gh workflow run` — jump to [Shipping a release APK — the automated path](#shipping-a-release-apk--the-automated-path-svc-2272). The sections below are for local development of the release build (keystore setup, first-time bootstrap, debugging).

## What you need on your machine

- **JDK 21 specifically**: `brew install --cask temurin@21`. Do not
  install the unversioned `temurin` cask — it grabs the latest JDK
  (currently 26) which is newer than Gradle 8.14.3 and AGP support.
  You'll get "Unsupported class file major version 70" from `gradlew`
  if you use anything past 24. Java 21 is the AGP-recommended LTS.
- After install, in `~/.zshrc`:
  ```bash
  export JAVA_HOME=$(/usr/libexec/java_home -v 21)
  export PATH="$JAVA_HOME/bin:$PATH"
  ```
  Verify `./gradlew --version` shows `JVM: 21.x.x` — if it shows 26,
  `JAVA_HOME` isn't wired.
- Android Studio installed, plus the Android SDK it manages
- The release keystore (see below)

## Keystore setup — one time, per developer who ships releases

The keystore is **not** in the repo. Each shipping developer keeps a copy
locally + the canonical copy lives in 1Password ("Eazyserv ops" vault).

### 1. Get the keystore file

Ask Vipul for the `eazyserv-release.jks` file (via 1Password share, never
a plaintext channel). Put it at:

```
frontend/android/keystore/eazyserv-release.jks
```

Verify:

```bash
keytool -list -v \
  -keystore frontend/android/keystore/eazyserv-release.jks \
  -alias eazyserv
```

Enter the store password when prompted. You should see the certificate
block. If it errors, the file is corrupt or the password is wrong — stop.

### 2. Create `android/keystore.properties`

```bash
cp frontend/android/keystore.properties.example \
   frontend/android/keystore.properties
```

The example values already match the recommended layout. Passwords are
NOT in this file — Gradle reads them from env vars (see next step). Both
`keystore.properties` and `*.jks` are `.gitignore`d.

### 3. Export the two passwords

Add to your `~/.zshrc` (or `~/.bashrc`):

```bash
export ANDROID_KEYSTORE_STORE_PASSWORD='<store-password>'
export ANDROID_KEYSTORE_KEY_PASSWORD='<key-password>'
```

Then `source ~/.zshrc` and verify:

```bash
echo "${#ANDROID_KEYSTORE_STORE_PASSWORD} ${#ANDROID_KEYSTORE_KEY_PASSWORD}"
```

Should print two numbers (the char-lengths, not the passwords). Zero =
not exported. Anything else = you're good.

### 4. Verify Gradle sees everything

```bash
cd frontend
npm run build:mobile   # produce dist-mobile/
npx cap sync android
cd android
./gradlew assembleRelease
```

The build should succeed and print roughly:

```
> Task :app:packageRelease
> Task :app:assembleRelease
BUILD SUCCESSFUL
```

Output: `frontend/android/app/build/outputs/apk/release/app-release.apk`.

Confirm it's signed with the right cert:

```bash
"$ANDROID_HOME/build-tools/34.0.0/apksigner" verify --print-certs \
  frontend/android/app/build/outputs/apk/release/app-release.apk
```

Should print your DN (Eazyserv, Bangalore, IN, …). If it says
"DOES NOT VERIFY", something in the signing config is wrong.

**Failure mode we deliberately want:** if any of `keystore.properties`,
the `.jks` file, or the two env-var passwords is missing,
`assembleRelease` **fails**. It does not silently fall back to debug
signing — a debug-signed APK looks fine locally but installs as a
debug build in prod, and there's no way to update it in place with a
real release later.

## Shipping a release APK — the automated path (SVC-227.2)

**As of 2026-08-21, cutting a release is a single `gh workflow run`.** The whole thing above (JDK + keystore + Gradle + S3 upload) is only for **local** development of the release build. Actual production releases go through `.github/workflows/release-apk.yml`, which is preferred for everything except keystore debugging.

### Ritual (every release)

1. **Bump versions** in two files, commit + merge to main:

   `src/lib/version.ts`:
   ```typescript
   export const APP_VERSION = "1.0.4-beta";
   ```

   `android/app/build.gradle`:
   ```groovy
   versionCode 5              // +1 every release — monotonic
   versionName "1.0.4-beta"
   ```

2. **Dispatch**:
   ```bash
   gh workflow run release-apk.yml \
     --repo kalpai-assistant/sv-conn-frontend \
     -f version=1.0.4-beta \
     -f release_notes="Back button + cart footer fixes"
   ```

### What the workflow does (~5 min end-to-end)

1. `npm ci` + `npm run build:mobile` + `npx cap sync android`
2. Materialises the keystore from `secrets.ANDROID_KEYSTORE_B64`, exports the two password env vars
3. `./gradlew assembleRelease` — signed APK at `android/app/build/outputs/apk/release/app-release.apk`
4. `apksigner verify` sanity check (rejects debug-signed builds)
5. Uploads TWO S3 keys via OIDC assume-role:
   - `s3://eazyserv-downloads/apk/eazyserv-<version>.apk` — immutable versioned
   - `s3://eazyserv-downloads/apk/latest.apk` — mutable pointer, cache 5 min
6. Calls `POST /api/v1/admin/app-versions/android/release` on the backend with `X-Internal-Release-Token` (read from SSM inline) — bumps `app_versions.android` + enqueues FCM broadcast
7. The Celery worker (`eazyserv-worker`, SVC-228) picks up the broadcast task, fans out FCM pushes to every consumer's device
8. Users see the push notification in seconds; the in-app nudge (SVC-226) shows on tap or next foreground

### Workflow inputs

| Input | Required | Default | Notes |
|---|---|---|---|
| `version` | ✅ | — | SemVer. Must match `versionName` from step 1. |
| `release_notes` | ⬜ | `""` | Plain text shown in the nudge. Keep short. |
| `notify` | ⬜ | `true` | Set `false` for validation-only runs from a feature branch — won't touch beta's `app_versions`, won't push. |
| `min_supported_version` | ⬜ | (unchanged) | **Emergency hard-block lever.** Anyone below gets a no-dismiss modal until they update. Don't touch unless there's a critical bug in the wild. |

### The rare case where you still need this doc's manual path

You'd only fall back to the sections above when:
- Debugging the keystore or signing config (production build fails locally)
- Cutting a one-off APK for a specific tester without publishing (`gh workflow run ... -f notify=false` almost always covers this)
- The workflow itself is broken and you need to unblock a release urgently

## GitHub Actions secrets already configured

For reference (don't rotate without coordinating):
- `ANDROID_KEYSTORE_B64` — base64 of `eazyserv-release.jks`
- `ANDROID_KEYSTORE_STORE_PASSWORD`
- `ANDROID_KEYSTORE_KEY_PASSWORD`
- `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` — for the web deploy workflow, not APK

## Known follow-ups (open tickets)

- **Bundle-ID rename.** `android/app/build.gradle` still declares
  `com.serviceconnect.app` for `namespace` + `applicationId`, but the
  Firebase project (SVC-156) and Capacitor config (`capacitor.config.ts`)
  use `com.eazyserv.app`. Push delivery will not work until these align.
  Requires renaming `android/app/src/main/java/com/serviceconnect/` →
  `com/eazyserv/` and updating the package declarations in every Java
  file under it. Filed separately from SVC-160.
- Automated S3 upload from CI on tag push — replaces steps 3–4 above.

## Losing the keystore

If you actually lose it AND every backup:

- Every installed instance of Eazyserv is now uninstall-only. There is
  no rotation path for an installed Android app that changes its
  signing key. Every user must download the new APK from scratch.
- Generate a new keystore, bump `versionCode`, push the new APK, and
  broadcast: "Please uninstall Eazyserv from your phone, then download
  and reinstall from eazyserv.com/download."
- Post-mortem the loss. Two backups minimum going forward.
