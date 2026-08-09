# EazyServ — Wireframes v1

> Alignment artifact. Low-fi ASCII wireframes for every screen in the Consumer and Provider apps.
> Reference model: **Urban Company** (India). Deliberate clone where the pattern works.
> Mobile-first, capped at `max-w-md`. All screens assume iOS/Android native (Capacitor) + PWA.
>
> **Reading key**
> ```
> ┌─────────────┐  screen frame (max-w-md, ~390px)
> │ [icon]      │  interactive elements in [brackets]
> │ (text)      │  static labels/copy in (parens)
> │ ─────       │  divider
> │ █████████   │  full-width primary CTA
> │ ░░░░░░░░░   │  secondary/outlined element
> └─────────────┘
> ▲ note under a screen  → design intent, not implementation detail
> ```

---

## 0. Design Language

### Palette (already correct — from `src/styles.css`)

| Token         | Value                       | Use                                    |
|---------------|-----------------------------|----------------------------------------|
| `primary`     | oklch(0.5 0.2 262) ≈ #1957D2| Brand blue, primary CTAs, active nav   |
| `background`  | oklch(0.975 0.002 250)      | App background (near-white, cool)      |
| `card`        | #FFFFFF                     | Elevated surfaces                      |
| `accent`      | oklch(0.92 0.01 262)        | Selected chips, subtle highlights      |
| `success`     | oklch(0.65 0.17 165)        | Verified badges, payment success       |
| `destructive` | oklch(0.577 0.245 27.325)   | Cancel, errors                         |
| `muted-fg`    | oklch(0.5 0.02 260)         | Secondary text                         |

Palette aligned with marketing site (`src/marketing/marketing-theme.css`) — hue-only shift from the old purple (290 → 262), lightness and chroma preserved so all contrast ratios remain accessibility-safe.

### Social-proof rule (do not violate)

Every number in these wireframes that looks like social proof — ratings, review counts, jobs done, "1,203 completed", "4.8★ 2,341 reviews" — is a **rendering placeholder**, not a hardcoded value. Rules:

- **Real data only.** If we don't have the number from the backend, don't show it. Empty state instead.
- **No fabricated ranges.** No "500+ pros", "10k+ homes served", "Rated 4.7+ by 2,000 customers" if we can't back it up.
- **No stock testimonials or invented quotes.** Reviews come from the reviews table; if the table is empty, the section is empty.
- **KYC-verified is OK** (real, per backend). "Trained & certified" is NOT (no training pipeline yet). "Independent professionals" is the correct term (per `terms.md` §(a)/(b)).

This mirrors the marketing-site constraint in [MARKETING_LANDING_WIP.md](../../MARKETING_LANDING_WIP.md) §5. In home services, being caught inflating anything is unrecoverable.

### Type

Inter (already loaded). Scale:
- **Display** 28/32 700 — screen titles inside sections
- **Title**   20/24 600 — card/sheet headers
- **Body**    14/20 400 — default text
- **Label**   12/16 500 — chips, tabs, metadata
- **Micro**   10/14 500 — timestamps, counters

### Spacing / radius
- 4px grid. Screen padding: 16px. Card gap: 12px. Section gap: 24px.
- Radius: 12 (cards/buttons), 16 (sheets top), 999 (chips/avatars).

### Motion
Framer Motion is already there. Rules:
- Bottom sheets: spring, damping 25, stiffness 300 (already in `BookingSheet`)
- Route transitions: 200ms opacity + 8px slide (currently only on auth)
- Live states (searching, en route pulse): infinite loop 1.5–2s
- Never animate a booking status change without a haptic (native only)

### Components inventory

**Reuse (already built):** BottomNav, TopBar, ServiceCard, StatusStepper, AddAddressSheet, ReviewSheet, IncomingRequestCard, MapPicker, NotificationsRow, all of `components/ui/*` (shadcn).

**Build new:**
- `LocationBar` — top-of-home address selector (tap → address picker sheet)
- `SearchBar` — real input (currently a fake span in `index.tsx`)
- `CategoryTile` — icon + label, colored bg, 3-col grid
- `PromoCarousel` — horizontal-scroll banner strip
- `ProviderCard` — avatar, name, rating, jobs done, ETA badge
- `SlotPicker` — horizontal date pills + time-slot grid
- `CartFab` — floating "N items • ₹X • View Cart" bar
- `TipSelector` — chip row: skip / ₹20 / ₹50 / ₹100 / custom
- `InvoiceReceipt` — itemized bill, taxes, coupon, total
- `CouponCard` — code + rule + expiry + Use/Applied state
- `EarningsBar` — provider today/week/month toggle + big number
- `OnlineToggle` — big pill toggle for provider go-online state
- `JobTimerBar` — sticky "Job in progress · 42:18" banner
- `ChatBubble` + `ChatComposer` + `QuickReplies` — in-app chat primitives (§13)

---

# CONSUMER APP

## 0. Onboarding (auth + first-run setup)

### 0.1 Splash
```
┌─────────────────────────┐
│                         │
│                         │
│      ┌────────┐         │
│      │   E    │  ← logo mark (purple bg)
│      └────────┘         │
│                         │
│       EazyServ          │  Display, white on blue
│  Home services at your  │  Body/muted white
│       doorstep          │
│                         │
│                         │
└─────────────────────────┘
```
▲ Auto-advances in 1.2s (currently 2s — feels slow). No CTA. Native only; PWA bootstraps straight to phone step.

### 0.2 Phone entry
```
┌─────────────────────────┐
│                         │
│ Enter your phone number │  Title
│ We'll send you an OTP   │  Body/muted
│                         │
│ ┌─────────────────────┐ │
│ │ 🇮🇳 +91  98765 43210│ │  ← autofocus, tel keyboard
│ └─────────────────────┘ │
│                         │
│ █████ Send OTP ────► ██ │  primary, h-14
│                         │
│                         │
│ By continuing you agree │  Micro/muted, links
│ to Terms & Privacy      │
└─────────────────────────┘
```
▲ Add flag emoji (currently just "+91" label — looks unfinished). Add terms consent link at bottom (required for Play Store).

### 0.3 OTP entry
```
┌─────────────────────────┐
│ ◀                       │  ← back to phone step (currently missing)
│                         │
│      Verify OTP         │
│ Sent to +91 98765 43210 │  [Edit]  ← tap to change number
│                         │
│  ┌──┬──┬──┬──┬──┬──┐    │
│  │  │  │  │  │  │  │    │  6 boxes, auto-advance
│  └──┴──┴──┴──┴──┴──┘    │
│                         │
│  Auto-verifying...  ⟳   │  spinner while POSTing
│                         │
│  Resend in 27s          │
│  (00:30 countdown)      │
│                         │
│  Didn't get it? Call me │  ← fallback (voice OTP), phase 2
└─────────────────────────┘
```
▲ Add "Edit" affordance next to the phone. Currently users must hit back or refresh. Add "Call me instead" as a phase-2 hook.

### 0.4 Location permission (first-run, native only)
```
┌─────────────────────────┐
│                         │
│      📍  (large)        │  hero illustration
│                         │
│ Where do you need the   │  Title
│      service?           │
│                         │
│ We use your location to │  Body
│ match you with pros     │
│ nearby and give live    │
│ tracking.               │
│                         │
│ █████ Use current loc ██│  primary
│ ░░░ Enter address ░░░░░ │  secondary
│                         │
│ You can change this any │  Micro
│ time from Profile       │
└─────────────────────────┘
```
▲ Precede the OS permission prompt with our own screen — increases grant rate 2×. If denied, still allow manual address entry.

