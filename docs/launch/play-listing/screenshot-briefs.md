# Play Console — Phone Screenshot Briefs

**App:** EazyServ (`com.eazyserv.app`)
**Prepared for:** Vipul, to capture + upload to Play Console → Main store
listing → Phone screenshots.
**Prepared:** 2026-11-04

## Requirements (per Play policy, 2026-11)

- **Count:** Min 2, max 8. We're producing **6**.
- **Dimensions:** 1080 × 1920 (16:9) or 1080 × 2340 (19.5:9). Use **1080 × 2340**
  to match the actual device aspect ratio of most modern Android phones; Play
  letterboxes 16:9 awkwardly.
- **Format:** PNG or JPEG, ≤ 8 MB each, min 320 px side, max 3840 px side.
- **Content policy:** no watermarks, no "coming soon" overlays, no device
  frames (Play adds its own frame now), no prices that aren't real, no
  screenshots of competitor apps.
- **Localization:** English only for beta; Marathi / Hindi captions optional
  for v2 launch.

## How to capture

1. Run the app on an Android device or AVD at **1080 × 2340** (Pixel 7 or
   Pixel 7 Pro profile in Android Studio).
2. Use **light theme** (Play reviewers see light by default) — the app's
   design token is `oklch(0.5 0.2 262)` blue (brand hue 262, memory
   `reference_eazyserv_brand_color.md`) on light surfaces.
3. Seed fresh data: 1 Pune consumer account with saved address, 2 accepted
   bookings in history, 1 in-progress booking for the tracking shot.
4. Capture via `adb exec-out screencap -p > shot-NN.png`. Do **not** add a
   device frame — Play now renders its own.
5. Save finals as `shot-01.png` … `shot-06.png` in
   `frontend/docs/launch/play-listing/screenshots/` (git-ignored per
   `.gitignore` if large, otherwise commit them).

## Caption style

Each screenshot can carry a one-line caption rendered **in the Play listing
UI** (not baked into the image). Captions below are the suggested one-liners
Vipul can paste alongside each upload.

---

## Screenshot 1 — Home / service grid

**What it shows:** The Home screen after login + address picker. Grid of
service categories (Cleaning, Plumbing, Electrical, Salon, Appliance Repair,
Pest Control). Top chip shows selected address ("MG Road, Pune"). Clean
status bar, no debug overlays.

**Caption:** *"Home services in Pune, booked in a tap."*

**Capture notes:**
- Route: `/` (`frontend/src/routes/index.tsx`).
- Seed: user is logged in with one saved address.
- Must include at least 6 service tiles above the fold; use the
  category-grid spacing from the current layout.

---

## Screenshot 2 — Service detail (upfront pricing)

**What it shows:** A service detail screen (e.g., "Bathroom Deep Clean"
within Cleaning). Price displayed prominently. "What's included" list with
3–4 bullets. "Book now" CTA at bottom. No "+GST", no "starting at" — a real
flat price.

**Caption:** *"The price you see is the price you pay."*

**Capture notes:**
- Route: `/service/$serviceId` (`frontend/src/routes/service.$serviceId.tsx`).
- Choose a service with mid-range pricing (₹499 or ₹699) so the "fair
  pricing" promise reads honestly; don't pick the cheapest.
- Hide the back-button chevron if possible — distracts from the CTA.

---

## Screenshot 3 — Address picker with map

**What it shows:** The map-based address picker. Pin on a Pune location
(centre around FC Road or Baner for recognisability). Bottom sheet shows
house number, building, landmark fields pre-filled. "Confirm address" CTA.

**Caption:** *"Precise address, precise service."*

**Capture notes:**
- Route: `/addresses` → "Add new" (`frontend/src/routes/addresses.tsx`).
- Google Maps shows a real Pune neighbourhood; make sure attribution ("© Google")
  stays visible — removing it is a Maps-ToS violation.
- Make sure the pin is on a real residential street, not an SP location.

---

## Screenshot 4 — Live tracking during a booking

**What it shows:** The tracking view during an en-route booking. Small
inline map (not full-screen) showing the Pro's current location and an ETA
("8 min away"). Pro's name + photo + star rating. "Call Pro" and "Share
live location" CTAs.

**Caption:** *"Watch your Pro arrive in real time."*

**Capture notes:**
- Route: `/tracking/$bookingId` (`frontend/src/routes/tracking.$bookingId.test.tsx`
  references the live-tracking route).
- Needs a seeded in-progress booking. Simulate the Pro's location by hitting
  the `tracking` websocket from a dev tool, or use the staging mock-
  position script if one exists. Verify status pill reads "On the way".
- **Faces matter.** Use the agreed sample Pro (we don't want a stock avatar
  here — authenticity sells). If that Pro hasn't been photographed yet,
  flag + fall back to a blurred avatar + "Rohit S." tag.

---

## Screenshot 5 — Verified pro card (trust)

**What it shows:** The Pro profile view that appears after acceptance. KYC
badge, verified-since date, specialities, bookings completed, rating.

**Caption:** *"KYC-verified. Every Pro. Every time."*

**Capture notes:**
- Likely surfaces inside the tracking / booking detail. The "Pro trust card"
  landed in SVC-380 (feel upgrade).
- Pick a Pro with ≥ 25 bookings for a believable count. If the beta DB
  doesn't have that volume yet, use a hand-crafted demo row (and note it
  in the Play-reviewer test-account doc).

---

## Screenshot 6 — Booking summary / receipt

**What it shows:** Post-service receipt. Service name, date, Pro name,
"Paid via UPI" row with masked VPA, total, "Rate your Pro" CTA. Soft
confetti or success tick (SVC-380 celebration treatment — but keep it
subtle, not distracting for the review team).

**Caption:** *"Transparent receipts, every time."*

**Capture notes:**
- Route: `/bookings` → booking detail (`frontend/src/routes/bookings.tsx`).
- Status must read "Completed" and payment "Paid".
- Hide any debug fields (`booking_id` UUID, internal status enums) if the
  current UI shows them.

---

## Feature graphic (1024 × 500)

**Separate asset**, not a phone screenshot. Required for the Play listing.

**Brief:** EazyServ wordmark centred-left on brand-blue background
(`oklch(0.5 0.2 262)`), with 3 service-category icons (cleaning mop, wrench,
scissors) floating on the right. No photographic content. No embedded text
about pricing (Play rejects feature graphics with "best deal" / "₹X off"
copy). Designer: match the brand palette in `/Users/vips/svc_connect/brand/`.

---

## Delivery checklist (for Vipul)

- [ ] 6 phone screenshots captured at 1080 × 2340, PNG, no device frames.
- [ ] 1 feature graphic at 1024 × 500, PNG.
- [ ] (Optional) App icon re-export at 512 × 512 PNG high-res — Play asks
      for this separately from the launcher icon.
- [ ] Uploaded to Play Console → Main store listing.
- [ ] Captions pasted next to each screenshot.
