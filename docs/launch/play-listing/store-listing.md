# Play Console — Store Listing Copy

**App:** EazyServ (`com.eazyserv.app`)
**Prepared for:** Vipul, to paste into Play Console → Main store listing.
**Prepared:** 2026-11-04
**Voice:** "Pune's fair, transparent home-services app." — matches the About
screen (`frontend/src/routes/about.tsx`): calm, specific, no superlatives,
emphasis on KYC-verified pros and transparent pricing.

---

## 1. App details

| Field | Value | Max | Notes |
|---|---|---:|---|
| **App name** | `EazyServ` | 30 | Leave as-is. Matches `android:label=@string/app_name`. If branding asks for a tagline here, Play will cut it — use short description instead. |
| **Short description** | `Pune's fair home services — cleaning, plumbing, salon, more.` | 80 | 60 characters. Tested at 80-char Play preview width; wraps cleanly. |
| **Full description** | See §2 below | 4000 | ~1,900 characters. Keyword-rich but human; no keyword stuffing. |
| **App icon** | Existing `ic_launcher` (already in `android/app/src/main/res/mipmap-*/`) | — | Confirm it's the current "E" mark on the EazyServ blue (brand hue 262 — see memory `reference_eazyserv_brand_color.md`). |
| **Feature graphic** | 1024 × 500 PNG | — | Brief lives in `screenshot-briefs.md`. |
| **Phone screenshots** | 2–8 at 1080 × 1920 or 1080 × 2340 | — | Briefs in `screenshot-briefs.md`. |
| **Developer name** | `EazyServ Technologies India Private Limited` | — | Matches the legal name used in `src/legal/privacy.md`. |
| **Contact email** | `support@eazyserv.com` | — | Confirm this address is monitored before submission. |
| **Contact phone** | *(optional — leave blank for beta)* | — | — |
| **Website** | `https://eazyserv.com` | — | — |
| **Privacy policy URL** | *See `privacy-policy-url.md` — needs to be made crawlable before submission.* | — | — |

---

## 2. Full description (long description — paste into Play Console)

```
EazyServ brings fair, transparent home services to Pune. Book a KYC-verified
professional for home cleaning, bathroom cleaning, plumbing, electrical
work, appliance repair, pest control, salon at home, and more — with
upfront pricing, no surge, and no hidden fees.

Why EazyServ

• KYC-verified professionals. Every Service Provider on EazyServ completes
  a document and selfie verification before taking a single booking. You
  see who's arriving, and so do we.
• Fair, upfront pricing. The price shown in the app is the price you pay.
  No surge. No "inspection fee" surprises at the door.
• Real-time tracking. When your Pro is on the way, watch them arrive on
  the map — no more "sir, five minutes" for an hour.
• Pay how you want. UPI, cards, net banking, or cash — all through
  Razorpay's secure checkout. We never see your card details.
• Pune-first. We launched in Pune because our team lives here. Every
  service, every Pro, every support call is tuned for how Pune actually
  works.

What you can book

Home cleaning, deep cleaning, bathroom and kitchen cleaning, plumbing,
electrical repairs, AC service, appliance repair, pest control, salon at
home for women, haircut at home for men, massage at home, home painting
quotes, carpentry, and more. New services added every month.

How it works

1. Pick a service and a time slot that works for you.
2. Confirm the address and the price.
3. Your Pro arrives in the window, scans the booking, and gets to work.
4. Pay in the app or in cash. Done.

Service area

EazyServ is live in Pune, with select PCMC and Hinjewadi pincodes. Enter
your address in the app — if we don't serve it yet, we'll let you know and
add you to the waitlist.

Safe, private, your data stays yours

We ask for your phone, address, and location only where we need them to
deliver a service. Your Aadhaar is never collected from consumers — only
from Service Providers for KYC, and it's encrypted at rest. See our full
privacy policy in the app or at eazyserv.com/privacy.

Support

Got a question or a complaint? Tap "Support" in the app, or email us at
support@eazyserv.com. We answer every message.

EazyServ is built in Pune for Pune.
```

Character count: **~1,870 / 4000.** Leaves room for keyword expansion if ASO
asks for it later.

---

## 3. App category and tags

| Field | Value | Notes |
|---|---|---|
| **App category** | `Lifestyle` | Primary. Home services sits here. Secondary candidates: `House & Home` (Play has a sub-category) or `Shopping`. Pick `Lifestyle` for broadest reach; the alternative is `House & Home` if Vipul wants tighter positioning. |
| **Tags (up to 5)** | `Home services`, `Local services`, `Cleaning`, `Daily life`, `Home improvement` | Play suggests these from the category. Final list auto-suggested at submit time — pick what matches. |

---

## 4. Target audience and content (separate form)

| Question | Answer |
|---|---|
| Target age group | **18+** only. The app involves financial transactions and KYC; it is not designed for anyone under 18. |
| Does your app unintentionally appeal to children? | **No.** Visual design is adult/utility; no cartoon mascots, games, or children's themes. |
| Store presence | **Show on Play Store** for 18+ users only. Do **not** opt into "Designed for Families." |
| Ads in app | **No ads.** |

---

## 5. App access (gated content review hint)

Reviewers need to log in to see the real app. Provide them a test account:

- Phone: a sandbox MSG91 number OR a real test phone that forwards OTP to a
  shared inbox (set this up before submission).
- Sandbox Razorpay credentials pre-wired for the reviewer's test bookings
  (so they can complete a flow without touching production payouts).
- A one-page "How to test EazyServ" doc for the reviewer explaining:
  (1) enter the test phone, (2) tap OTP, (3) select a service, (4) complete
  booking with sandbox Razorpay.

Flag for Vipul: this is a non-trivial setup. Budget a day for the reviewer
account before submitting.

---

## 6. Open items flagged for Vipul

1. **Privacy policy URL** — see `privacy-policy-url.md`. Must be a crawlable
   public URL before Play will accept the Data Safety form.
2. **Developer name legal spelling.** The in-app privacy policy uses
   "Eazyserv Technologies India Private Limited" (lower-case "serv"). Play
   verifies against MCA records. Confirm the exact spelling registered with
   Play Developer account.
3. **Contact email mailbox.** `support@eazyserv.com` must be monitored —
   Play sends policy and review mail here. If this isn't yet wired, pick a
   Gmail that Vipul reads and swap it in later via the Developer Account
   contact, not the Store Listing contact (the listing contact is public).
4. **Secondary category / tags.** If growth cares more about discoverability
   under "House & Home," ping me before submission and we'll re-pick.