### 0.5 Address setup (first address — post-signup)
```
┌─────────────────────────┐
│ ◀  Save your address    │
│                         │
│  ┌───────────────────┐  │
│  │                   │  │
│  │   [Google Map]    │  │  Draggable pin, current loc default
│  │      📍           │  │
│  │                   │  │
│  └───────────────────┘  │
│                         │
│ 📍 12/A, HSR Layout... │  reverse-geocoded, editable
│ [Change on map ▲]       │
│                         │
│ House / Flat no. *      │
│ ┌─────────────────────┐ │
│ │                     │ │
│ └─────────────────────┘ │
│                         │
│ Landmark (optional)     │
│ ┌─────────────────────┐ │
│ └─────────────────────┘ │
│                         │
│ Save as                 │
│ [ 🏠 Home ][ 💼 Work ]  │  toggles
│ [ ✏️ Other ]            │
│                         │
│ █████ Save address ████ │  sticky bottom
└─────────────────────────┘
```
▲ Merge `MapPicker.tsx` + `AddAddressSheet.tsx` into one canonical flow. **House number is the #1 delivery-failure field** — make it required and visible.

### 0.6 Name + email (first-run setup)
```
┌─────────────────────────┐
│ Complete your profile   │
│                         │
│  ┌──────┐               │
│  │  VR  │  [+]          │  Avatar with camera badge
│  └──────┘               │
│                         │
│ Full name *             │
│ ┌─────────────────────┐ │
│ │ Vipul Rao           │ │
│ └─────────────────────┘ │
│                         │
│ Email (optional)        │
│ ┌─────────────────────┐ │
│ │                     │ │
│ └─────────────────────┘ │
│                         │
│ Referral code           │  ← NEW, drives K-factor
│ ┌─────────────────────┐ │
│ │                     │ │
│ └─────────────────────┘ │
│                         │
│ █████ Continue ████████ │
└─────────────────────────┘
```
▲ Add referral code entry now — it's cheap and unlocks growth loop later. Move email to secondary (India rarely uses).

---

## 1. Home

### 1.1 Home
```
┌─────────────────────────┐
│ 📍 Home ▼               │  ← LocationBar (top-fixed, taps to picker)
│ 12/A HSR Layout · 2.1km │
├─────────────────────────┤
│ 🔍 Search for services  │  ← REAL input, opens Search screen
├─────────────────────────┤
│                         │
│ ┌────┐ ┌────┐ ┌────┐    │  Rich category tiles, 3-col
│ │ 🧹 │ │ 🔧 │ │ 💡 │    │  colored backgrounds
│ │Clean│ │Plumb│ │Elec │  │  Category label under icon
│ └────┘ └────┘ └────┘    │
│ ┌────┐ ┌────┐ ┌────┐    │
│ │ 💇 │ │ 🎨 │ │ ❄️ │    │
│ │Salon│ │Paint│ │ AC │   │
│ └────┘ └────┘ └────┘    │
│         [See all ►]     │
├─────────────────────────┤
│ ╭───────────────────╮   │  ← Promo carousel
│ │ 20% off first     │   │  Horizontal snap
│ │ booking · FIRST20 │   │
│ ╰───────────────────╯   │
├─────────────────────────┤
│ Book again              │  ← Shows only if user has past bookings
│ ┌──────┐  ┌──────┐      │
│ │ Deep │  │Hair… │      │
│ │Clean │  │      │      │
│ │₹399  │  │₹499  │      │
│ └──────┘  └──────┘      │  Horizontal scroll
├─────────────────────────┤
│ Most booked in Pune│
│ [Service card]          │
│ [Service card]          │
│ [Service card]          │
├─────────────────────────┤
│ 🛡 KYC-verified pros    │  ← Trust bar (no fabricated ratings)
│    · doorstep OTP · SOS │
├─────────────────────────┤
│ [Home][Book][Act][Prof] │  BottomNav
└─────────────────────────┘
```
▲ Six critical additions vs current:
1. **LocationBar at top** — for on-demand services, location > branding
2. **Real search input** — current is a decorative `<span>` (`index.tsx:33-37`)
3. **Rich category tiles**, not chips — Urban Company gets 40% of taps here
4. **Book Again row** — return-user friction eliminator
5. **Promo carousel** — drives coupon adoption
6. **Trust bar** — safety story lives here, not on Service Detail

---

## 2. Discover / Category / Search

### 2.1 Category page
```
┌─────────────────────────┐
│ ◀ Cleaning              │  Category name
├─────────────────────────┤
│ [All][Home][Kitchen][Bath]│  Sub-category chips, horizontal
├─────────────────────────┤
│  Sort: Popular ▼   [⟲] │  ← filter/sort row
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ [img] Deep Clean    │ │  ← rich ServiceCard w/ image
│ │       4.8★ 2.3k     │ │  rating + reviews count
│ │       ⏱ 3-4h        │ │
│ │       ₹1,499  [Add] │ │  ← [Add] instead of "book now"
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ [img] Bathroom Clean│ │
│ │ ...                 │ │
│ └─────────────────────┘ │
│                         │
│ [floating cart bar ▼]   │  ← if cart has items
├─────────────────────────┤
│ 🛒 2 items · ₹1,898 [Cart►]│ ← CartFab, only when items in cart
└─────────────────────────┘
```
▲ Cart-based booking. Each service has [Add]/[+1 -1] instead of "Book Now". This changes the whole booking flow — matches Urban Company.

### 2.2 Search
```
┌─────────────────────────┐
│ ◀ [🔍 Deep clean____×]  │  active input, autofocus
├─────────────────────────┤
│ Recent                  │
│ 🕐 bathroom cleaning    │  ← from localStorage
│ 🕐 electrician           │
│                         │
│ Popular                 │
│ 🔥 deep clean           │
│ 🔥 haircut              │
│ 🔥 tap repair           │
│                         │
│ (as user types →)       │
│ Results                 │
│ ┌─────────────────────┐ │
│ │ [img] Deep Clean    │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```
▲ Real search, backend-powered. Debounced 200ms. Recent stored locally, popular from API.

---

## 3. Service Detail

### 3.1 Service detail
```
┌─────────────────────────┐
│ ◀       Deep Clean   ♡ │  back + favorite toggle
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │                     │ │
│ │   [Hero image]      │ │  ← REPLACE current "Qualified pros" placeholder
│ │                     │ │
│ └─────────────────────┘ │
│                         │
│ Deep Home Cleaning      │  Title
│ 4.8 ★ (2,341)  ⏱ 3-4h  │
│ ₹1,499                  │  Display price, purple
│                         │
├─── Tabs ───────────────┤
│ [Overview][Add-ons][Reviews][FAQ]│
├─────────────────────────┤
│                         │
│ What's included         │
│ ✓ Living, bedroom, kit  │
│ ✓ Bathroom deep clean   │
│ ✓ Balcony sweep+mop     │
│ ✓ Cobweb removal        │
│                         │
│ [+] Add-ons section     │
│ ┌─────────────────────┐ │
│ │ Sofa clean +₹499 [+]│ │
│ │ Fridge      +₹299 [+]│ │
│ └─────────────────────┘ │
│                         │
│ ★ Reviews (2,341)       │
│ ┌─────────────────────┐ │  Horizontal review scroller
│ │ Priya · 5★          │ │
│ │ "Great job..."      │ │
│ └─────────────────────┘ │
│                         │
│ [Show all reviews →]    │
│                         │
│ Provider will be        │
│ assigned after booking  │  ← honesty; matches backend dispatch model
│ 🛡 KYC-verified pros    │
│                         │
├─────────────────────────┤
│ █████ Add to cart ─ ₹1,499│  sticky bottom, primary
└─────────────────────────┘
```
▲ Key changes:
- Real image hero (need image URL from backend `services` table — add field)
- Tabbed content (Overview / Add-ons / Reviews / FAQ)
- Add-ons drive AOV; must live here, not later
- "Provider assigned after booking" — honest match with dispatch model; don't pretend a specific pro is shown
- CTA is "Add to cart", not "Book Now"

