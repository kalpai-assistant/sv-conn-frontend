# v0.dev Design-Tool Prompt Pack

Four design-needed sub-tickets packaged as v0.dev prompts.

**Target**: v0.dev (Vercel) — generates React + Tailwind + shadcn, which
matches our stack exactly, so the output doubles as a starting-point code
reference, not just a visual mock. Any similar tool works (Galileo, Lovable,
Figma AI) — adapt the format if so.

**How to use**: Paste the "Shared context" block ONCE at the start of each
session; then paste ONE of the four briefs. v0 works best focused — don't
dump all four at once.

---

## SHARED CONTEXT (paste first, every session)

I'm designing screens for EazyServ, a mobile-first on-demand home-services
marketplace in India (think Urban Company for Pune). Hard constraints:

**Stack**
- React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui (new-york style,
  slate base, CSS variables mode). Icons from lucide-react.
- All animations via framer-motion. Native haptics via @capacitor/haptics.
- Mobile-first, screens capped at `max-w-md` (~448px). Design for 375px
  base width.
- Typography: Inter (already wired to `font-sans`).
- Routing: TanStack Router with file-based routes under `src/routes/`.
  Use `import { Link } from "@tanstack/react-router"` for in-app links,
  NOT `react-router-dom` or `next/link`.

**Theme — use these tokens EXACTLY. Do not invent new colors.**

Brand color is **blue** (hue 262 in OKLCH), not purple. The app and
marketing site share one identity.

In your generated code:
- **Use shadcn token classes**, not literal Tailwind color classes.
  - ✅ `bg-primary`, `text-primary-foreground`, `bg-muted`,
    `text-muted-foreground`, `border-border`, `bg-card`, `text-foreground`,
    `bg-destructive`, `bg-success`, `ring-ring`.
  - ❌ `bg-blue-500`, `text-slate-900`, `bg-purple-100`, `border-gray-200`.
- **Border radius**: use `rounded-md`, `rounded-lg`, `rounded-xl` — these
  pick up the app's base radius of `0.75rem` via `--radius`.
- If you MUST write a literal color (e.g., a one-off gradient), stick to
  the hue — primary is `oklch(0.5 0.2 262)`, success green is
  `oklch(0.65 0.17 165)`.

**Preview globals — paste these at the TOP of every generated file.**

