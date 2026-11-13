# Play Console — Content Rating (IARC) Questionnaire Answers

**App:** EazyServ (`com.eazyserv.app`)
**Prepared for:** Vipul, to paste into Play Console → App content → Content rating.
**Prepared:** 2026-11-04
**Target rating:** General audiences / Everyone / 3+ in all IARC regions.
**Target audience (separate form):** 18+ (Adults only — because of financial
transactions). The IARC rating itself is about content, not audience.

> IARC runs the same questionnaire for every store (Play, App Store, Nintendo
> …). Google maps the answers to each region's rating body (ESRB, PEGI, USK,
> etc.). Our job: answer honestly. Google generates the ratings.

---

## 1. Category selection

**Choose:** Reference, News, or Educational → **Utility, Productivity,
Communication, or Other**.

EazyServ is a home-services marketplace — a utility that connects users with
service providers. It is not a game, not a social network (no user-to-user
posting), not an app for kids.

---

## 2. Questionnaire answers

For every question below the answer is **No** unless stated otherwise. Where
Google asks for context in a free-text field, the row has a note.

### 2.1 Violence

| Question | Answer |
|---|---|
| Does the app contain cartoon or fantasy violence? | **No** |
| Does the app contain realistic violence? | **No** |
| Does the app depict or reference violence against a specific group (real-world)? | **No** |
| Does the app contain prolonged graphic or sadistic realistic violence? | **No** |
| Does the app contain violence against vulnerable groups (children, disabled)? | **No** |
| Does the app depict sexual violence? | **No** |

### 2.2 Sexuality

| Question | Answer |
|---|---|
| Does the app contain nudity? | **No** |
| Does the app contain sexual themes or innuendo? | **No** |
| Does the app contain explicit sexual content? | **No** |

### 2.3 Language

| Question | Answer |
|---|---|
| Does the app contain profanity or crude humor? | **No** |
| Does the app contain strong profanity or crude references? | **No** |

### 2.4 Controlled substances

| Question | Answer |
|---|---|
| Does the app reference or depict the use of tobacco, alcohol, or drugs? | **No** |
| Does the app facilitate the sale of tobacco, alcohol, or drugs? | **No** |

### 2.5 Gambling

| Question | Answer |
|---|---|
| Does the app contain simulated gambling? | **No** |
| Does the app enable real-money gambling? | **No** |

### 2.6 User-generated content / social features

| Question | Answer |
|---|---|
| Does the app allow users to interact or exchange content with each other? | **No (beta)** — no chat, no reviews, no public user-to-user messaging. Users book a service; the provider contacts them via phone (`tel:` deep link). Flag for Vipul: if the ratings/reviews feature (SVC-39x line) ships before launch, flip this to **Yes** and declare "Users can share content: text (reviews)". |
| Does the app share user-generated content publicly? | **No** |
| Does the app allow users to communicate with each other through voice or video? | **No** |
| Does the app allow users to find other users? | **No** — consumers only see the provider they've been matched with for a specific booking. |

### 2.7 Personal information sharing

| Question | Answer |
|---|---|
| Does the app share the user's name, email, or other personal information with other users? | **Yes.** When a booking is accepted, the consumer's name, phone number, and full address are shared with the assigned Service Provider / Professional so they can perform the service. Likewise, the provider's name and masked phone are shown to the consumer. This is core app functionality for an on-demand services marketplace. |
| Does the app share the user's precise location with other users? | **Yes.** During an active en-route / in-progress booking, the consumer sees the assigned provider's live location (foreground only, cached with short TTL, not archived). The provider sees the consumer's address (required to arrive). See `backend/app/routers/tracking.py`. |

> On the IARC form, these are typically handled as questionnaire checkboxes
> ("App allows users to interact / share location / share contact info"). Even
> though they're "Yes", they don't trigger a higher rating by themselves — but
> they are the trigger for the **Social interaction** feature flag Google
> shows on the store listing.

### 2.8 Miscellaneous

| Question | Answer |
|---|---|
| Does the app contain horror or fear-inducing content? | **No** |
| Does the app contain discriminatory or hate content? | **No** |
| Does the app promote or glorify illegal activities? | **No** |

---

## 3. Digital purchases / commerce

Not an IARC question, but Play asks separately whether the app contains in-app
purchases.

- **In-app purchases:** **No** — payments happen via Razorpay Standard
  Checkout (an in-app WebView) and settle to a bank account. This is a
  real-world-goods-and-services transaction (home services performed by a
  human provider), not an IAP, and Play's billing policy exempts it.
- **Advertising:** **No** — app does not display ads.
- **Digital goods or services:** **No** — nothing digital is delivered.

Flag for Vipul: Google's policy page
https://support.google.com/googleplay/android-developer/answer/9858738
spells out the real-world-goods exemption. Keep a screenshot of the policy
dated 2026-11-04 in case Play Review ever challenges the Razorpay flow.

---

## 4. Summary — what Google will likely assign

With the answers above:

- **ESRB (North America):** **Everyone**
- **PEGI (Europe):** **3**
- **USK (Germany):** **0**
- **IARC generic:** **3+**
- **Google Play default:** **Everyone** / **Rated for 3+**

Feature flags Play will display on the listing:

- **Users interact** → Yes (in-booking contact sharing)
- **Shares location** → Yes (in-booking tracking)
- **Shares personal info** → Yes (in-booking address / phone sharing)
- **Digital purchases** → No
- **Ads** → No

---

## 5. Open items flagged for Vipul

1. **If reviews / ratings ship before launch:** flip the UGC question in §2.6
   from "No" to "Yes — Text (reviews)". Rating stays the same, but the store
   listing will add a "User reviews" tag.
2. **18+ audience selection** goes in the *separate* "Target audience and
   content" form (not IARC). See `store-listing.md` for that selection.