### 3.2 Cart
```
┌─────────────────────────┐
│ ◀        Cart           │
├─────────────────────────┤
│ 📍 Home · 12/A HSR    ▶ │  ← address selector, taps to picker
├─────────────────────────┤
│ 📅 Today, 2:00 PM     ▶ │  ← slot selector
├─────────────────────────┤
│ Services (2)            │
│                         │
│ ┌─────────────────────┐ │
│ │ Deep Clean          │ │
│ │ ₹1,499   [−] 1 [+] ×│ │  qty + remove
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ Sofa clean (add-on) │ │
│ │ ₹499     [−] 1 [+] ×│ │
│ └─────────────────────┘ │
│                         │
├─────────────────────────┤
│ 🎟 FIRST20 applied     ✕│  ← applied coupon
│ [Apply another coupon ▶]│
├─────────────────────────┤
│ Bill                    │
│ Subtotal        ₹1,998  │
│ Discount        −₹400   │
│ Taxes (18%)     ₹287    │
│ ────────────────────    │
│ Total           ₹1,885  │
├─────────────────────────┤
│ Payment                 │
│ ○ Pay online (UPI)      │
│ ● Pay after service     │
├─────────────────────────┤
│ ⚠ Cancellation policy   │  ← inline, no separate page
│ Free until pro assigned.│
│ ₹50 after · Free re-book│
├─────────────────────────┤
│ █████ Book & Pay ₹1,885 │  sticky
└─────────────────────────┘
```
▲ Replaces current `BookingSheet.tsx` (`components/BookingSheet.tsx`). The sheet UX is fine for one service but breaks for multiple. Full page is standard for Urban Company / Swiggy.

### 3.3 Slot picker (sheet) — bands for beta
```
┌─────────────────────────┐
│  ═══                    │  drag handle
│  When should we come?   │
│                         │
│ ┌──┬──┬──┬──┬──┬──┬──┐  │  Date pills, horizontal scroll
│ │TDY│TMR│ 12│ 13│ 14│... │
│ │FRI│SAT│SUN│MON│TUE│  │
│ └──┴──┴──┴──┴──┴──┴──┘  │
│                         │
│ Time of day             │
│  ┌───────────────────┐  │
│  │ ⚡ Now (~30 min)   │  │  ← default for Today only
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ ☀ Morning         │  │  8 AM – 12 PM
│  │   8 AM – 12 PM    │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ 🌤 Afternoon       │  │  12 PM – 4 PM
│  │   12 PM – 4 PM    │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ 🌆 Evening        │  │  4 PM – 8 PM
│  │   4 PM – 8 PM     │  │
│  └───────────────────┘  │
│                         │
│ █████ Set slot ─ Aft PM │
└─────────────────────────┘
```
▲ Beta uses **4-hour bands** (Now, Morning, Afternoon, Evening). Simplest for backend: no per-hour availability check, dispatch just posts the offer inside the window and providers self-select. Consumer sees a fuzzy window; backend sends `scheduled_at` = start-of-band. Hourly slots (previously drawn) deferred until we have enough providers to guarantee hourly availability.

**Backend contract (unchanged):** `POST /bookings/ { scheduled_at }` still takes an ISO datetime. Send band start.

### 3.4 Address picker (sheet)
```
┌─────────────────────────┐
│  ═══                    │
│  Select address         │
│                         │
│ 🔍 Search area/pincode  │
│                         │
│ ○ Use current location  │  ← GPS
│                         │
│ ── Saved ──             │
│ ● 🏠 Home               │
│    12/A HSR Layout      │
│ ○ 💼 Work               │
│    Bellandur ORR        │
│ ○ ✏️ Mom's place        │
│    Jayanagar 4th block  │
│                         │
│ [+ Add new address]     │
│                         │
│ █████ Deliver here ████ │
└─────────────────────────┘
```

