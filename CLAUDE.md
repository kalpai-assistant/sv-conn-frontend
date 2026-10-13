# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## First-time setup (Windows or macOS)

The dev loop is identical either OS — only the shell + package manager differ. Note where relevant.

### 1. Install prerequisites

**macOS** (Homebrew):
```bash
brew install node          # Node 22, matches .nvmrc
brew install --cask temurin@21   # JDK 21 for release builds (see RELEASE.md)
brew install awscli uv           # AWS CLI + uv (uv runs the AWS MCP for Claude Code)
```

**Windows** (PowerShell, elevated):
```powershell
winget install OpenJS.NodeJS.LTS
winget install Amazon.AWSCLI
winget install astral-sh.uv
winget install Git.Git             # if you don't have it
# JDK 21 for release builds:
winget install EclipseAdoptium.Temurin.21.JDK
```

Close + reopen the terminal so PATH updates take effect. Verify:
```bash
node --version   # v22.x
aws --version
uv --version
```

### 2. Clone + env

```bash
git clone https://github.com/kalpai-assistant/sv-conn-frontend
cd sv-conn-frontend
cp .env.example .env        # macOS
# Copy-Item .env.example .env   # PowerShell
```

Edit `.env` — the only line you need to change to point at beta:
```
VITE_API_BASE_URL=https://api.eazyserv.com/api/v1
```
Everything else (Firebase, Sentry, Razorpay) is optional — the app runs without them. If you need the location gate to work (address search + reverse geocoding), follow the `aws ssm get-parameter` one-liner in the `VITE_GOOGLE_MAPS_BROWSER_API_KEY` block of `.env.example` to pull the same key CI uses.

### 3. Run

```bash
npm ci
npm run dev
# → http://localhost:8080 talking to the beta backend
```

### 4. AWS credentials (needed for OTP-during-testing, see below)

Ask the tech lead to create a scoped IAM user for you. Once you have the keys:
```bash
aws configure --profile eazyserv
#   AWS Access Key ID:     <from 1Password>
#   AWS Secret Access Key: <from 1Password>
#   Default region:        ap-south-1
#   Default output format: json
```

Verify: `aws sts get-caller-identity --profile eazyserv` → your user ARN.

**Windows**: also run `setx AWS_PROFILE eazyserv` (persists across sessions; needs a new terminal to take effect) so the AWS MCP for Claude Code auto-picks the profile.

### 5. AWS MCP for Claude Code

Add to `~/.claude.json` (`$env:USERPROFILE\.claude.json` on Windows) under `mcpServers`:

```json
"aws-mcp": {
  "command": "uvx",
  "args": [
    "mcp-proxy-for-aws@latest",
    "https://aws-mcp.us-east-1.api.aws/mcp",
    "--metadata",
    "INSTALL_SOURCE=aws-cli"
  ]
}
```

Restart Claude Code. `uvx` fetches the proxy on first invocation.

## Getting the OTP during testing (beta only)

MSG91 SMS delivery is blocked on DLT approval (SVC-225). Until it clears, the backend logs OTPs at INFO level and no SMS is sent. The log line is gated behind the `LOG_MOCK_OTP` env var (SVC-265) — it must be `true` in App Runner env for beta, or nothing shows up in CloudWatch. Grab the OTP from CloudWatch:

```bash
aws logs tail /aws/apprunner/eazyserv-backend/7f383544153d4cf799fba30ced3ae033/application \
  --since 5m --filter-pattern "MOCK OTP" --region ap-south-1 --profile eazyserv
```

The log line format: `Use 123456 to login for +91XXXXXXXXXX`.

Any Indian mobile number (`+91XXXXXXXXXX`) works — no per-user allowlist. The OTP is valid for 10 min, rate-limited to 5 attempts per phone per hour.

**PowerShell tip** — save as a function in `$PROFILE`:
```powershell
function Get-OTP {
    aws logs tail /aws/apprunner/eazyserv-backend/7f383544153d4cf799fba30ced3ae033/application `
        --since 5m --filter-pattern "MOCK OTP" --region ap-south-1 --profile eazyserv
}
```
Then just `Get-OTP` from any prompt.

## Cutting a release (SVC-227.2 — one command)

Every release is a single `gh workflow run`. The workflow builds the signed APK, uploads to S3, bumps the backend `app_versions` row, and fires an FCM push to every device (users see "Update available" in their notification shade even if the app is closed).

### Prereqs

- GitHub CLI: `brew install gh` / `winget install GitHub.cli`
- `gh auth login` (walks you through OAuth once)

### Ritual (every release)

**1. Bump versions** in two files, commit + merge to main:

`src/lib/version.ts`:
```typescript
export const APP_VERSION = "1.0.4-beta";
```

`android/app/build.gradle`:
```groovy
versionCode 5              // +1 every release — Android refuses to install a lower/equal code
versionName "1.0.4-beta"
```

**2. Dispatch the release**:

```bash
gh workflow run release-apk.yml \
  --repo kalpai-assistant/sv-conn-frontend \
  -f version=1.0.4-beta \
  -f release_notes="Back button + cart footer fixes"
