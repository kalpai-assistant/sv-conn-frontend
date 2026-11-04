# Play Console — Data Safety Form Answers

**App:** EazyServ (`com.eazyserv.app`)
**Prepared for:** Vipul, to paste into Play Console → App content → Data safety.
**Prepared:** 2026-11-04
**Source of truth:** This document. Google's current taxonomy from
https://support.google.com/googleplay/android-developer/answer/10787469.
Every line below is backed by a file:line citation in the code.

---

## 1. Data collection & security overview (top of form)

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes.** All API traffic is HTTPS (CORS allowlist is HTTPS-only in `backend/app/config.py`); S3 URLs returned as HTTPS (`backend/app/utils/storage.py:49`); Capacitor WebView forces `androidScheme=https`. |
| Do you provide a way for users to request that their data be deleted? | **Yes.** In-app: Profile → "Delete account" button (`frontend/src/components/DeleteAccountButton.tsx`) → `DELETE /users/me` (`backend/app/routers/users.py:50-73`). Deletion anonymises the user row (phone → tombstone, PII → NULL), soft-deletes bookings/addresses, and asynchronously purges S3 objects under `provider-photos/{user_id}/` and `kyc/{user_id}/`. |
| Has your app been independently validated against a global security standard? | **No** (not for the beta release). |

---

## 2. Data types collected

For every "Yes" below, declare on the form:
- **Collected** (sent off-device): **Yes**
- **Shared** (sent to 3rd parties): see per-row note
- **Optional / required**: see per-row note
- **Purpose(s)**: see per-row note
- **Ephemeral processing** (processed in memory, not stored): applies only to OTP

### 2.1 Location

| Data type | Collected | Shared | Required? | Purpose | Evidence |
|---|---|---|---|---|---|
| **Approximate location** | Yes | **Yes** — Google Maps (reverse geocode / search) | Required | App functionality | `frontend/android/app/src/main/AndroidManifest.xml:60` declares `ACCESS_COARSE_LOCATION`; used in address picker (`frontend/src/lib/geolocation.ts`). |
| **Precise location** | Yes | **Yes** — Google Maps | Required | App functionality (address picking, service-area matching, in-job live tracking) | `AndroidManifest.xml:61` declares `ACCESS_FINE_LOCATION`. Stored as PostGIS POINT on address (`backend/app/models/address.py:77-79`) and professional (`backend/app/models/professional.py:89-91`). In-job tracking via `backend/app/routers/tracking.py` is foreground-only; location history is not archived. Background tracking explicitly out of scope — no `ACCESS_BACKGROUND_LOCATION` permission. |

### 2.2 Personal info

| Data type | Collected | Shared | Required? | Purpose | Evidence |
|---|---|---|---|---|---|
| **Name** | Yes | **Yes** — Razorpay (checkout prefill) | Required | Account management, App functionality | `backend/app/models/user.py` → `users.name String(100)`; profile edit form in `frontend/src/routes/profile.tsx:101-111`. |
| **Email address** | Yes | **Yes** — Razorpay (checkout prefill) | Optional | Account management | `frontend/src/routes/profile.tsx:211-219`; stored as `users.email String(255)` nullable. |
| **User IDs** | Yes | No | Required | Account management, App functionality | UUID primary key on `users` (`backend/app/models/user.py`); also tagged on Sentry events (user ID only, no PII — `frontend/src/lib/sentry.ts` `sendDefaultPii: false`). |
| **Address** | Yes | **Yes** — Google Maps (geocode), Service Provider (at booking time) | Required | App functionality | `backend/app/models/address.py:46` (full_address, floor, building, landmark, contact_name, contact_phone) + PostGIS coords. |
| **Phone number** | Yes | **Yes** — MSG91 (SMS OTP delivery), Razorpay (checkout prefill), Service Provider (at booking time) | Required | Account management (auth), App functionality | `users.phone String(15) UNIQUE` in `backend/app/models/user.py`; primary auth identifier (OTP login). |
| **Race and ethnicity** | No | — | — | — | Not collected. |
| **Political or religious beliefs** | No | — | — | — | Not collected. |
| **Sexual orientation** | No | — | — | — | Not collected. |
| **Other info — Government ID (Aadhaar)** | Yes (providers only) | No | Required (for providers only) | App functionality, Fraud prevention / security / compliance | Image captured via `frontend/src/routes/pro/kyc.tsx:29-97`; keys stored in JSONB `kyc_docs` (`backend/app/models/provider_profile.py`); images in S3 prefix `kyc/{user_id}/` or `kyc/pros/{pro_id}/` (private bucket policy — see memory `reference_eazyserv_uploads_bucket_split.md`). Aadhaar number encrypted at rest (AES-256) as `aadhaar_encrypted`. |
| **Other info — PAN (tax ID)** | Yes (providers only) | **Yes** — RazorpayX (payout contact creation) | Required (for providers only) | App functionality (payout), Fraud prevention / security / compliance | `provider_profile.pan_encrypted String(512)` AES-256 encrypted. |