### 3.5 Coupons list (sheet)
```
┌─────────────────────────┐
│  ═══                    │
│  Coupons & offers       │
│                         │
│ Enter code              │
│ ┌───────────┬─────────┐ │
│ │           │  Apply  │ │
│ └───────────┴─────────┘ │
│                         │
│ Available for you       │
│ ┌─────────────────────┐ │
│ │ FIRST20  ✓ Applied  │ │
│ │ 20% off · min ₹499  │ │
│ │ [Remove]            │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ UPI50               │ │
│ │ ₹50 off via UPI     │ │
│ │ [Apply]             │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

---

## 4. Payment

### 4.1 Payment processing (inline, no separate screen)
Razorpay checkout is a native sheet — currently handled correctly in `tracking.$bookingId.tsx:126-161`. Keep. No wireframe needed.

### 4.2 Payment success
```
┌─────────────────────────┐
│                         │
│      ✅  (large)        │  Animated check
│                         │
│   Booking confirmed     │
│                         │
│   ₹1,885 paid via UPI   │
│   Order #EZ-3821        │
│                         │
│ Your pro will be        │
│ assigned in ~2 mins.    │
│                         │
│ █████ Track booking ███ │
│ ░░░  Back to home  ░░░  │
└─────────────────────────┘
```
▲ Confetti animation + soft haptic. Auto-navigate to Tracking after 2s if user idle.

### 4.3 Payment failed
```
┌─────────────────────────┐
│      ❌                  │
│  Payment couldn't       │
│    go through           │
│                         │
│ Your booking is saved.  │
│ Try a different method  │
│ or pay after service.   │
│                         │
│ █████ Try again ██████  │
│ ░░░ Pay after service░░ │
│ ░░░ Change method  ░░░  │
└─────────────────────────┘
```

---

## 5. Tracking / Order lifecycle

**Six states** driven off `booking.status`. Map + status card + provider card + primary action stack.

### 5.1 Searching for pros (`REQUESTED`)
```
┌─────────────────────────┐
│ ◀      Booking #EZ-3821 │
├─────────────────────────┤
│  ⚡ Finding a pro nearby│  Status card, pulsing icon
│                         │
│  ○───○───○───○───○      │  StatusStepper: step 1 highlighted
│  Find Assign Route Do  Done│
├─────────────────────────┤
│                         │
│       [radar pulse]     │  Animated concentric circles
│           📍            │  Center = user's pin
│                         │
│  ~30 pros contacted     │  live count from BE (nice-to-have)
│                         │
├─────────────────────────┤
│ Deep Clean · ₹1,885     │
│ 📍 12/A HSR Layout      │
│ ⏰ Today, 2:00 PM       │
├─────────────────────────┤
│ ░░░ Cancel booking ░░░  │
└─────────────────────────┘
```

### 5.2 Provider assigned (`ACCEPTED`)
```
┌─────────────────────────┐
│ ◀      Booking #EZ-3821 │
├─────────────────────────┤
│  ✓ Pro assigned         │  Success card
│  ○───●───○───○───○      │  step 2 highlighted
│  Find Assign …           │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ [🧑]  Ravi Kumar    │ │  ← ProviderCard
│ │       4.9★ · 1.2k jobs│ │
│ │       ⏱ Reaches ~2:00PM│ │
│ │       [📞 Call]     │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│ 🔒 DOORSTEP OTP         │  Big, sticky
│    ─────                │
│    9 8 4 2              │  Show only when EN_ROUTE (currently
│    ─────                │  shows on ACCEPTED too — remove)
│    Share with pro when  │
│    they arrive          │
├─────────────────────────┤
│ Deep Clean · ₹1,885     │
│ 📍 12/A HSR Layout      │
├─────────────────────────┤
│ ░░ Cancel (₹50 fee) ░░  │  Fee disclosed
└─────────────────────────┘
```
▲ Fix in current code: OTP shows for both `ACCEPTED` and `EN_ROUTE` (`tracking.$bookingId.tsx:234`). Should only show when pro is en-route — otherwise it leaks 15 minutes early and users forget.

### 5.3 En route (`EN_ROUTE`)
```
┌─────────────────────────┐
│ ◀      Booking #EZ-3821 │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │                     │ │
│ │  [REAL Google Map]  │ │  ← replace placeholder (line 270-287)
│ │   🚗 → 📍           │ │  Provider marker + user marker
│ │                     │ │  Polyline route
│ └─────────────────────┘ │
│                         │
│ ● Ravi arriving in 8min │  live ETA (WS-driven)
├─────────────────────────┤
│ 🔒 OTP: 9 8 4 2         │  sticky-top after map
├─────────────────────────┤
│ [📞 Call] [💬 Chat] [!] │  Chat + SOS row
├─────────────────────────┤
│ [Ravi Kumar card]       │
├─────────────────────────┤
│ ░░ Cancel (₹100 fee) ░░ │  Fee escalates once en-route
└─────────────────────────┘
```
▲ Live tracking is the money screen — currently a placeholder rectangle. Needs a real map integration (Google Maps SDK / Mapbox). Provider location arrives via WebSocket (already wired in backend).

### 5.4 In progress (`IN_PROGRESS`)
```
┌─────────────────────────┐
│ ⚡ Job in progress · 42:18 ← sticky JobTimerBar
├─────────────────────────┤
│  ○───●───●───●───○      │  step 4
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ [🧑] Ravi Kumar     │ │
│ │      4.9 ★  [📞][💬]│ │
│ └─────────────────────┘ │
├─────────────────────────┤
│ What's being done       │
│ ✓ Living room           │
│ ✓ Bedroom               │
│ ● Kitchen (in progress) │  live checklist (phase 2)
│ ○ Bathroom              │
│ ○ Balcony               │
├─────────────────────────┤
│ Need help?              │
│ [SOS] [Report issue]    │  ← safety kit
└─────────────────────────┘
```
▲ Timer bar reassures user something is happening. Live checklist requires provider-side check-off (phase 2). SOS is table stakes for women users.

### 5.5 Completed — rating + tip + receipt (`COMPLETED`)
```
┌─────────────────────────┐
│                         │
│      ✅  Job done       │
│                         │
│   ┌───────────────┐     │
│   │ [🧑] Ravi     │     │
│   └───────────────┘     │
│                         │
│   Rate your experience  │
│   ★ ★ ★ ★ ★             │  taps to select
│                         │
│   Compliments (chips)   │  ← shows if 4+ stars
│   [On time][Clean][Friendly]│
│                         │
│   Add a tip             │  ← shows if 4+ stars
│   [Skip][₹20][₹50][₹100][Custom]│
│                         │
│   Comment (optional)    │
│   ┌─────────────────┐   │
│   └─────────────────┘   │
│                         │
│ █████ Submit review ███ │
│ ░░░ Skip ░░░            │
│                         │
├─────────────────────────┤
│ 📄 Receipt              │
│ Subtotal      ₹1,998    │
│ Discount     −₹400      │
│ Taxes         ₹287      │
│ Tip            ₹50      │
│ ───────────────────     │
│ Total         ₹1,935    │
│ [Download PDF ▶]        │
└─────────────────────────┘
```
▲ Big change: **add tip + compliments to the review flow**. Currently `ReviewSheet.tsx` is just stars + comment. Tips are pure margin for providers and drive retention.

**Tips: 100% to provider.** Platform takes 0% commission on the tip. Track tip as a separate line on the payment intent so accounting can distinguish it from service revenue (and so provider payout logic simply adds it). Tip is optional; skip is a first-class button.

### 5.6 Cancelled
```
┌─────────────────────────┐
│      ⓘ  Cancelled       │
│                         │
│  Your booking was       │
│  cancelled.             │
│  ₹50 fee applies.       │
│                         │
│ Reason: You cancelled   │
│                         │
│ █████ Book again ██████ │
│ ░░░ Contact support ░░  │
└─────────────────────────┘
```

### 5.7 No pros found (`EXPIRED`)
```
┌─────────────────────────┐
│    😔                   │
│  No pros available      │
│                         │
│  We couldn't find a pro │
│  in your area right now.│
│  Try scheduling for a   │
│  different time.        │
│                         │
│ █████ Try later ███████ │
│ ░░░ Different address░░ │
│ ░░░ Notify me   ░░░░░░ │  ← join waitlist
└─────────────────────────┘
```

---

## 6. Bookings & Activity

### 6.1 Bookings list
```
┌─────────────────────────┐
│      My Bookings        │
├─────────────────────────┤
│ [Upcoming][Past][Cancelled]│  three tabs (currently 2)
├─────────────────────────┤
│ Today                   │  ← date grouping
│ ┌─────────────────────┐ │
│ │ [🧹] Deep Clean     │ │
│ │      Ravi · en route│ │
│ │      2:00 PM · ₹1885│ │
│ │      🟢 EN ROUTE    │ │
│ └─────────────────────┘ │
│                         │
│ Tomorrow                │
│ ┌─────────────────────┐ │
│ │ [💇] Haircut Male   │ │
│ │      Assigning...   │ │
│ │      10 AM · ₹299   │ │
│ └─────────────────────┘ │
│                         │
│ Next week               │
│ ...                     │
├─────────────────────────┤
│ [Home][Book][Act][Prof] │
└─────────────────────────┘
```

### 6.2 Booking detail (past)
```
┌─────────────────────────┐
│ ◀      Deep Clean       │
│                         │
│ Completed · Aug 6, 2:00PM│
│ Ravi Kumar · 4.9★       │
│ [Rebook →]              │  ← re-book same service+pro
│                         │
│ 📸 Photos (3)           │  ← provider-uploaded, phase 2
│ [img][img][img]         │
│                         │
│ Your review             │
│ ★★★★★ "Great job!"      │
│                         │
│ 📄 Invoice              │
│ ...                     │
│ [Download PDF]          │
│                         │
│ Need help with this?    │
│ ░ Report an issue ░     │  ← opens support ticket
└─────────────────────────┘
```

### 6.3 Activity (tab)
```
┌─────────────────────────┐
│      Activity           │
├─────────────────────────┤
│ Today                   │
│ 🎁 You earned ₹100      │
│    for referring Priya  │
│ ─────                   │
│ ✅ Booking completed    │
│    Deep Clean · Ravi    │
│                         │
│ Yesterday               │
│ 🎟 New coupon: MONSOON30│
│ ─────                   │
│ 💰 Refund of ₹200 was   │
│    credited to wallet   │
│                         │
│ [Home][Book][Act][Prof] │
└─────────────────────────┘
```
▲ Unifies notifications + wallet events + booking events. Current `activity.tsx` is a stub.

---

## 7. Profile

### 7.1 Profile home
```
┌─────────────────────────┐
│      Profile            │
├─────────────────────────┤
│  ┌────┐                 │
│  │ VR │  Vipul Rao      │
│  └────┘  +91 98765 43210│
│          [Edit ▶]       │
├─────────────────────────┤
│ 🎁 Refer & earn      ▶  │  ← Referral (coupon-based, no wallet)
│ 🎟 Coupons & offers  ▶  │  ← lists available + applied history
├─────────────────────────┤
│ 📍 My addresses (3)  ▶  │  → 7.4
│ 💳 Payment methods   ▶  │  → 7.5
│ 🔔 Notifications     ▶  │  → existing NotificationsRow
├─────────────────────────┤
│ 🆘 Help & Support    ▶  │
│ 📄 About             ▶  │  → About / Legal
│ 📜 Terms & Privacy   ▶  │
├─────────────────────────┤
│  ░░░  Log out  ░░░      │
│                         │
│  v0.4.2 · beta          │  Micro/muted
├─────────────────────────┤
│ [Home][Book][Act][Prof] │
└─────────────────────────┘
```
▲ No wallet (dropped for beta scope). Referrals reward = auto-issued coupon, not cash credit. Coupons row surfaces the existing coupon system (from Cart 3.5) as a first-class inventory the user can browse.

### 7.2 Edit profile — reuse current, minor polish (avatar upload)

### 7.3 Refer & earn
```
┌─────────────────────────┐
│ ◀     Refer & earn      │
├─────────────────────────┤
│ [Illustration: gift]    │
│                         │
│  Give ₹100, get ₹100    │
│                         │
│ Share your code with    │
│ friends. When they      │
│ complete their first    │
│ service, you both get a │
│ ₹100-off coupon         │
│ (valid 90 days).        │
│                         │
│ Your code               │
│ ┌───────────────────┐   │
│ │  VIPUL42          │   │
│ └───────────────────┘   │
│ [Copy]                  │
│                         │
│ █████ Share via ██████  │
│ [WhatsApp] [SMS] [More] │
│                         │
│ Friends joined: 3       │
│ Coupons earned: 3       │
│ [See my coupons ▶]      │  → jumps to Coupons list
└─────────────────────────┘
```
▲ Bonus arrives as a coupon dropped into their coupons inventory. No wallet ledger.

### 7.4 Address book
```
┌─────────────────────────┐
│ ◀    My addresses       │
├─────────────────────────┤
│ 🏠 Home  (default)      │
│ 12/A HSR Layout         │
│ [Edit] [Set default] [🗑]│
│                         │
│ 💼 Work                 │
│ Bellandur ORR           │
│ ...                     │
│                         │
│ [+ Add new address]     │
└─────────────────────────┘
```

### 7.5 Payment methods
```
┌─────────────────────────┐
│ ◀   Payment methods     │
├─────────────────────────┤
│ Preferred               │
│ ● UPI (Razorpay)        │
│ ○ Cash after service    │
│                         │
│ Saved UPI IDs           │
│ 🟣 vipul@okhdfc  [🗑]   │
│ [+ Add UPI ID]          │
│                         │
│ Saved cards             │
│ 💳 HDFC •••• 4242  [🗑] │  ← Razorpay tokens, phase 2
│ [+ Add card]            │
│                         │
│ Netbanking, wallets     │
│ Available at checkout   │  ← not pre-saved
└─────────────────────────┘
```
▲ Multiple saved methods; user picks at Cart (3.2). No wallet payment option (dropped for beta).

### 7.6 Coupons & offers
```
┌─────────────────────────┐
│ ◀   Coupons & offers    │
├─────────────────────────┤
│ Available (2)           │
│ ┌─────────────────────┐ │
│ │ FIRST20             │ │
│ │ 20% off · min ₹499  │ │
│ │ Expires Oct 12      │ │
│ │ [Use now ▶]         │ │  → jumps to Home to start booking
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ RAVIREF (referral)  │ │
│ │ ₹100 off · min ₹499 │ │
│ │ Expires Nov 5       │ │
│ │ [Use now ▶]         │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│ Used (7)  [Expand ▼]    │
│ ─                       │
│ FIRST20 · #EZ-3712      │
│ MONSOON30 · #EZ-3654    │
│ ...                     │
├─────────────────────────┤
│ Have a code?            │
│ [Enter code    ][Apply] │
└─────────────────────────┘
```
▲ Central inventory. Referral bonuses, promos, and refund-as-coupon all land here.

### 7.7 Help & support
```
┌─────────────────────────┐
│ ◀    Help & Support     │
├─────────────────────────┤
│ Recent booking issues?  │
│ ┌─────────────────────┐ │
│ │ #EZ-3821 · Deep C.  │ │
│ │ [Report an issue ▶] │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│ Common questions        │
│ ▶ How is safety ensured?│
│ ▶ Refund policy         │
│ ▶ Cancellation charges  │
│ ▶ Doorstep OTP          │
├─────────────────────────┤
│ Still need help?        │
│ [💬 Chat with support]  │  ← opens in-app Support chat (see §13)
│ [📞 Call support]       │
│ [✉️ Email us]           │
└─────────────────────────┘
```

### 7.8 About / Legal — reuse current `/privacy` `/terms` `/refund`

---

# PROVIDER APP

Same codebase, role-switch on JWT (`role: "provider"`). Different post-auth root — reuse `AuthFlow.tsx` verbatim.

## 8. Provider onboarding

### 8.1 Role select (after OTP verify, if new user)
```
┌─────────────────────────┐
│ Welcome to EazyServ!    │
│                         │
│ How will you use it?    │
│                         │
│ ┌─────────────────────┐ │
│ │ 🏠 I need a service │ │  ← Consumer
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ 🧰 I offer services │ │  ← Provider
│ └─────────────────────┘ │
│                         │
│ You can switch later    │
└─────────────────────────┘
```
▲ Send `role: "provider"` to `/verify-otp` (already supported by backend per `AuthFlow.tsx:71`).

### 8.2 Onboarding stepper (top bar all screens)
```
[● ── ○ ── ○ ── ○ ── ○ ── ○]
 1    2    3    4    5    6