```

`bash` uses `\` for line continuation; PowerShell uses backtick (`` ` ``).

### What the params do

| Param | Required | Default | Notes |
|---|---|---|---|
| `version` | ✅ | — | SemVer. Uploaded to S3 as `apk/eazyserv-<version>.apk` (immutable, versioned) + overwrites `apk/latest.apk`. Must match `versionName` in `build.gradle` from step 1. |
| `release_notes` | ⬜ | `""` | Plain text shown in the in-app nudge on every device. Keep it short — one sentence. |
| `notify` | ⬜ | `true` | Set `false` for validation-only runs (won't touch beta's `app_versions`, won't push). Rare. |
| `min_supported_version` | ⬜ | (unchanged) | **Emergency hard-block.** Anyone below this version gets a full-screen modal with no dismiss until they update. Don't touch unless there's a critical bug. |

### What happens end-to-end (~5 min total)

1. Workflow builds signed APK (~4 min)
2. Uploads to S3 — both versioned + `latest.apk`
3. Calls backend release endpoint with `X-Internal-Release-Token` → bumps `app_versions.android` + enqueues FCM broadcast
4. Celery worker fires the FCM push within seconds
5. Users see:
   - System push notification "Update available" (even if app closed)
   - In-app nudge on next foreground / open
   - Tap → in-app progress bar → Install → done

### GitHub UI alternative

Actions tab → **Release APK to S3** → **Run workflow** → fill inputs → **Run**. Same result if you prefer clicking.

### More on release infra

- Signed-APK setup (keystore, JDK 21, first-time developer bootstrap): see [RELEASE.md](RELEASE.md)
- In-app APK download plugin: `android/app/src/main/java/com/eazyserv/apkupdater/` (SVC-226)
- Release endpoint auth: SVC-227.2 — the workflow reads `INTERNAL_RELEASE_TOKEN` from AWS SSM at run time. Your local machine never needs the token.

## Cutting a Play Store build (SVC-122 — AAB, parallel to APK)

Play Store requires AAB (Android App Bundle), not APK. The AAB pipeline is **parallel** to the APK one — the APK ritual above stays the primary distribution channel for direct / sideload testers; the AAB pipeline exists to feed Play's Internal Testing track once SVC-78 (Play Console service account) lands.

Both pipelines sign with the **same keystore** — do NOT create a separate AAB signing key. Matching SHA-256 fingerprints is a prerequisite for Play App Signing enrollment later.

### Ritual

```bash
gh workflow run release-aab.yml \
  --repo kalpai-assistant/sv-conn-frontend \
  -f version=1.0.11-beta
```

| Param | Required | Default | Notes |
|---|---|---|---|
| `version` | ✅ | — | SemVer. Same value as the APK release — must match `versionName` in `build.gradle`. |
| `track` | ⬜ | `internal` | `internal` / `alpha` / `beta` / `production`. Only `internal` is wired today; the rest are reserved for the SVC-78 follow-up. |

### What the workflow produces

- `s3://eazyserv-downloads/aab/eazyserv-<version>.aab` (immutable, versioned)
- `s3://eazyserv-downloads/aab/latest.aab` (mutable pointer, cache 5 min)
- GitHub Actions artifact `eazyserv-<version>-aab` on the workflow run — 30-day retention — so you can download the signed AAB without S3 read access.

The workflow does **not** call the backend release endpoint. Play handles its own update prompt; firing an FCM push on a Play release would double-notify.

### Interim upload path (until SVC-78 completes)

Automated Play Console upload is blocked on SVC-78 (service-account provisioning). Until that lands:

1. Run `gh workflow run release-aab.yml -f version=...` as above.
2. Open the workflow run on GitHub → Artifacts → download `eazyserv-<version>-aab`.
3. In Play Console, go to the app → Internal testing → Create new release → upload the AAB.

Once SVC-78 lands, uncomment the `# TODO SVC-78` block at the bottom of `.github/workflows/release-aab.yml` and the pipeline will push directly to the Internal track. The commented stub already shows the exact shape (uses `r0adkll/upload-google-play@v1` reading `PLAY_SERVICE_ACCOUNT_JSON` from SSM).

### Verifying signing parity with the APK

After the first AAB build, confirm its SHA-256 matches the APK's — if they diverge, Play App Signing enrollment will fail later:

```bash
# From a built AAB (either downloaded artifact or `aws s3 cp` the S3 key locally):
keytool -printcert -jarfile app-release.aab | grep -i SHA256
```

Compare against:
```bash
"$ANDROID_HOME/build-tools/34.0.0/apksigner" verify --print-certs app-release.apk \
  | grep -i "SHA-256"
```

They MUST match. If they don't, something is wrong with the signing config and the AAB will not be acceptable to Play.

## Commands

```bash
# Development
npm run dev              # Vite dev server (web)

# Building
npm run build            # Production web build → dist/
npm run build:dev        # Dev-mode web build
npm run build:mobile     # Capacitor SPA build → dist-mobile/

# Lint & format
npm run lint             # ESLint + TypeScript
npm run format           # Prettier

# Tests
npm test                 # Vitest (jsdom + @testing-library/react)

# Mobile (Capacitor)
npm run cap:sync         # Build mobile + sync to native projects
npm run cap:android      # Build + open Android Studio
npm run cap:ios          # Build + open Xcode
```

## Tests

Vitest with jsdom, run by `npm test`. Config lives in `vitest.config.ts`, kept separate from `vite.config.ts` because the app config loads the TanStack Start SSR plugin and the Cloudflare plugin, neither of which a component test survives.

CI runs three checks, and all three are worth running locally before pushing — a typecheck failure only CI sees costs a round trip:

```bash
npx tsc --noEmit && npm run lint && npm test
```

**What tests here cannot catch.** A recurring pattern in this repo is bugs that appear only on a real device: a button painted underneath the bottom nav, a `getCurrentPosition` mock that fails instantly where Android hangs indefinitely, an `alert()` that freezes the entire WebView. A unit test asserts the mock, and the mock encodes an assumption — so anything touching geolocation, native dialogs, or z-order needs a device pass before it ships.

To drive a real device: build a debug APK (`npx cap sync android`, then `./gradlew assembleDebug` from `android/`), install it, and attach Chrome DevTools over `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` — find the socket name with `adb shell cat /proc/net/unix`. Debug builds allow WebView debugging; release builds do not.

**Two things that block browser testing today.** `npm run dev` returns HTTP 500 on every route (`ReferenceError: window is not defined`, from Leaflet during SSR), and the backend's CORS policy admits only `https://app.eazyserv.com` and `capacitor://localhost` — so a locally served build cannot reach the beta API from a browser either way. Use a debug APK until both are fixed.

## Architecture

This is a **React 19 + TypeScript** home-services booking app (Eazyserv) targeting Bangalore. It ships as both a **PWA** (Cloudflare deployment) and a **native iOS/Android app** (Capacitor).

### Dual-build setup

| Config                  | Output         | Mode                                                   |
| ----------------------- | -------------- | ------------------------------------------------------ |
| `vite.config.ts`        | `dist/`        | SSR/PWA via TanStack Start + `@cloudflare/vite-plugin` |
| `vite.mobile.config.ts` | `dist-mobile/` | SPA for Capacitor (no service worker)                  |

The mobile build uses `index.mobile.html` as entry and copies it to `dist-mobile/index.html` as part of the build script.

### Routing

TanStack Router with file-based routing under `src/routes/`. The route tree (`src/routeTree.gen.ts`) is **auto-generated** — never edit it manually. Add/rename route files and let the codegen update it.

Current routes: `/` (home), `/service/$serviceId`, `/bookings`, `/tracking/$bookingId`, `/activity`, `/profile`.

### API & Auth

- **Client:** `src/lib/api.ts` — `apiFetch<T>()` wraps `fetch` with Bearer token injection and silent token refresh on 401. Tokens persist across cold-starts via `localStorage` (session survives app close/reopen — see the fix from 2026-08-21).
- **Auth context:** `src/lib/auth-context.tsx` — `AuthProvider` stores user (id, name, phone, email) and tokens. On mount it probes `/users/me` against any stored tokens; a hard 401 clears them, a network error keeps the cached user (offline boot). `isRestoring` flag exposes the probe state so UI doesn't flash AuthFlow.
- **Server state:** TanStack React Query via `src/hooks/useApi.ts`.
- **OTP flow:** `src/components/AuthFlow.tsx` — Splash → Phone → OTP → app. During beta the OTP arrives only in CloudWatch (see "Getting the OTP during testing" above).

Backend base URL: `VITE_API_BASE_URL` (defaults to `/api/v1`; dev proxies to `http://127.0.0.1:8000`).

### State management

- **React Query** — all API/server state
- **React Context** (`AuthProvider`) — auth user + tokens
- **useState** — ephemeral UI state; no global client-state library

### Styling conventions

- Tailwind CSS 4 utility classes throughout.
- shadcn/ui components (new-york style) live in `src/components/ui/`. Don't hand-roll UI primitives that shadcn already provides.
- App is **mobile-first**, capped at `max-w-md`. Brand color is purple (`#7C3AED`).
- Framer Motion (`AnimatePresence`, `motion.*`) for transitions; Lucide React for icons.

### Capacitor / native

`capacitor.config.ts` targets `com.eazyserv.app`. Native project directories (`android/`, `ios/`) are generated — don't edit generated files directly. After any `build:mobile`, run `cap:sync` before opening in Android Studio / Xcode.

### Key environment variables

```
VITE_API_BASE_URL        # Backend base path (default: /api/v1)
VITE_RAZORPAY_KEY_ID     # Razorpay public key
VITE_FIREBASE_API_KEY    # Optional analytics
```

See `.env.example` for the full list.

### Integration reference

`frontend_e2e_integration.md` and `frontend_integration_guide.md` at the project root document the backend API contracts (OTP auth, bookings, payments, WebSocket live-tracking). `svc_connect.json` is the OpenAPI spec.