v0's default preview renders on its own white or dark surface, which does
not match the real app's `--background`. Paste this block in a `<style>`
tag (or the file's global CSS) so the preview paints exactly what the app
renders:

```css
:root {
  --radius: 0.75rem;
  --background: oklch(0.975 0.002 250);
  --foreground: oklch(0.2 0.02 260);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.2 0.02 260);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.2 0.02 260);
  --primary: oklch(0.5 0.2 262);               /* brand blue */
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.95 0.01 260);
  --secondary-foreground: oklch(0.3 0.02 260);
  --muted: oklch(0.95 0.005 260);
  --muted-foreground: oklch(0.5 0.02 260);
  --accent: oklch(0.92 0.01 262);
  --accent-foreground: oklch(0.4 0.15 262);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(1 0 0);
  --success: oklch(0.65 0.17 165);
  --success-foreground: oklch(1 0 0);
  --border: oklch(0.92 0.005 260);
  --input: oklch(0.92 0.005 260);
  --ring: oklch(0.5 0.2 262);
}
body { background-color: var(--background); color: var(--foreground); font-family: Inter, ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
* { border-color: var(--border); }
```

**Preview wrapper — mimic the real app shell.**

The real app mounts every consumer route inside this exact wrapper:

```tsx
// src/routes/__root.tsx — the mobile shell
<div className="safe-top mx-auto max-w-md min-h-screen bg-background pb-20">
  {children}
</div>
```

Wrap your v0 preview the same way so what you render is what I'll see on
device. `safe-top` paints behind the iOS status bar; `pb-20` leaves room
for the BottomNav; `mx-auto max-w-md` is the mobile frame; `bg-background`
is the real app surface.

```tsx
// Preview wrapper (keep in the v0 preview file, DO NOT copy to repo)
<div className="min-h-screen w-full bg-background flex items-start justify-center">
  <div className="mx-auto max-w-md w-[375px] min-h-screen bg-background pb-20">
    <YourComponent {...sampleProps} />
  </div>
</div>
```

**Component purity — what I copy-paste into the repo.**

Split the output so I can copy the component ONLY, not the wrapper:
- The exported component must NOT set `min-h-screen`, `bg-background`,
  `bg-white`, or any outer centering layout. Those belong to the shell.
- The exported component must NOT include the `:root` CSS block — the
  real app already defines these tokens globally.
- Hardcoded colors are banned anywhere in the component: no `bg-white`,
  `bg-slate-50`, `text-gray-900`, `text-black`, hex, or RGB. Only token
  classes (`bg-card`, `text-foreground`, etc.).
- Imports MUST resolve in a standard shadcn repo:
  - shadcn primitives from `@/components/ui/button`, `@/components/ui/card`, etc.
  - `cn` from `@/lib/utils`.
  - Icons from `lucide-react`. Animations from `framer-motion`.
  - In-app links from `@tanstack/react-router` (`import { Link } from "@tanstack/react-router"`).
- Export a React component with a fully typed TypeScript props interface
  so I can wire real data on paste.

If the preview needs seed data, define it in the preview file (not in
the component file) so the component stays data-shaped, not data-bound.

**Audience & tone**
- Users in India, mostly first-time service bookers (home cleaning, salon,
  AC servicing, plumbing). English UI.
- Indian number formatting: ₹1,00,000 (lakh grouping), NOT ₹100,000.
- Tone: direct, warm, no corporate-speak. "Finally the clean I like"
  not "Experience premium home cleaning services."

**References to study before designing**
- Urban Company (urbancompany.com, their app) — THE reference
- Zepto (visual density)
- Swiggy (pricing-breakdown clarity, checkout rhythm)
- Zomato (card density on the dining-out tab)

**Deliverable per brief**
- Two variants per screen (so I can pick). Variant A: "safe, UC-close."
  Variant B: "slightly bolder, more density or illustration."
- Mobile viewport only (375px wide).
- Live React + Tailwind code (not just a static image), because v0's
  output doubles as implementation reference.

---

## REFERENCE FILES FROM THE REAL REPO

Study these three snippets before generating. Your output should match
these conventions — import paths, prop shapes, token usage, how we wrap
Radix/shadcn primitives, how we comment the "why" over the "what".

### 1. Mobile shell (`src/routes/__root.tsx`, excerpt)

Every consumer route mounts inside this. Your component is placed INSIDE
`{children}` — do not duplicate `safe-top`, `mx-auto`, `max-w-md`, or
`bg-background` in your component.

```tsx
<div className="safe-top mx-auto max-w-md min-h-screen bg-background pb-20">
  {children}
</div>
```

### 2. Canonical component with photo + fallback (`src/components/AccountAvatar.tsx`)

Note: imports from `@/components/ui/*`, lucide icon, TanStack Link,
token classes, prop-shape with per-field comments, a helper from
`@/lib/initials` for the fallback. This is the pattern for Brief 1's
Pro photo fallback — reuse `initialsFrom` instead of writing your own.

```tsx
import { Link } from "@tanstack/react-router";
import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";

export function AccountAvatar({
  to,
  name,
  photoUrl,
  className,
}: {
  to: "/profile" | "/provider/profile";
  name?: string | null;
  photoUrl?: string | null;
  className?: string;
}) {
  const initials = initialsFrom(name);

  return (
    <Link
      to={to}
      aria-label="Your profile"
      className={`shrink-0 rounded-full ring-offset-background transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className ?? ""}`}
    >
      <Avatar className="h-9 w-9 border border-border">
        {photoUrl && <AvatarImage src={photoUrl} alt="" />}
        <AvatarFallback className="bg-secondary text-sm font-semibold text-foreground">
          {initials ?? <User className="h-4 w-4 text-muted-foreground" />}
        </AvatarFallback>
      </Avatar>
    </Link>
  );
}
```

### 3. Existing EmptyState (`src/components/EmptyState.tsx`)

This component **already exists**. Brief 3 Part A is to EXTEND it with
illustration support, not to design a new empty-state surface. Do not
recreate; propose an additive prop (`illustration?: ReactNode`) that
replaces the circled icon when provided.

