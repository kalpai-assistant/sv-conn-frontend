# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

# Mobile (Capacitor)
npm run cap:sync         # Build mobile + sync to native projects
npm run cap:android      # Build + open Android Studio
npm run cap:ios          # Build + open Xcode
```

There is no test suite currently.

## Architecture

This is a **React 19 + TypeScript** home-services booking app (ServiceConnect) targeting Bangalore. It ships as both a **PWA** (Cloudflare deployment) and a **native iOS/Android app** (Capacitor).

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

- **Client:** `src/lib/api.ts` — `apiFetch<T>()` wraps `fetch` with Bearer token injection and silent token refresh on 401.
- **Auth context:** `src/lib/auth-context.tsx` — `AuthProvider` stores user (id, name, phone, email) and tokens. Gate pages with `useAuth()`.
- **Server state:** TanStack React Query via `src/hooks/useApi.ts`.
- **OTP flow:** `src/components/AuthFlow.tsx` — Splash → Phone → OTP → app.

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

`capacitor.config.ts` targets `com.serviceconnect.app`. Native project directories (`android/`, `ios/`) are generated — don't edit generated files directly. After any `build:mobile`, run `cap:sync` before opening in Android Studio / Xcode.

### Key environment variables

```
VITE_API_BASE_URL        # Backend base path (default: /api/v1)
VITE_RAZORPAY_KEY_ID     # Razorpay public key
VITE_FIREBASE_API_KEY    # Optional analytics
```

See `.env.example` for the full list.

### Integration reference

`frontend_e2e_integration.md` and `frontend_integration_guide.md` at the project root document the backend API contracts (OTP auth, bookings, payments, WebSocket live-tracking). `svc_connect.json` is the OpenAPI spec.