> On the Play form, "Other info" is one row — declare it with the purposes above
> and in the text field note: "Government ID (Aadhaar) and tax ID (PAN) are
> collected only from Service Providers for KYC and payout settlement; not
> collected from consumers."

### 2.3 Financial info

| Data type | Collected | Shared | Required? | Purpose | Evidence |
|---|---|---|---|---|---|
| **User payment info** | Yes (tokens / IDs only; no PAN or full card number) | **Yes** — Razorpay (payment processing), RazorpayX (payout) | Required | App functionality | `backend/app/models/payment.py:59-64` stores `razorpay_order_id`, `razorpay_payment_id`. Payment UI uses Razorpay Standard Checkout; **we never see or store PAN / full card numbers** (PCI-scope entirely at Razorpay). Provider payout destination (UPI VPA or bank account + IFSC) encrypted at rest: `provider_profile.upi_id_encrypted`, `bank_account_encrypted`, `payout_vpa_encrypted`, `payout_account_number_encrypted`, `payout_ifsc_encrypted` (`backend/app/models/provider_profile.py:56-62`). Masked display stored in clear as `payout_display`. |
| **Purchase history** | Yes | No | Required | App functionality | Booking history retained indefinitely (soft-delete only); shown on Activity / Bookings screens. |
| **Credit score** | No | — | — | — | Not collected. |
| **Other financial info** | No | — | — | — | Not collected. |

### 2.4 Health and fitness

Not collected.

### 2.5 Messages

| Data type | Collected | Shared | Required? | Purpose | Evidence |
|---|---|---|---|---|---|
| **Emails** | No | — | — | — | Not collected. |
| **SMS or MMS** | No | — | — | — | We send OTP SMS *to* the user via MSG91, but we do not read the user's SMS inbox. No `READ_SMS` permission. |
| **Other in-app messages** | No | — | — | — | No in-app chat/messaging surface. Support screen (`frontend/src/routes/support.tsx:41-62`) is `tel:` + `mailto:` links only. |

### 2.6 Photos and videos

| Data type | Collected | Shared | Required? | Purpose | Evidence |
|---|---|---|---|---|---|
| **Photos** | Yes (providers + optional for consumers) | No | Required for providers; Optional for consumers | App functionality, Fraud prevention / security / compliance | Provider profile photo + business photo stored under S3 prefix `provider-photos/{user_id}/` (public-read via bucket policy); KYC photos (Aadhaar front/back + liveness selfie) stored under `kyc/{user_id}/` or `kyc/pros/{pro_id}/` (private). `backend/app/models/provider_profile.py` (`profile_photo_url`, `business_image_url`, `kyc_docs`); `backend/app/models/professional.py` (`profile_photo_url`, `kyc_docs`); upload endpoint `backend/app/utils/storage.py:35-49`. Permission: `CAMERA` + `READ_MEDIA_IMAGES` (`AndroidManifest.xml:66,72`). |
| **Videos** | No | — | — | — | Not collected. |

### 2.7 Audio files

Not collected. No microphone permission.

### 2.8 Files and docs

Not collected as documents. KYC artefacts are images only (see 2.6 Photos).

### 2.9 Calendar

Not collected. No calendar permission.

### 2.10 Contacts

Not collected. No `READ_CONTACTS` permission.

### 2.11 App activity