KYC  Bank  Serv Area Photo Ready
```

### 8.3 KYC — Aadhaar
```
┌─────────────────────────┐
│ ◀ Verify Aadhaar   1/6  │
├─────────────────────────┤
│  🪪                     │
│  Aadhaar verification   │
│                         │
│  Aadhaar number         │
│  ┌───────────────────┐  │
│  │ 1234 5678 9012    │  │
│  └───────────────────┘  │
│                         │
│  Upload Aadhaar         │
│  ┌───────┬───────┐      │
│  │ Front │ Back  │      │  camera capture
│  │  [+]  │  [+]  │      │
│  └───────┴───────┘      │
│                         │
│  PAN number             │
│  ┌───────────────────┐  │
│  └───────────────────┘  │
│                         │
│  █████ Continue ██████  │
│                         │
│  🔐 Encrypted at rest   │
└─────────────────────────┘
```
▲ Backend already has PII encryption (`app/utils/encryption.py`). Manual review process — provider is `PENDING_REVIEW` until admin approves via `/admin/kyc`.

### 8.4 Bank / UPI
```
┌─────────────────────────┐
│ ◀ Payout account   2/6  │
├─────────────────────────┤
│  💰                     │
│  Where should we send   │
│  your earnings?         │
│                         │
│  ● UPI ID (fastest)     │
│  ○ Bank account         │
│                         │
│  UPI ID                 │
│  ┌───────────────────┐  │
│  │ vipul@okhdfc      │  │
│  └───────────────────┘  │
│  [Verify UPI ▶]         │  Razorpay Route validation
│  ✓ Verified · Vipul Rao │
│                         │
│  █████ Continue ██████  │
│                         │
│  We pay every Monday for│
│  the previous week.     │
└─────────────────────────┘
```

### 8.5 Service area (map)
```
┌─────────────────────────┐
│ ◀ Service area     3/6  │
├─────────────────────────┤
│  📍 Drag to set base    │
│                         │
│ ┌─────────────────────┐ │
│ │                     │ │
│ │  [Map with pin]     │ │
│ │      📍             │ │
│ │  ⚪ radius circle   │ │  Visual radius overlay
│ │                     │ │
│ └─────────────────────┘ │
│                         │
│ Radius: 5 km            │
│ ⚫──●──────────── 25km   │  Slider
│                         │
│ Estimated reach: ~40k   │  households (BE calculates)
│ homes                   │
│                         │
│ █████ Continue ██████   │
└─────────────────────────┘
```

### 8.6 Choose services
```
┌─────────────────────────┐
│ ◀ Your services    4/6  │
├─────────────────────────┤
│ Category                │
│ [Cleaning] [Plumbing] [Electric] │  chips
│                         │
│ Cleaning services       │
│ ☑ Deep clean · ₹1,499   │
│ ☑ Bathroom · ₹499       │
│ ☐ Sofa clean · ₹699     │
│ ☑ Kitchen · ₹699        │
│                         │
│ Custom price? [Set ▶]   │  ← admin approves overrides
│                         │
│ 3 services selected     │
│                         │
│ █████ Continue ██████   │
└─────────────────────────┘
```

### 8.7 Profile photo + intro
```
┌─────────────────────────┐
│ ◀ Your profile    5/6   │
├─────────────────────────┤
│  ┌────┐                 │
│  │ RK │  [Change photo] │
│  └────┘                 │
│  (Face photo required — │
│   builds trust)         │
│                         │
│  Full name              │
│  Ravi Kumar             │
│                         │
│  Years of experience    │
│  [1] [2-5] [5-10] [10+] │
│                         │
│  █████ Continue ██████  │
└─────────────────────────┘
```

### 8.8 Training + T&C
```
┌─────────────────────────┐
│ ◀ Almost there     6/6  │
├─────────────────────────┤
│ [Video thumbnail ▶]     │
│ 5 min · Watch fully     │
│                         │
│ Quick quiz              │  ← 3 MCQs after video
│ 1. What to do if...     │
│                         │
│ ☐ I've read the         │
│   Partner Code of       │
│   Conduct.              │
│                         │
│ █████ Submit for review │
└─────────────────────────┘
```

### 8.9 Under review
```
┌─────────────────────────┐
│      🕐                 │
│  Your profile is under  │
│  review                 │
│                         │
│  We'll notify you in    │
│  1–2 business days      │
│                         │
│  Reviewed by:           │
│  ✓ KYC                  │
│  ○ Documents (pending)  │
│  ○ Training quiz        │
│                         │
│  Meanwhile:             │
│  [📖 Read partner guide]│
│  [🎥 More training]     │
└─────────────────────────┘
```

---

## 9. Provider Home (post-approval)

### 9.1 Provider Home
```
┌─────────────────────────┐
│ Hi Ravi                 │
│ 4.9 ★ · 1,203 jobs      │
├─────────────────────────┤
│  ┌───────────────────┐  │
│  │  ● GO ONLINE      │  │  ← OnlineToggle (big, purple)
│  │  or  ○ OFFLINE    │  │
│  └───────────────────┘  │
│                         │
│  Online for 2h 14m ⏱   │  Session timer when online
├─────────────────────────┤
│ Today's earnings        │
│ ₹1,240                  │  Display
│ from 3 jobs · [See all]│
├─────────────────────────┤
│ Next job                │
│ ┌─────────────────────┐ │
│ │ 🧹 Deep Clean       │ │
│ │ Priya · HSR Layout  │ │
│ │ ⏰ 2:00 PM · 3.2km  │ │
│ │ ₹1,120 payout       │ │
│ │ [Navigate ▶]        │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│ This week               │
│ ₹5,840  ·  9 jobs       │
│ [Detailed ▶]            │
├─────────────────────────┤
│ 📢 Announcements        │
│ Bonus: 5+ jobs today → │
│ +₹200                   │
├─────────────────────────┤
│ [Home][Jobs][Earn][Prof]│
└─────────────────────────┘
```

### 9.2 Incoming request modal — existing `IncomingRequestCard.tsx`

Already well-built (`components/provider/IncomingRequestCard.tsx`). Only refinements:
- Add haptic + ringtone loop while modal is open (native)
- Show a mini-map thumbnail of the pin location
- Show category icon in the header instead of plain "New job nearby"
- Add "See details" expandable row (address landmarks, customer name if repeat customer)

### 9.3 Accepted — pre-arrival
```
┌─────────────────────────┐
│ ◀      Current job      │
├─────────────────────────┤
│  ✓ You accepted         │
│  ○───●───○───○───○      │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ Priya S.            │ │
│ │ 4.8★ customer       │ │
│ │ [📞 Call] [💬 Chat] │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│ 📍 12/A HSR Layout      │
│    3.2km · ~12 min      │
│ [🧭 Navigate ▶]         │  → opens Google/Apple Maps intent
├─────────────────────────┤
│ 🧹 Deep Clean · 3-4h    │
│ ₹1,120 payout           │
├─────────────────────────┤
│ Job status              │
│ [I'm on my way ▶]       │  ← moves to EN_ROUTE
│ [Reached location ▶]    │  ← next state
├─────────────────────────┤
│ ⚠ Cancel job            │
│ (penalty applies)       │
└─────────────────────────┘
```

### 9.4 Enter doorstep OTP
```
┌─────────────────────────┐
│ ◀ Start job             │
├─────────────────────────┤
│ Ask the customer for    │
│ the 4-digit OTP         │
│                         │
│  ┌──┬──┬──┬──┐          │
│  │  │  │  │  │          │
│  └──┴──┴──┴──┘          │
│                         │
│ [Start ▶]               │
│                         │
│ Can't get OTP?          │
│ [🆘 Call support]       │
└─────────────────────────┘
```

### 9.5 Job in progress (provider view)
```
┌─────────────────────────┐
│ ⚡ In progress · 42:18  │  sticky timer
├─────────────────────────┤
│ Priya S. · Deep Clean   │
├─────────────────────────┤
│ Checklist               │  ← items provider ticks off
│ ☑ Living room           │
│ ☑ Bedroom               │
│ ☐ Kitchen               │
│ ☐ Bathroom              │
│ ☐ Balcony               │
├─────────────────────────┤
│ Add materials/add-ons   │  ← during-job upsell
│ [+ Sofa clean ₹499]     │  taps to request customer approval
│                         │
├─────────────────────────┤
│ 📸 Add photos           │
│ [+]                     │
├─────────────────────────┤
│ ██████ Mark complete █  │  disabled until >1 item checked
│ 🆘 Report issue         │
└─────────────────────────┘
```

### 9.6 Job complete
```
┌─────────────────────────┐
│      ✅                 │
│  Job complete!          │
│                         │
│  Payout: ₹1,120         │
│  Credited: Mon, Aug 12  │
│                         │
│  Customer paid via UPI  │
│                         │
│  Waiting for rating...  │
│                         │
│  █████ Continue ██████  │
└─────────────────────────┘
```
▲ If `payment_method === "cash"`, replace with "Collect ₹1,120 from customer" and a big [Cash Collected] confirmation button.

### 9.7 Rating received (notification)
```
┌─────────────────────────┐
│ ⭐ Priya rated you 5★   │  push notification card
│    "Great job, thanks!" │
└─────────────────────────┘
```

---

## 10. Provider Jobs

### 10.1 Job list
```
┌─────────────────────────┐
│      My Jobs            │
├─────────────────────────┤
│ [Today][Upcoming][Past] │
├─────────────────────────┤
│ Today · 3               │
│ ┌─────────────────────┐ │
│ │ 2:00 PM · Deep Clean│ │
│ │ Priya · HSR         │ │
│ │ 🟢 EN ROUTE   ₹1,120│ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ 5:00 PM · Bathroom  │ │
│ │ Amit · Bellandur    │ │
│ │ 🟡 UPCOMING   ₹399  │ │
│ └─────────────────────┘ │
│                         │
│ [Home][Jobs][Earn][Prof]│
└─────────────────────────┘
```

---

## 11. Provider Earnings

### 11.1 Earnings dashboard
```
┌─────────────────────────┐
│      Earnings           │
├─────────────────────────┤
│ [Day][Week][Month]      │
├─────────────────────────┤
│  ₹5,840                 │  Big number
│  This week              │
│  9 jobs · avg ₹649      │
├─────────────────────────┤
│ [░░░ bar chart ░░░]     │  simple per-day bars
│ M  T  W  T  F  S  S     │
├─────────────────────────┤
│ Payouts                 │
│ ✅ Aug 5 · ₹4,200       │
│    → HDFC •••• 8891     │
│ 🕐 Aug 12 · ₹5,840      │
│    scheduled            │
├─────────────────────────┤
│ Adjustments             │
│ +₹200 bonus (5+ jobs)   │
│ −₹50 cancellation fee   │
├─────────────────────────┤
│ [Home][Jobs][Earn][Prof]│
└─────────────────────────┘
```

### 11.2 Payout detail
```
┌─────────────────────────┐
│ ◀  Payout · Aug 5       │
├─────────────────────────┤
│ ₹4,200                  │
│ Sent to HDFC •••• 8891  │
│ UTR: RZP12345678        │
│                         │
│ For 7 jobs · Jul 29-Aug4│
│                         │
│ Breakdown               │
│ Job #EZ-3720   +₹600    │
│ Job #EZ-3721   +₹1,120  │
│ ...                     │
│                         │
│ [Download statement]    │
└─────────────────────────┘
```

---

## 12. Provider Profile

### 12.1 Profile home
```
┌─────────────────────────┐
│      Profile            │
├─────────────────────────┤
│  ┌────┐  Ravi Kumar     │
│  │ RK │  4.9★ · Silver  │  ← tier badge (phase 2)
│  └────┘  1,203 jobs     │
│          [Edit ▶]       │
├─────────────────────────┤
│ 🎯 Ratings & reviews  ▶ │
│ 🧰 Services offered   ▶ │
│ 📍 Service area       ▶ │
│ 💰 Bank / UPI         ▶ │
│ 🪪 KYC status         ▶ │
├─────────────────────────┤
│ 🆘 Help / grievance   ▶ │
│ 📜 Partner code       ▶ │
├─────────────────────────┤
│ [Log out]               │
├─────────────────────────┤
│ [Home][Jobs][Earn][Prof]│
└─────────────────────────┘
```

### 12.2 Ratings & reviews received
```
┌─────────────────────────┐
│ ◀   My ratings          │
├─────────────────────────┤
│  4.9 ★                  │
│  1,203 ratings          │
│                         │
│ 5★ ██████████ 87%       │
│ 4★ ██         10%       │
│ 3★ ▏           2%       │
│ 2★              0.5%    │
│ 1★              0.5%    │
├─────────────────────────┤
│ Recent reviews          │
│ ┌─────────────────────┐ │
│ │ Priya · ★★★★★       │ │
│ │ Aug 6 · Deep Clean  │ │
│ │ "Great job, thanks!"│ │
│ └─────────────────────┘ │
│ ...                     │
└─────────────────────────┘
```

---

# 13. IN-APP CHAT (shared: consumer ↔ provider, user ↔ support)

One chat surface used in three contexts. Same UI, different peer.

**Where it's triggered:**
- Consumer tracking (5.2, 5.3, 5.4) — [💬 Chat] on ProviderCard → chat with assigned pro
- Provider job screens (9.3, 9.5) — [💬 Chat] → chat with customer
- Help & Support (7.7) — [💬 Chat with support] → chat with EazyServ team

**Lifecycle rules:**
- Chat with provider auto-opens when booking transitions to `ACCEPTED`
- Auto-closes `CHAT_AUTOCLOSE_HOURS` after `COMPLETED` (default 24h; configurable in **hours only** via server-side config)
- Support chat is always available
- Read receipts: single-check sent, double-check delivered, double-check filled = read (WhatsApp convention users already know)
- Media: text + camera photo + live-location share only. No audio/video for beta.
- After auto-close: chat becomes read-only, "Chat has ended" state, still viewable

### 13.1 Chat screen (in-conversation)
```
┌─────────────────────────┐
│ ◀ [🧑] Ravi Kumar   ⋮  │  ← peer name + avatar; menu = block/report
│      Deep Clean · en route│  subtext = context
├─────────────────────────┤
│  Today                  │  date divider
│                         │
│         ┌─────────────┐ │
│         │ On my way,  │ │  ← me (right-aligned, primary bg)
│         │ 8 min ETA   │ │
│         │ 2:12 PM  ✓✓ │ │  time + delivery ticks
│         └─────────────┘ │
│                         │
│ ┌─────────────┐         │
│ │ Great! I'll │         │  ← peer (left-aligned, muted bg)
│ │ be at gate  │         │
│ │ 2:14 PM     │         │
│ └─────────────┘         │
│                         │
│ ┌───────┐               │
│ │[photo]│  Landmark pic │  ← image message
│ │       │  2:15 PM      │
│ └───────┘               │
│                         │
│ ● Ravi is typing…       │  typing indicator (WS)
├─────────────────────────┤
│ Quick replies           │  ← smart suggestions, tap to send
│ [OK][Coming][5 min more]│
├─────────────────────────┤
│ [+] [Type a message ] ▶ │  ← attach + input + send
└─────────────────────────┘
```
▲ Copies WhatsApp's mental model. Quick replies cut typing effort in half — especially useful for providers on bikes.

### 13.2 Attach sheet
```
┌─────────────────────────┐
│  ═══                    │
│  Attach                 │
│                         │
│  [📷 Camera]            │
│  [🖼 Photo]              │
│  [📍 Share location]    │  ← live location for 15 min
│                         │
│  Cancel                 │
└─────────────────────────┘
```

### 13.3 Chat ended (post-completion window)
```
┌─────────────────────────┐
│ ◀ [🧑] Ravi Kumar       │
├─────────────────────────┤
│  [past messages, greyed]│
│                         │
│  ─── Chat has ended ─── │
│                         │
│  For help with this     │
│  booking, contact       │
│  support.               │
│                         │
│  [Contact support ▶]    │
├─────────────────────────┤
│  Input disabled         │
└─────────────────────────┘
```

### 13.4 Chat list (support only — /help subpage)
Users only see one active support thread at a time. **No chat list needed for beta** — jump straight from Help & Support into the single thread. Add a list later if we introduce multi-topic support.

### 13.5 Push notification channels (ring vs normal)
Not a screen — a per-message-type routing decision. This is the "provider trying to reach the customer gets a ring" rule.

| Event                                      | Channel   | Sound  | Rationale                                            |
|--------------------------------------------|-----------|--------|------------------------------------------------------|
| Booking status change (accepted, en_route) | `default` | normal | Ambient info, user checks when they can              |
| Provider chat message to customer          | `urgent`  | **ring** | Provider is at gate / can't find flat — attention-grab |
| Support chat message                       | `default` | normal | Not time-critical                                    |
| Customer chat message to provider          | `default` | normal | Provider is presumably already at/near the job       |
| Offers/promos                              | `default` | normal | Never ring for marketing                             |
| Incoming request (provider side)           | `urgent`  | **ring** | Loud alert on the provider phone to catch the offer  |

**Configuration** — server-driven, easy to toggle:
- Config table `notification_channels` (or Redis-backed feature-flag): `{ event_type, channel, sound_file, is_ring_enabled }`
- Flip a single row to turn ringing off if it becomes annoying
- Client reads channel from FCM payload `data.channel` field and uses it to pick the local Android Notification Channel (Android requires channels declared at install-time — declare all three: `default`, `urgent`, `silent`)
- iOS: use `interruption-level: "time-sensitive"` on urgent

**Tech notes for implementation**
- Use existing WebSocket infra from backend (`app/routers/tracking.py` pattern). Add `/ws/chat/{booking_id}` and `/ws/chat/support/{user_id}`.
- Persist messages in Postgres (`chat_messages` table: `id`, `booking_id?`, `sender_id`, `recipient_id`, `body`, `type`, `read_at`, `created_at`).
- Push notification on message when app backgrounded (FCM already wired).
- No end-to-end encryption for beta — TLS in transit + AES at rest is enough. Add E2E later if a compliance need appears.
- `CHAT_AUTOCLOSE_HOURS` lives alongside booking config (Pydantic Settings in `app/config.py`).

---

# ADMIN (existing web routes, keep desktop-first)

Not re-wireframing — `/admin/kyc` and `/admin/payouts` already exist and are back-office; not the priority. Note only:
- Move admin behind IP allowlist (backend already has this: `app/middleware/*`, per CLAUDE.md)
- Add `/admin/bookings/live` — see running jobs, force-cancel, contact customer/provider
- Add `/admin/providers` — search + KYC status + performance

---

# CROSS-CUTTING / UTILITY

### Push permission prompt (in-app)
```
┌─────────────────────────┐
│  🔔                     │
│  Never miss a booking   │
│  update                 │
│                         │
│  Turn on notifications  │
│  to get:                │
│  ✓ Booking confirmations│
│  ✓ Pro on the way alerts│
│  ✓ Offers & coupons     │
│                         │
│ █████ Turn on ████████  │
│ ░░░ Maybe later ░░░░░   │
└─────────────────────────┘
```
Shown once, after first successful booking. Trigger `NotificationsRow` flow.

### Offline banner
```
┌─────────────────────────┐
│ ⚠ You're offline. Some  │  Yellow strip, sticky top
│   features unavailable. │
└─────────────────────────┘
```

### Force update gate
```
┌─────────────────────────┐
│       ⬆️                │
│  Update required        │
│                         │
│  A newer version of the │
│  app is required to     │
│  continue.              │
│                         │
│ █████ Update now ██████ │
└─────────────────────────┘
```
Already partially handled in `AppVersionGate.tsx`. Keep.

### Empty states
```
┌─────────────────────────┐
│      📭                 │
│  No bookings yet        │
│                         │
│  Book your first service│
│  and it will show up    │
│  here.                  │
│                         │
│ █████ Browse ████████   │
└─────────────────────────┘
```
Repeat pattern for: no addresses, no payment methods, no jobs (provider), no reviews.

---

# PRIORITY & ROLLOUT

If we can't build everything at once (we can't), here's the order I'd sequence:

**Sprint 1 (biggest conversion lift, week 1)**
1. Home 1.1 — LocationBar + real search + rich category grid
2. Service Detail 3.1 — tabs + add-ons + real hero image
3. Cart 3.2 — replace `BookingSheet`
4. Slot picker 3.3
5. Tracking 5.1–5.7 refinements + real map (5.3)

**Sprint 2 (retention, week 2)**
6. Bookings 6.1 improvements + Booking detail 6.2
7. Rating + tip 5.5
8. Referrals 7.3 + Coupons inventory 7.6
9. Onboarding 0.4–0.6 (location prompt, address setup, referral input)
10. In-app chat 13.x (booking-scoped: consumer ↔ provider)

**Sprint 3 (provider — new build, weeks 3–4)**
10. Provider onboarding 8.x
11. Provider Home 9.1
12. Provider job lifecycle 9.3–9.7
13. Provider earnings 11.x
14. Provider profile 12.x

**Sprint 4 (polish + phase 2)**
15. Activity 6.3
16. Help center 7.7
17. Live checklist (5.4, 9.5)
18. Post-job photo evidence

---

# DECISIONS LOCKED IN

- ✅ **Cart-based** booking (multi-service basket; replaces `BookingSheet` modal with full Cart page 3.2)
- ✅ **No wallet.** Payment Methods page (7.5) supports multiple saved UPI/card. Referral bonuses = coupons (7.3, 7.6), not cash credit.
- ✅ **In-app chat** (§13) — consumer ↔ provider (booking-scoped) and user ↔ support. WhatsApp-style UI.
- ✅ **English only.** No language selector. No "coming soon" copy for other languages.
- ✅ **Slot granularity — bands for beta** (Now / Morning / Afternoon / Evening). Simplest for backend, no per-hour availability check. Hourly slots deferred.
- ✅ **Tips — 100% to provider.** No platform cut. Track as a separate line item.
- ✅ **Push notification ringing — provider-to-customer chat only** (plus provider-side incoming request). Server-configurable per event type; single flag turns ringing off.
- ✅ **Chat retention — configurable in hours, default 24h post-COMPLETED.** Stored as `CHAT_AUTOCLOSE_HOURS`.
- ✅ **Chat media — text + photo + live-location** only for beta. No audio/video.

**No open questions blocking implementation.**