```tsx
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: { label: string; to: string };
  fullScreen?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
  fullScreen = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 px-8 text-center ${
        fullScreen ? "min-h-screen" : "py-12"
      }`}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
        <Icon className="h-8 w-8 text-primary" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && (
        <Link
          to={action.to}
          className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
```

---

## BRIEF 1 of 4 — Pro Trust Card (SVC-386)

**Target file**: `src/components/tracking/ProTrustCard.tsx` (new).
**Mounts on**: `src/routes/tracking.$bookingId.tsx` + booking
confirmation screen (same component on both). Transforms "random
stranger coming to my home" into "verified professional I'll recognize."

Design the "Pro assigned" card shown on the live-tracking screen after a
customer's booking is accepted. One compact card at the top of the
screen, 100% width of the container, below a header strip.

**Must include, visible without scrolling:**
- Circular profile photo (72px), left side. Fallback for missing photo:
  initials in a brand-primary circle (reuse `initialsFrom` from
  `@/lib/initials` as shown in AccountAvatar — do NOT reinvent).
- Pro name (bold, 16px) — single line, truncate with ellipsis if long.
- "Professional at {Business Name}" (smaller, 13px, muted) — e.g.
  "Professional at Priya's Home Services"
- Rating pill: "4.8 ⭐ (124 bookings)" — compact, prominent.
- Three badge chips below the name row:
    (a) "Background verified" with a shield icon
    (b) "3 yrs experience" with a briefcase icon (CONDITIONAL — show
        only if `years_of_experience` prop is defined)
    (c) "Serviced your area 15 times" with a pin icon (CONDITIONAL —
        show only if `area_bookings_count` prop is defined)
- Right side: a small call button (phone icon in a circle) — tappable
  area 44x44 minimum.

**Interactive hints:**
- Entire card tap takes user to a Pro profile page (future).
- Call button taps directly dial.

**Hard rules from the ticket — do NOT bluff data.**
- `bookings_completed_count > 99` must display as `99+`, not the raw
  number. Keeps the card visually tight.
- `rating_count === 0` must show a "New pro" chip instead of a rating
  pill. NEVER render "0.0 ⭐".
- "Background verified" badge renders ONLY when `is_background_verified`
  is `true`. The field is driven by SVC-307 Aadhaar KYC; stubbed `true`
  in v1 but still prop-gated so a false value hides the badge.
- Photo missing or 403 → initials fallback (via Radix Avatar's native
  fallback-on-error), NEVER a broken-image icon. SVC-367 (account
  deletion) scrubs photos so this path is a real one.
- Fields `years_of_experience` and `area_bookings_count` are both
  "may not be tracked" — the component must handle both being undefined
  and lay out cleanly with zero, one, or two of the conditional chips.

**Backend contract** (BookingResponse exposes for the assigned Pro):
`display_photo_url`, `rating_average`, `rating_count`,
`bookings_completed_count`, `is_background_verified`,
`years_of_experience` (optional), `area_bookings_count` (optional).
Shape the TypeScript props interface to mirror this exactly.

**Edge cases to show in your design:**
- New pro: 0 reviews → "New pro" chip, two optional chips both absent.
- Missing photo: initials fallback.
- Long name: ellipsis truncation at the first row break.
- 99+ bookings: compact pill reads "99+ bookings".

**Variant A**: Clean/minimal — tight spacing, understated badges, UC-ish.
**Variant B**: Denser/warmer — bigger photo, more visible badges, a subtle
background gradient to the brand primary at ~5% opacity.

Give me both as a React component with a fully typed props interface.

---

## BRIEF 2 of 4 — Persistent Trust Strip (SVC-387)

**Target file**: `src/components/TrustStrip.tsx` (new).
**Mounts on THREE surfaces** (one component, two variants):
- Home above the service grid — **compact variant**
- Service detail page — **full variant**
- Booking confirmation screen — **full variant**

Design a horizontal strip of 2-4 trust claims. Compact variant on Home
must not take more than **32px vertical**. Full variant can be slightly
taller but still subdued.

**The four candidate claims** (ship whichever subset is legitimately
backed — see Hard Constraint below):

(a) "Background-verified pros" — shield icon
(b) "₹10,000 damage cover" — document-check icon
(c) "Full refund guarantee" — rotate-arrow icon
(d) "Support 10am–10pm" (or "24/7 support" if truly 24/7) — headset icon

Icons are from lucide-react.

**Hard constraint — only ship claims we can back.** v0: assume we're
shipping with 3 claims (background-verified + refund guarantee + support
10am-10pm), dropping the damage-cover claim because no insurance partner
is in place yet. BUT the component must handle 2, 3, OR 4 claims
gracefully — the strip rebalances to fill the row.

**Visual tone**: NOT loud. Subdued background — use the `bg-accent` token
(very light tint of brand blue) or `bg-card` with a hairline `border-border`.
Text is small (11-12px), weight medium. The strip reads as "credibility
hint," not "marketing banner."

**Variant A**: Dividers between claims, no icons visible when space is
tight (icons collapse to text-only on narrow screens).
**Variant B**: Icons always visible, dividers removed in favor of equal
whitespace between claims.

Render both variants at 375px wide, then render the degradation sequence
(4 → 3 → 2 claims) for the chosen variant so I can see how the strip
rebalances. Labels MUST fit single-line without ellipsis at 375px — try
11px font-weight-medium, 14px icon, px-2 gap-1.5. If three claims still
don't fit with icons, degrade to text-only (that's Variant A's compact
mode).

**Non-goals** (per ticket): claims are not interactive, no "which claim
did users tap" analytics, no link-to-detail — v1 is informational only.

React + Tailwind, both variants.

---

## BRIEF 3 of 4 — Empty-State Illustrations + Celebration Moments (SVC-390)

> **Scope note**: SVC-390 is a 5-part micro-polish sprint. v0 only helps
> with 2 parts (empty-state illustrations + celebration moments). The
> other 3 parts (skeleton loaders replacing spinners, haptic feedback on
> primary CTAs, framer-motion shared-element transitions) are
> implementation tasks that don't benefit from design mocks — an engineer
> handles those directly against the real codebase.

Two parts for v0.

### PART A — Illustrated empty states (upgrade existing component)

**IMPORTANT**: The `EmptyState` component **already exists** at
`src/components/EmptyState.tsx` (see Reference files above). Its current
visual is a circled Lucide icon above a headline + subtitle + optional
CTA. The ticket's ask is to UPGRADE this to real line illustrations in
brand primary blue (the ticket text says "brand purple" but that's
pre-brand-shift; the current brand is blue hue 262).

**Design task for v0:**

1. **Propose an additive API** for `EmptyState` that keeps the existing
   `icon`-based call sites working but accepts an `illustration?: ReactNode`
   that, when provided, replaces the circled-icon block entirely.
2. **Design the illustration style** — simple, line-art, single accent
   color = brand primary blue. Aim for Dropbox / Asana / Linear-level
   simplicity. If you can't generate custom SVG illustrations, suggest
   specific unDraw.co templates by name that match each scenario and
   provide tinting instructions (set unDraw's accent to `#2559b1`
   as a hex-approximation of the brand oklch primary).
