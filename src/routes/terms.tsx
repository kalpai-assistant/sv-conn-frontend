/**
 * Terms of Service (SVC-37).
 *
 * Templated for the ServiceConnect beta. Reviewed internally; a licensed
 * lawyer sign-off is scheduled before public beta launch (SC-51).
 *
 * If you're editing this, also update src/routes/privacy.tsx and bump both
 * "Last updated" dates together. Razorpay merchant onboarding, Play Store,
 * and App Store all point at fixed URLs — add a redirect before renaming.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/terms")({
  component: TermsOfServicePage,
});

const LAST_UPDATED = "19 July 2026";
const COMPANY_NAME = "ServiceConnect (a product of ServiceConnect Pvt Ltd)";
const CONTACT_EMAIL = "support@serviceconnect.in";
const REGISTERED_ADDRESS = "Bangalore, Karnataka, India"; // TODO: full registered address once incorporated

function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </div>

      <article className="prose prose-slate max-w-none text-[15px] leading-relaxed">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>Template — pending independent legal review.</strong> Reviewed
          internally; final legal sign-off is scheduled before public beta.
        </div>

        <h1 className="mt-6 text-2xl font-semibold text-foreground">Terms of Service</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

        <section className="mt-6">
          <p>
            These Terms of Service (<em>"Terms"</em>) govern your access to and
            use of the ServiceConnect mobile app and website (the{" "}
            <em>"Platform"</em>), operated by {COMPANY_NAME} (<em>"we", "us"</em>).
            By using the Platform you agree to these Terms. If you don't agree,
            don't use the Platform.
          </p>
        </section>

        <h2 className="mt-8 text-xl font-semibold">1. What ServiceConnect is</h2>
        <p>
          ServiceConnect is a technology platform that connects customers looking
          for home services (cleaning, salon, appliance repair, plumbing, and
          similar) with independent service partners who provide those services.
        </p>
        <p>
          We are <strong>not</strong> the service provider. Service partners are
          independent contractors, not our employees. We facilitate the booking
          and payment but the service itself is a contract between you and the
          partner.
        </p>

        <h2 className="mt-8 text-xl font-semibold">2. Who can use the Platform</h2>
        <ul className="list-disc pl-6">
          <li>You must be at least 18 years old.</li>
          <li>You must provide accurate information and keep it up to date.</li>
          <li>
            To register as a <strong>service partner</strong>, you must
            additionally pass our KYC verification (Aadhaar + selfie) and provide
            valid payout details. We reserve the right to reject or terminate
            partner accounts that don't meet our verification standards.
          </li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">3. Bookings, pricing, and payment</h2>
        <ul className="list-disc pl-6">
          <li>
            Prices displayed at the time of booking are what you'll pay for the
            service. We may charge additional platform fees (currently ₹0 for
            beta) which will be shown separately.
          </li>
          <li>
            <strong>Payment</strong> is processed via Razorpay. You can pay
            online (UPI, card, wallet, netbanking) or in cash to the partner.
            We do not store your card details.
          </li>
          <li>
            <strong>Cancellation</strong> — you can cancel a booking free of
            charge before a partner is en-route. Cancellations after a partner
            has been assigned and dispatched may incur a fee of ₹50 (subject to
            change; the applicable fee is shown at cancel time).
          </li>
          <li>
            <strong>Refunds</strong> — for online payments, refunds are
            processed back to your original payment method within 10–15 business
            days. Cash payments cannot be refunded via the Platform.
          </li>
          <li>
            <strong>Disputes</strong> — if you disagree with a service outcome,
            raise it via in-app support within 48 hours of completion. We
            mediate but do not guarantee refunds — the final decision depends
            on evidence from both parties.
          </li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">4. Partner payouts</h2>
        <p>Applies to service partners only.</p>
        <ul className="list-disc pl-6">
          <li>
            Your earnings equal <strong>80% of the service amount</strong> for
            each completed booking; ServiceConnect retains 20% as a platform
            commission.
          </li>
          <li>
            <strong>Payout cadence</strong> — weekly batch, processed every
            Monday for the preceding week's completed bookings. Individual
            payouts under ₹100 may be held to the following week to avoid
            per-transaction fees.
          </li>
          <li>
            Cash-payment bookings — the partner collects cash on delivery from
            the customer. The partner owes ServiceConnect the 20% commission,
            which is deducted from the partner's next online-payout batch.
          </li>
          <li>
            Chargebacks and refunds may result in a corresponding reversal of a
            paid-out amount. This will be transparent on your earnings ledger.
          </li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">5. Your responsibilities</h2>
        <h3 className="mt-4 font-semibold">As a customer</h3>
        <ul className="list-disc pl-6">
          <li>Provide a safe environment for the service partner.</li>
          <li>Be present at the address at the scheduled time, or communicate delays.</li>
          <li>Do not harass, threaten, or discriminate against service partners.</li>
          <li>Pay for the service as agreed.</li>
        </ul>
        <h3 className="mt-4 font-semibold">As a service partner</h3>
        <ul className="list-disc pl-6">
          <li>Provide the service as described, at the quality expected.</li>
          <li>Arrive at the booked time or communicate any delay.</li>
          <li>Follow customer instructions unless doing so would be unsafe.</li>
          <li>
            Maintain your KYC information up to date; false or forged documents
            result in immediate termination and possible legal action.
          </li>
          <li>Do not solicit customers outside the Platform.</li>
          <li>Report incidents, damages, or safety issues promptly.</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">6. Prohibited uses</h2>
        <p>You must not:</p>
        <ul className="list-disc pl-6">
          <li>Use the Platform for anything illegal, harmful, or that violates any third party's rights.</li>
          <li>Impersonate anyone, or misrepresent your affiliation with any entity.</li>
          <li>Access the Platform via automated means (bots, scrapers) except with our written permission.</li>
          <li>Attempt to reverse engineer, decompile, or extract source code from the app.</li>
          <li>Interfere with the security or integrity of the Platform (probing, hacking, uploading malware).</li>
          <li>Bypass our commission by attempting to move a transaction off-Platform after being introduced via ServiceConnect.</li>
        </ul>
        <p>
          Violations may result in account suspension or termination, and where
          applicable, referral to law enforcement.
        </p>

        <h2 className="mt-8 text-xl font-semibold">7. Content you provide</h2>
        <ul className="list-disc pl-6">
          <li>You retain ownership of reviews, photos, and other content you submit.</li>
          <li>By submitting, you grant us a worldwide, royalty-free licence to use, display, and distribute that content in connection with the Platform.</li>
          <li>You represent that you have the rights to submit anything you upload and that it doesn't infringe anyone else's rights.</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">8. Ratings and reviews</h2>
        <p>
          Ratings and reviews must be honest, based on actual experience, and
          respectful. We reserve the right to remove content that is abusive,
          defamatory, off-topic, or that appears fraudulent (e.g. fake reviews
          from related accounts).
        </p>

        <h2 className="mt-8 text-xl font-semibold">9. Termination</h2>
        <ul className="list-disc pl-6">
          <li>You may delete your account at any time via in-app settings or by contacting support.</li>
          <li>We may suspend or terminate your account without notice for a material breach of these Terms or for reasons of safety, fraud prevention, or legal compliance.</li>
          <li>Termination does not affect obligations that survive by nature (payment obligations already incurred, indemnities, data retention required by law).</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">10. Disclaimers</h2>
        <p>
          The Platform is provided <em>"as is"</em> and <em>"as available"</em>.
          To the maximum extent permitted by law, we disclaim all warranties —
          express, implied, or statutory — including warranties of
          merchantability, fitness for a particular purpose, and non-infringement.
        </p>
        <p>
          We do not warrant that the service performed by a partner will meet
          any specific standard; we only facilitate the booking. Complaints
          about service quality follow the dispute-resolution process in
          Section 3.
        </p>

        <h2 className="mt-8 text-xl font-semibold">11. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, our aggregate liability for
          any claim arising out of or in connection with the Platform will not
          exceed the total amount you paid us in the three months preceding the
          event giving rise to the claim, or ₹5,000, whichever is greater.
        </p>
        <p>
          We are not liable for indirect, incidental, special, consequential,
          or punitive damages.
        </p>

        <h2 className="mt-8 text-xl font-semibold">12. Indemnity</h2>
        <p>
          You agree to indemnify and hold {COMPANY_NAME} harmless from any
          claim, loss, or expense (including reasonable legal fees) arising out
          of your violation of these Terms, misuse of the Platform, or
          infringement of any third-party right.
        </p>

        <h2 className="mt-8 text-xl font-semibold">13. Governing law and dispute resolution</h2>
        <ul className="list-disc pl-6">
          <li>These Terms are governed by the laws of India.</li>
          <li>Any dispute will be resolved through binding arbitration under the Arbitration and Conciliation Act, 1996, with a single arbitrator, seated in Bangalore, in English. Interim relief may still be sought from the courts of Bangalore.</li>
          <li>To the extent any dispute is not resolvable by arbitration, the courts of Bangalore have exclusive jurisdiction.</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">14. Changes</h2>
        <p>
          We may update these Terms from time to time. Material changes will be
          communicated via in-app notice and email. Continuing to use the
          Platform after a change constitutes acceptance.
        </p>

        <h2 className="mt-8 text-xl font-semibold">15. Contact</h2>
        <dl className="mt-2 space-y-1 text-sm">
          <dt className="font-semibold">Support</dt>
          <dd><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></dd>
          <dt className="mt-3 font-semibold">Registered address</dt>
          <dd>{REGISTERED_ADDRESS}</dd>
        </dl>

        <hr className="my-8 border-border" />
        <p className="text-xs text-muted-foreground">
          See also our{" "}
          <Link to="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </article>
    </div>
  );
}
