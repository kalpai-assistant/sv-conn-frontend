# ServiceConnect — Frontend E2E Integration Reference

**Date:** April 29, 2026  
**Backend Base URL:** `VITE_API_BASE_URL=/api/v1` (already correct in `lib/api.ts`)  
**Audience:** Frontend team replacing mock data with live API calls

> [!IMPORTANT]
> Your `lib/api.ts` client is production-ready (auto-refresh on 401, Bearer token injection). The only thing that needs to change is **replacing mock data sources with `apiFetch` calls** where noted below.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [User Profile & Addresses](#2-user-profile--addresses)
3. [Service Catalog](#3-service-catalog)
4. [Booking Flow](#4-booking-flow)
5. [Booking Status & Detail](#5-booking-status--detail)
6. [Cancellation](#6-cancellation)
7. [Reviews](#7-reviews)
8. [Payments](#8-payments)
9. [Live Tracking (WebSocket)](#9-live-tracking-websocket)
10. [Error Handling Contract](#10-error-handling-contract)
11. [Mock Cleanup Checklist](#11-mock-cleanup-checklist)

---

## 1. Authentication

**File:** `src/components/AuthFlow.tsx` — **Already largely wired. Two issues remain.**

### 1.1 Send OTP

```
POST /auth/send-otp
Body: { "phone": "+919876543210" }  ← must include +91
Response: { "message": "OTP sent successfully" }
```

**Current code is correct.** The `handleSendOtp` function at line 37 already formats the phone correctly with `+91${phone}`. The catch block (line 47–49) that silently advances to OTP step on error should be removed in production — it bypasses auth entirely.

### 1.2 Verify OTP — Response Shape

```
POST /auth/verify-otp
Body: { "phone": "+919876543210", "otp": "123456", "role": "consumer" }

Response:
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "user_id": "uuid-string",
  "role": "consumer",
  "is_new_user": true
}
```

**Action required:** After a successful OTP verify, `is_new_user: true` means this is a fresh registration. Route them immediately to `/profile` (setup mode) before they can browse. Your `__root.tsx` already has `isSetupMode` logic — make sure it checks this flag from the token response and persists it in `AuthContext`.

### 1.3 Refresh Token

```
POST /auth/refresh
Body: { "refresh_token": "eyJ..." }
Response: same shape as TokenResponse above
```

`lib/api.ts` line 24 already calls this correctly. No changes needed.

---

## 2. User Profile & Addresses

**File:** `src/routes/profile.tsx` — **Partially wired. Addresses need the real hook, add-address is a stub.**

### 2.1 Get My Profile

```
GET /users/me
Headers: Authorization: Bearer {token}

Response:
{
  "id": "uuid",
  "phone": "+919876543210",
  "name": "Arjun Mehta",       ← null if new user
  "email": "arjun@example.com", ← null if not set
  "role": "consumer"
}
```

### 2.2 Update My Profile

```
PATCH /users/me
Body: { "name": "Arjun Mehta", "email": "arjun@example.com" }
Response: same User object above
```

`profile.tsx` line 54 already calls this correctly. ✅

### 2.3 List Addresses

```
GET /users/me/addresses
Response: [
  {
    "id": "uuid",
    "label": "home",            ← lowercase: "home" | "work" | "other"
    "full_address": "42, 2nd Cross...",   ← NOTE: field is full_address, not full
    "is_default": true
  }
]
```

`useApi.ts` line 112 already maps `full_address → full`. ✅  
`BookingSheet.tsx` lines 4 and 96 **still import `savedAddresses` from mock-data**. Replace with `useAddresses()`.

### 2.4 Add Address

```
POST /users/me/addresses
Body:
{
  "label": "home",
  "full_address": "42, 2nd Cross, Indiranagar, Bangalore 560038",
  "lat": 12.9716,
  "lng": 77.5946
}
Response: the new Address object
```

> [!WARNING]
> Lat/lng are required to enable geospatial dispatch. The "Add New Address" button in `BookingSheet.tsx` (line 109) and `profile.tsx` (line 174) is a UI stub. You must integrate device GPS or a Google Maps address picker to capture coordinates before calling this endpoint.

---

## 3. Service Catalog

**File:** `src/hooks/useApi.ts` — **Mostly wired. One field name bug.**

### 3.1 List Categories

```
GET /categories
Response: [
  {
    "id": "uuid",
    "name": "Cleaning",
    "icon_url": null,          ← may be null; use Lucide fallback
    "description": null,
    "sort_order": 1,
    "is_active": true
  }
]
```

> [!NOTE]
> The backend does not store a `color` field. Your `mapCategory` function (line 60) hard-codes `"#6C5CE7"` as fallback — that's fine for now, or you can maintain a local color palette map keyed by category name.

### 3.2 List Services

```
GET /services
GET /services?category_id={uuid}
Response: [
  {
    "id": "uuid",
    "name": "Full Home Deep Cleaning",
    "category_id": "uuid",
    "description": "...",
    "base_price": 1999.0,
    "duration_minutes": 180,
    "is_active": true
  }
]
```

> [!IMPORTANT]
> There is **no `provider_id` on Service anymore** (Urban Company model). The backend removed it in the last refactor. Your `API_ServiceResponse` interface at `useApi.ts` line 33 still has `provider_id: string` — **remove this field**. The service detail page (`service.$serviceId.tsx`) crashes at line 51 (`service.provider.name`) because `provider` is always `undefined` from the live API.

**What to render instead on service detail:** Show a generic "Qualified professionals" section instead of a specific provider name. Show `avg_rating` from the Platform (which you can fetch separately) or remove the provider card section entirely for the UC model.

---

## 4. Booking Flow

**File:** `src/components/BookingSheet.tsx` — **Core booking call is correct. Address selection is mocked.**

### Create Booking

```
POST /bookings/
Headers: Authorization: Bearer {token}
Body:
{
  "service_id": "uuid",
  "address_id": "uuid",        ← must be a real UUID from GET /users/me/addresses
  "scheduled_at": "2026-05-01T10:00:00Z",  ← ISO 8601 UTC, null for instant
  "payment_method": "online"   ← "online" | "cash"
}

Response (201):
{
  "id": "uuid",
  "consumer_id": "uuid",
  "provider_id": null,          ← ALWAYS null at creation (broadcast model)
  "service_id": "uuid",
  "status": "requested",        ← lowercase from backend
  "service_amount": 1999.0,
  "platform_commission": 399.8,
  "provider_payout": 1599.2,
  "payment_method": "online",
  "payment_status": "pending",
  "doorstep_otp": "4829",       ← show this to consumer after booking
  "scheduled_at": "2026-05-01T10:00:00Z",
  "created_at": "2026-04-29T14:00:00Z"
}
```

> [!IMPORTANT]
> `BookingSheet.tsx` line 15 uses `savedAddresses[0].id` from `mock-data.ts` as the default selected address. This is a hardcoded mock UUID — **the POST will fail** because the backend validates that the address belongs to the logged-in user. Replace the default with the first address from `useAddresses()`.

> [!NOTE]
> The `platformFee` hardcoded as `49` on `BookingSheet.tsx` line 22 is wrong. The real commission is 20% of `service.base_price`. Use `service_amount * 0.20` for display, or simply read `platform_commission` from the booking response.

---

## 5. Booking Status & Detail

**Files:** `src/routes/bookings.tsx`, `src/routes/tracking.$bookingId.tsx`

### 5.1 List Bookings

```
GET /bookings/
GET /bookings/?status=requested
Headers: Authorization: Bearer {token}

Response:
{
  "bookings": [...BookingResponse],
  "total": 12,
  "page": 1,
  "per_page": 20
}
```

`useApi.ts` line 125 already calls `/bookings/` correctly. ✅

### 5.2 Get Single Booking ← **NEW ENDPOINT (just added)**

```
GET /bookings/{booking_id}
Headers: Authorization: Bearer {token}
Response: BookingResponse (same shape as above)
```

> [!IMPORTANT]
> `tracking.$bookingId.tsx` line 16 calls `useBookings()` (fetches ALL bookings) and then `.find()` by ID (line 17). This is extremely wasteful — it fetches the full list on every 4-second poll. Replace with a dedicated `useBooking(bookingId)` hook that calls `GET /bookings/{booking_id}` directly.

### 5.3 Status Values

Backend sends **lowercase**. Your `useApi.ts` line 141 calls `.toUpperCase()` to normalize — this is fine. Keep it.

| Backend value | UI display |
|---|---|
| `requested` | `REQUESTED` — show "Searching for partners..." |
| `accepted` | `ACCEPTED` — show provider card + OTP |
| `en_route` | `EN_ROUTE` — show map placeholder + ETA |
| `in_progress` | `IN_PROGRESS` — show "Service in progress" |
| `completed` | `COMPLETED` — show payment CTA |
| `cancelled` | `CANCELLED` |
| `expired` | `EXPIRED` — no provider accepted in 2 min; show "Try again" |

> [!WARNING]
> `EXPIRED` status is **not handled** anywhere in the frontend. If a booking expires (no provider accepts within 2 minutes), the tracking page will fall into the `REQUESTED` "searching" state forever. Add a case for `EXPIRED` that shows a retry button.

### 5.4 Doorstep OTP

The `doorstep_otp` field is returned in the booking response. Your tracking page already reads `booking.otp` — but `useApi.ts` line 147 maps `doorstep_otp → otp`. ✅  
Show the OTP when status is `ACCEPTED` or `EN_ROUTE`. ✅ (tracking page line 78 already does this)

### 5.5 Provider Info on Booking

When a provider accepts, `provider_id` becomes a UUID. Your `useApi.ts` creates a fake provider object (lines 130–137: `"Assigned Partner"`, `"000-000-0000"`). To show a real name, you need a separate call:

```
GET /providers/{provider_id}    ← not yet exposed as a public endpoint
```

For now, the placeholder is acceptable. Log this as a backend feature request for v2.

---

## 6. Cancellation

**File:** `src/routes/tracking.$bookingId.tsx` line 142 — **Button exists, click handler is missing.**

```
PATCH /bookings/{booking_id}/cancel
Headers: Authorization: Bearer {token}
Body: { "reason": "Changed my mind" }
Response: updated BookingResponse
```

The Cancel button at line 143 has no `onClick` handler — it's a pure UI stub. Wire it up. After success, redirect to `/bookings`.

---

## 7. Reviews

**File:** `src/hooks/useApi.ts` lines 176–196

### Submit a Review

```
POST /reviews/
Headers: Authorization: Bearer {token}
Body:
{
  "booking_id": "uuid",
  "rating": 5,          ← integer 1–5
  "comment": "Excellent service!"
}
Response: { "id": "uuid", "rating": 5, "comment": "...", "created_at": "..." }
```

> [!WARNING]
> There is no review submission UI anywhere in the frontend. After a booking reaches `COMPLETED`, the user should be prompted to rate the service. This is a missing screen.

### Fetch Reviews for a Provider

```
GET /reviews?provider_id={uuid}
Response:
{
  "reviews": [
    {
      "id": "uuid",
      "rating": 5,
      "comment": "Excellent!",
      "reviewer_id": "uuid",     ← user ID, not name
      "created_at": "2026-04-10T11:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "per_page": 20,
  "avg_rating": 4.82
}
```

> [!WARNING]
> `useApi.ts` line 182 calls `/reviews/provider/{providerId}`. The correct URL is `/reviews?provider_id={uuid}`. **Fix the URL.**  
> Also note: the response has `reviewer_id` (a UUID), not a name. Display "Verified Customer" or fetch the user separately. Your fallback `"Customer"` (line 186) is acceptable for now.

---

## 8. Payments

### 8.1 Online Payment Flow (After Booking Completion)

When `booking.status === "COMPLETED"` and `booking.payment_method === "online"`:

**Step 1: Create Razorpay Order**
```
POST /payments/orders
Body: { "booking_id": "uuid" }
Response:
{
  "razorpay_order_id": "order_abc123",
  "amount": 199900,          ← in paise (₹1999 = 199900)
  "currency": "INR",
  "razorpay_key_id": "rzp_live_xxx"
}
```

**Step 2: Launch Razorpay Checkout** (use `razorpay_key_id` + `razorpay_order_id`)

**Step 3: Verify Payment**
```
POST /payments/verify
Body:
{
  "razorpay_order_id": "order_abc123",
  "razorpay_payment_id": "pay_abc123",
  "razorpay_signature": "signature_hash"
}
Response: { "message": "Payment verified", "payment_id": "uuid" }
```

> [!IMPORTANT]
> There is **no payment screen** in the frontend currently. This entire flow is missing. For cash bookings, no action is needed from the consumer — it's handled automatically by the backend. For online bookings, you need to integrate the Razorpay JS SDK and create a post-completion payment screen.

### 8.2 Cash Bookings

No consumer action required. The backend records the payment automatically when the booking is marked `COMPLETED`. The provider confirms cash collection on their app (Partner App scope).

---

## 9. Live Tracking (WebSocket)

**File:** `src/routes/tracking.$bookingId.tsx`

Currently using HTTP polling every 4 seconds (line 21–25). This should be replaced with WebSocket for `EN_ROUTE` state.

### Consumer WebSocket (Subscribe)

```javascript
const token = getAccessToken();
const ws = new WebSocket(
  `wss://your-domain.com/api/v1/tracking/consumer/${bookingId}?token=${token}`
);

ws.onmessage = (event) => {
  const { lat, lng, heading, timestamp } = JSON.parse(event.data);
  // Update map marker position
};
```

**Recommended approach:** Keep HTTP polling for status changes (it's fine for state machine transitions). Only switch to WebSocket for `EN_ROUTE` where you need sub-second lat/lng updates for the map animation. The existing polling every 4s is acceptable for everything except the live map dot.

### The Map Placeholder

`tracking.$bookingId.tsx` line 109 shows a static dot-grid background when status is `EN_ROUTE`. To implement live tracking, integrate Google Maps JS SDK or Mapbox GL, and update the marker using coordinates from the WebSocket above.

---

## 10. Error Handling Contract

All backend errors follow this shape:

```json
{
  "error": true,
  "message": "Booking abc123 not found",
  "status_code": 404
}
```

| HTTP Status | Meaning | UI Action |
|---|---|---|
| `400` | Bad request / invalid OTP | Show inline error message |
| `401` | Token expired | `lib/api.ts` auto-refreshes; if still 401, redirect to login |
| `403` | Wrong role / unauthorized | Show "You don't have permission" toast |
| `404` | Resource not found | Show "Not found" state in component |
| `409` | Invalid state transition | Show "This action is no longer available" |
| `429` | Rate limited | Show "Too many requests, try again in 1 minute" |
| `500` | Server error | Show generic error with retry button |

> [!NOTE]
> `lib/api.ts` line 64 currently throws `new Error(\`API error: ${res.status}\`)`. The response body (which has `message`) is not read. Upgrade this to parse and re-throw the JSON body so components can display the backend's actual error message.

---

## 11. Mock Cleanup Checklist

Cross-reference this against your codebase. Each item is a live file + line number.

### 🔴 Must Fix Before Demo

| File | Line(s) | Issue | Fix |
|------|---------|-------|-----|
| `auth-context.tsx` | 3, 37–38 | `mockLogin()` uses `currentUser` from mock-data and fake tokens | Remove `mockLogin`. Replace with real `login()` everywhere |
| `BookingSheet.tsx` | 4, 15, 96–108 | Addresses loaded from `savedAddresses` in mock-data | Replace with `useAddresses()` hook |
| `BookingSheet.tsx` | 22 | `platformFee = 49` is hardcoded | Calculate as `Math.round(service.price * 0.20)` |
| `tracking.$bookingId.tsx` | 16–17 | Fetches all bookings to find one | Create `useBooking(id)` calling `GET /bookings/{id}` |
| `service.$serviceId.tsx` | 51 | `service.provider.name` crashes (provider is undefined on live API) | Remove or replace with "Qualified professionals" copy |
| `useApi.ts` | 33 | `provider_id` field on `API_ServiceResponse` | Remove — field no longer exists on backend |
| `useApi.ts` | 182 | Wrong reviews URL: `/reviews/provider/{id}` | Change to `/reviews?provider_id={id}` |
| `tracking.$bookingId.tsx` | 143 | Cancel button has no onClick | Wire to `PATCH /bookings/{id}/cancel` |

### 🟡 Important for Full Feature Parity

| File | Line(s) | Issue | Fix |
|------|---------|-------|-----|
| `auth-context.tsx` | 87–91 | OTP verify catch block calls `mockLogin()` on failure | Remove fallback; show error state instead |
| `AuthFlow.tsx` | 47–49 | Send OTP catch block silently advances step | Remove; show error toast |
| `tracking.$bookingId.tsx` | — | `EXPIRED` status not handled | Add `EXPIRED` case with "No partners found. Try again." UI |
| (missing) | — | No review submission screen | Add post-completion review prompt |
| (missing) | — | No online payment screen | Add Razorpay checkout after COMPLETED |
| `lib/api.ts` | 63–65 | Error body not parsed | Read `res.json()` in error path and re-throw with message |

### 🟢 Already Correctly Wired

| Feature | Hook/File | Status |
|---------|-----------|--------|
| Categories listing | `useCategories()` | ✅ Live |
| Services listing (with category filter) | `useServices(categoryId?)` | ✅ Live |
| Create booking | `BookingSheet.tsx` → `POST /bookings/` | ✅ Live |
| Bookings list | `useBookings()` | ✅ Live |
| Profile PATCH | `profile.tsx` → `PATCH /users/me` | ✅ Live |
| Address listing | `useAddresses()` | ✅ Live |
| Token auto-refresh | `lib/api.ts` | ✅ Live |
| Doorstep OTP display | `tracking.$bookingId.tsx` | ✅ Live |
| OTP send + verify | `AuthFlow.tsx` | ✅ Live (with fallback issues noted) |

---

*Last updated: April 29, 2026. Source of truth: `ServiceConnect_LLD_Backend.md` + current backend codebase.*