3. **Render the five scenarios** using the extended component:

The five scenarios:
1. **Empty bookings** — title "No bookings yet", subtitle "Browse
   services to make your first booking", CTA "Explore services" → `/`
2. **Empty cart** — title "Your cart is empty", subtitle "Add services
   to see pricing and book", CTA "Browse services" → `/`
3. **No addresses** — title "No address saved yet", subtitle "Add an
   address to speed up your next booking", CTA "Add address" → `/addresses`
4. **No service in your area** — title "Not serving your area yet",
   subtitle "We're expanding fast — leave your pincode and we'll let you
   know", CTA "Notify me"
5. **No internet** — title "You're offline", subtitle "Check your
   connection and try again", CTA "Try again" (fires a retry handler,
   not a route change — show how the API accommodates this)

### PART B — Celebration moments

Design the "booking confirmed" celebration overlay. Full-screen takeover
for 1.5 seconds after Razorpay returns success:
- Big animated checkmark in a brand-primary (blue) circle (center of screen, 96px)
- Headline "Booking confirmed!" (bold, 28px)
- Subheading "Your pro is on the way" (16px, muted)
- Subtle confetti animation (framer-motion only — don't bring in
  canvas-confetti or Lottie; the ticket excludes heavy dependencies)
- Auto-advances to tracking screen after 1.5s
- **Honor `prefers-reduced-motion`**: when reduced, skip the confetti,
  shorten the checkmark animation, keep the 1.5s hold so the user still
  sees the confirmation state

