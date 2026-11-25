/**
 * Launch post (SVC-378 Phase 5). Draft; Vipul can edit freely.
 *
 * Voice: honest, founder, present-tense. Deliberately avoids:
 * - Numbers we can't evidence ("10,000+ bookings", "4.9 stars").
 * - Competitor name-and-shame (Urban Company, housejoy, Taskbob) —
 *   positive differentiation, not negative framing.
 * - "AI-powered" / "leveraging" / "ecosystem" — jargon the reader
 *   has to translate.
 *
 * Every hard claim here has a source in the shipped product:
 * - KYC verification → terms.md §(b), onboarding flow
 * - OTP on arrival → booking flow + AuthFlow
 * - Transparent pricing → cart.tsx PricingBreakdown
 * - Pune beta → ops reality
 */
export default function WhyPune() {
  return (
    <>
      <p>
        Six months ago, one of us needed a plumber in Pune. The pipe under the kitchen sink had
        started leaking at 10 PM on a Sunday. We did what everyone in Pune does — we asked a
        WhatsApp group.
      </p>

      <p>
        Three contacts came back. One number was out of service. One person said they could come
        tomorrow, between 10 AM and 6 PM — "please call when you reach home." The third quoted ₹800
        before seeing the sink, then ₹2,400 after he arrived. We paid, obviously. A wet kitchen
        floor doesn't give you negotiating leverage.
      </p>

      <p>
        That evening is the <strong>why</strong> of EazyServ. Not because a plumber overcharged us —
        he probably needed the money — but because <strong>the whole flow was broken</strong>: no
        one knew who was going to show up, no one could tell us the price before they saw the work,
        and we had no way to tell whether this person was actually a plumber or a guy with a
        WhatsApp number.
      </p>

      <h2>Three things we decided had to be true</h2>

      <p>We wrote them on a whiteboard in July 2026 and they've stayed on it:</p>

      <ol>
        <li>
          <strong>You know who's showing up.</strong> Every professional on EazyServ clears a KYC
          check — ID, address, and background — before they can accept a single job. When a job is
          assigned, you see their name, their face, and their rating.
        </li>
        <li>
          <strong>You know the price before you confirm.</strong> No bidding, no haggling, no
          surprise invoices. If the job needs parts, they're charged separately and visible on your
          final bill, but the service rate itself is locked when you book.
        </li>
        <li>
          <strong>Work starts when you say so.</strong> Every booking generates a one-time code on
          your phone. The professional can't mark the job as started until you share it. It sounds
          small; it's actually the single feature that converts "a stranger is at my door" into "a
          service I'm in control of."
        </li>
      </ol>

      <h2>Why Pune, and why now</h2>

      <p>
        We live here. Two of our founders grew up here. The third moved here four years ago and
        hasn't looked back. We know Kothrud's narrow lanes, we know which corner of Baner still
        doesn't have piped gas, we know why nobody in Hinjewadi believes "half an hour" means thirty
        minutes. Building a hyper-local service for a city we don't live in would be dishonest, and
        dishonesty on an app a stranger invites into their home is a killing blow.
      </p>

      <p>
        We're also small, deliberately. Beta is one neighbourhood at a time — we add a locality only
        when we have verified professionals who can actually reach it within the ETA we show you. If
        your PIN isn't live yet, the app tells you upfront; we won't let you book a service that
        nobody can honestly deliver.
      </p>

      <h2>What we're not promising</h2>

      <p>
        A startup blog post is supposed to end with a crescendo. "By 2030 we will be the Amazon of
        services." We're not going to do that, for a couple of reasons.
      </p>

      <p>
        First, nobody believes it. Second, and more honestly: we don't know. We know what we're
        trying to make work in Pune in the next twelve months. We know that scales to the other
        Tier-1 cities in India if we get it right here. Beyond that, promises are cheap.
      </p>

      <p>
        What we <em>can</em> promise is this: if you book a service with us and something goes
        wrong, a real person at a real email address —{" "}
        <a href="mailto:support@eazyserv.com">support@eazyserv.com</a> — reads your message and
        replies, usually same-day. We're small enough that we can keep that promise. When we're
        bigger, we'll find a way to keep it then too.
      </p>

      <h2>Try it, or don't, but tell us what we got wrong</h2>

      <p>
        If you're in Pune: <a href="/download">install EazyServ</a>, book something small, and write
        to us. If you're not in Pune: we'll be there when we're honest-ready, not before.
      </p>

      <p>Thanks for reading. Back to building.</p>
    </>
  );
}
