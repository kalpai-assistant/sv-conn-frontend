# Eazyserv — Android release build runbook

Beta ships via direct APK on `eazyserv.com/download` — no Play Store. This
doc covers the signed-APK build side (SVC-160). PWA "release" is just a
Cloudflare deploy of the web build; nothing to sign.

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

## Shipping a release APK to `/download`

_Filed as a follow-up: automated S3 upload from CI. Until then, manual:_

1. Bump `versionCode` + `versionName` in `android/app/build.gradle`.
   `versionName` must match the `latest` row in the backend's
   `app_versions` table (SVC-162) — otherwise the version-check nudge
   fires on the freshly-updated build.
2. `./gradlew assembleRelease` (see above).
3. Rename: `mv app-release.apk eazyserv-<versionName>.apk`.
4. Upload to `s3://eazyserv-downloads/apk/eazyserv-<versionName>.apk`
   + `s3://eazyserv-downloads/apk/latest.apk` (the `/download` page
   links to the `latest.apk` URL directly).
5. Update the backend `app_versions` row: bump `version` (and
   `min_supported_version` only if this release is a hard-required
   upgrade). The `/downloads/latest.json` cache is 5 min at edge; the
   in-app version-check hits it on every foreground event.
6. Manually install the APK on a real Android device before announcing
   — Android side-load rejects any signing-key mismatch with a
   "package appears to be invalid" error that is very confusing to
   testers. Verifying locally first catches this.

## For CI (once we get there)

- Base64 the keystore: `base64 -i eazyserv-release.jks -o keystore.b64`
- GitHub secrets:
  - `ANDROID_KEYSTORE_B64` — the base64 blob above
  - `ANDROID_KEYSTORE_STORE_PASSWORD`
  - `ANDROID_KEYSTORE_KEY_PASSWORD`
- CI decodes at build time and drops the file where
  `keystore.properties` expects it:
  ```bash
  mkdir -p frontend/android/keystore
  echo "$ANDROID_KEYSTORE_B64" | base64 -d \
    > frontend/android/keystore/eazyserv-release.jks
  cp frontend/android/keystore.properties.example \
     frontend/android/keystore.properties
  ```

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