Also design a smaller inline celebration for other wins (OTP verified,
coupon applied) — just a brief checkmark pulse, no overlay. The haptic
feedback is wired separately (part of SVC-390's haptics work) and is
not v0's concern.

React + framer-motion for both.

---

## BRIEF 4 of 4 — Rich Service Detail Page (SVC-392)

**Target file**: `src/routes/service.$serviceId.tsx` (existing route;
full redesign of its contents).
**Parent epic**: SVC-381 (Feel upgrade · Native polish + catalog depth).

> **Content pipeline is the long pole, not the code** (per ticket).
> Photography + copy for the top-20 services must start BEFORE engineering
> picks this up. v0's output here is design validation, not production
> content — use placeholder "Home Deep Cleaning · 2 BHK" copy throughout.

This is the biggest design task. The service detail page is where
browsing becomes buying — think of it as a mini-magazine per service.

**Backend contract (new fields on `GET /services/{id}` ServiceDetailResponse):**
- `hero_image_url` (string, nullable in v1)
- `faqs` (array of `{question: string, answer: string}`)
- `included_items` (array of strings)
- `excluded_items` (array of strings — already shipped in SVC-340)
- `steps` (array — already shipped in SVC-340, shape:
  `{title: string, duration_minutes: number, icon?: string}`)
- `before_after_photos` (array of `{before_url: string, after_url: string}`, nullable)

Shape the TypeScript props to mirror this. All image fields must handle
`null` gracefully — show a muted placeholder, never a broken-image icon.

Design a scrolling single-page layout for a specific service (use
"Home Deep Cleaning · 2 BHK" as the sample). The layout:

**Section 1: Hero (top of screen)**
- Full-width hero image (16:9 or 4:3). Lazy-load, serve WebP, use CDN
  resize params (`?w=750&fm=webp`). Hero load is a known perf concern.
- Service title (24px, bold) overlaid on bottom-left of image with a
  subtle dark gradient for text contrast
- Price pill in top-right of image: "₹1,499" (brand primary fill)
- Rating under title: "4.8 ⭐ (124 bookings · 23 this week)"
- Fallback for `hero_image_url === null`: a muted `bg-accent` block of
  the same aspect ratio with the title centered on it. Never a broken
  image.

**Section 2: What's included / excluded (just below hero)**
- Two-column grid, "What's included" (green checks using `text-success`)
  and "What's not included" (muted X marks)
- 3-5 items each — map from `included_items` + `excluded_items`

**Section 3: Steps ("Here's what we'll do")**
- Horizontal scrollable card row (or vertical stack if cards are too
  wide for horizontal). 4-5 step cards from the `steps` array:
    1. "Arrive & inspect" — 10 min
    2. "Dusting & cobweb removal" — 30 min
    3. "Deep bathroom cleaning" — 45 min
    4. "Kitchen degreasing" — 40 min
    5. "Final mop & review" — 15 min
- Each card has an icon, step name, duration estimate (`duration_minutes`
  formatted as "X min")

**Section 4: Before/After**
- Two side-by-side images with "Before" / "After" labels — map from
  `before_after_photos[0]`
- Optional slider interaction (drag the divider to reveal more of one
  side)
- Hide the section entirely if `before_after_photos` is empty — never
  show empty "Before" / "After" placeholders

**Section 5: FAQs**
- Accordion of 3-5 common pre-booking questions from `faqs`. Collapsed
  by default. Use shadcn's `Accordion` component from `@/components/ui/accordion`.
- Examples:
    - "Do I need to provide any cleaning supplies?" — No, our pros bring
      everything.
    - "Can I reschedule?" — Yes, up to 2 hours before your slot.
    - "What if I'm not satisfied?" — Full refund guarantee if the service
      isn't to your standard.

**Section 6: Review snippets**
- 2-3 recent 4+ star reviews with photo (if available), reviewer first
  name, date, and the review text truncated to 2 lines with "Read more"

**Floating CTA (always visible at bottom, sticky)**
- Big primary button: "Book now · ₹1,499" (brand primary, 48px tall)
- Must sit above the mobile shell's `pb-20` padding — position
  `fixed bottom-0` with `max-w-md mx-auto` to match the shell width

**Sticky header on scroll (appears after user scrolls past hero)**
- Condensed title + condensed Book CTA
- Use framer-motion `useScroll` + `useTransform` to fade in after hero
  passes

**Non-goals** (per ticket): no comparison UI, no service videos, no
user-uploaded photos.

**Variant A**: Clean, UC-close, tight spacing.
**Variant B**: Denser, more color accents, bolder typography — closer to
Zepto's product-page density.

React + Tailwind + framer-motion for scroll-triggered sticky header +
accordion animations.

**Pro tip for v0**: this is too dense for one generation. Ask v0 for
Sections 1–3 first (hero + included/excluded + steps), then after it
generates, ask it to add Sections 4–6 (before/after + FAQ + reviews +
sticky CTA) in the same chat. Keeps the output within v0's reliable
range.

---

## After you have the mocks

Attach the chosen variant's screenshot (or v0 share link) to the
corresponding SVC Jira ticket. The implementation prompt I write next
will reference it so the agent builds against the chosen design, not
a vague verbal spec.

For SVC-392 specifically: show me the chosen variant first before I
write the implementation prompt — service detail pages are the one
place where a cheap mock-up will mislead a confident agent.