| Data type | Collected | Shared | Required? | Purpose | Evidence |
|---|---|---|---|---|---|
| **App interactions** | Yes (minimal — error-context breadcrumbs only) | **Yes** — Sentry (error reporting) | Optional | Analytics | Navigation breadcrumbs attached to Sentry events for error context (`frontend/src/lib/useSentryNavigationBreadcrumbs.ts`). No funnel analytics, no event tracking to a third party outside Sentry's error pipeline. |
| **In-app search history** | No | — | — | — | Not collected. |
| **Installed apps** | No | — | — | — | Not collected. (The `<queries>` element in `AndroidManifest.xml` only declares intent-visibility for UPI apps per RBI/Razorpay requirement; we don't enumerate installed packages.) |
| **Other user-generated content** | No | — | — | — | No UGC surface in beta (no reviews, no chat). |
| **Other actions** | No | — | — | — | Not collected. |

### 2.12 Web browsing

Not collected.

### 2.13 App info and performance

| Data type | Collected | Shared | Required? | Purpose | Evidence |
|---|---|---|---|---|---|
| **Crash logs** | Yes | **Yes** — Sentry | Required | Analytics (bug triage) | `frontend/src/lib/sentry.ts` (DSN-based; `sendDefaultPii: false`; user ID tag only, no phone/email in payload). Backend errors also forwarded to Sentry from `backend/app/main.py`. |
| **Diagnostics** | Yes | **Yes** — Sentry | Required | Analytics | Same Sentry pipeline; trace sampling per `VITE_SENTRY_TRACES_SAMPLE_RATE`. Also one-shot `POST /users/me/push-capability` (platform / notification-permission / token-obtained flags) for push-delivery diagnostics — `frontend/src/lib/fcm.ts:167-227`. |
| **Other app performance data** | No | — | — | — | — |

### 2.14 Device or other IDs

| Data type | Collected | Shared | Required? | Purpose | Evidence |
|---|---|---|---|---|---|
| **Device or other IDs** | Yes (FCM device token) | **Yes** — Firebase (Google) | Required | App functionality (push notifications) | FCM token registered via `PATCH /users/me/fcm-token` (`backend/app/models/user.py` `fcm_token`, `fcm_platform`). Advertising ID (AAID) is **not** collected. Hardware IDs (Android ID, IMEI, MAC) are **not** collected. |

---

## 3. Data sharing — third-party recipients (summary)

Per Google: "Sharing" means transferring user data to a third party. SDKs that
process data on-device without sending anything off-device don't count. All
rows below involve data leaving the device.

| Third party | Data sent | Purpose | Citation |
|---|---|---|---|
| **Razorpay** (payment processing) | Order ID, payment ID, amount, customer name / email / phone (checkout prefill), payment method, signature | App functionality | `frontend/src/types/razorpay.d.ts:1-55` (prefill shape); backend wrapper `backend/app/utils/razorpay_client.py:15-19`. |
| **RazorpayX** (payouts to providers) | Provider name, PAN, UPI ID or bank account + IFSC (all encrypted at rest on our side, sent over HTTPS) | App functionality | `backend/app/models/provider_profile.py:74-89`. Providers only — never consumer data. |
| **Firebase Cloud Messaging** (Google) | FCM device token, platform (android / ios / web) | App functionality (push) | `frontend/src/lib/fcm.ts`; `backend/app/utils/fcm_client.py:65-72`. |
| **Sentry** (crash / error reporting) | Stack traces, breadcrumbs, release tag, environment, user ID (UUID only — no phone, email, name) | Analytics | `frontend/src/lib/sentry.ts:27-44` with `sendDefaultPii: false`. |
| **Google Maps Platform** | User-picked / current coordinates, address text | App functionality (geocode, address search, map tile rendering) | `frontend/src/lib/google-maps.ts`. |
| **MSG91** (SMS vendor) | Phone number, OTP code, template ID | App functionality (OTP SMS delivery) | `backend/app/utils/sms_client.py:75-98`. DLT-approved template in India. |
| **Service Provider (human, on the other side of the booking)** | Consumer name, phone, full address, booking details | App functionality (so the Pro can arrive and perform the service) | Not a "third-party SDK" — document in the form's text field if asked. |

---

## 4. Data security practices (declare "Yes" to all)

| Practice | Declare | Notes |
|---|---|---|
| Data is encrypted in transit | **Yes** | HTTPS enforced on every API call; S3 URLs HTTPS. |
| You provide a way to request data deletion | **Yes** | `DELETE /users/me` + in-app button (see §1). |
| Committed to Play Families Policy (if app is for kids) | **N/A** | Target audience is adults 18+; not designed for children. |
| Independently validated against global security standard (MASA) | **No** | Not pursued for beta. |

---

## 5. Data retention

| Item | Retention |
|---|---|
| OTP code (SMS) | 10 minutes (Redis TTL), ephemeral |
| JWT blacklist (after logout) | Matches JWT remaining TTL |
| Provider real-time location (in-job) | Redis TTL (minutes), not archived |
| Sentry error payloads | Per Sentry project retention (default 90 days) |
| User, booking, payment records | Retained until account deletion (then anonymised / soft-deleted) |
| S3 photos + KYC images | Retained until account deletion (then purged by `delete_objects` in `backend/app/services/account_service.py`) |

---

## 6. Open items flagged for Vipul

1. **Privacy policy URL.** The link on the About screen routes to the in-app
   `/privacy` SPA route. Play requires a crawlable, server-rendered URL. See
   `privacy-policy-url.md`.
2. **Target audience + content.** Select **18+** (Adults). The app involves
   financial transactions and KYC and is not designed for anyone under 18.
3. **Government / National ID disclosure.** Use the "Other info" free-text
   field to explain Aadhaar + PAN scope (providers only, for KYC + payouts).
   Google cross-checks this against the Permissions Declaration form.
4. **Data deletion URL.** In addition to the in-app button, Play now asks for
   a **web URL** where users can request deletion without reinstalling the
   app. We don't have one yet — options are (a) a mailto on a simple web
   page, or (b) a web form that calls the same `DELETE /users/me`. Flag.
