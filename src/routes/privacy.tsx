/**
 * Privacy Policy page (SVC-37).
 *
 * Templated for the ServiceConnect beta — DPDP Act 2023 aware. Reviewed
 * internally; a licensed lawyer sign-off is scheduled post-beta (SC-51).
 *
 * If you're editing this file, also update src/routes/terms.tsx and bump the
 * "Last updated" date. Both docs must be linked from Razorpay merchant
 * onboarding, Play Store data-safety form, and App Store privacy nutrition
 * label — so a URL change is disruptive. Add a redirect first.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPolicyPage,
});

const LAST_UPDATED = "19 July 2026";
const COMPANY_NAME = "ServiceConnect (a product of ServiceConnect Pvt Ltd)";
const CONTACT_EMAIL = "privacy@serviceconnect.in";
const GRIEVANCE_OFFICER_EMAIL = "grievance@serviceconnect.in";
const REGISTERED_ADDRESS = "Bangalore, Karnataka, India"; // TODO: replace with full registered address once incorporated

function PrivacyPolicyPage() {
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
          <strong>Template — pending independent legal review.</strong> This policy is
          drafted from published Indian marketplace privacy policies and the
          Digital Personal Data Protection Act 2023 (DPDP). Final legal sign-off
          is scheduled before public beta launch.
        </div>

        <h1 className="mt-6 text-2xl font-semibold text-foreground">Privacy Policy</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

        <section className="mt-6">
          <p>
            {COMPANY_NAME} (<em>"we", "us", "our"</em>) operates the ServiceConnect
            mobile application and website (together, the <em>"Platform"</em>).
            This Privacy Policy explains what personal data we collect from you,
            why we collect it, how we use it, and the rights you have under Indian
            law — including the Digital Personal Data Protection Act, 2023
            (<em>DPDP Act</em>).
          </p>
          <p>
            By using the Platform, you consent to the collection and use of your
            personal data as described in this policy.
          </p>
        </section>

        <h2 className="mt-8 text-xl font-semibold">1. What we collect</h2>

        <h3 className="mt-4 font-semibold">1.1 Account &amp; identity</h3>
        <ul className="list-disc pl-6">
          <li>
            <strong>Phone number</strong> — collected at signup for OTP-based
            authentication. We use this to send you booking updates and receipts.
          </li>
          <li>
            <strong>Name and email</strong> — provided during profile setup, used
            to personalise the app and correspond with you.
          </li>
          <li>
            <strong>Address(es)</strong> — the service addresses you save. We
            share the specific address with your assigned service partner so they
            can reach you.
          </li>
        </ul>

        <h3 className="mt-4 font-semibold">1.2 Service partners only</h3>
        <ul className="list-disc pl-6">
          <li>
            <strong>KYC documents</strong> — Aadhaar (front + back) and a live
            selfie. Required to verify identity under RBI KYC guidelines before
            you can receive job requests. Stored encrypted at rest; visible only
            to authorised ServiceConnect admins during verification. Never
            shared with customers.
          </li>
          <li>
            <strong>Payout details</strong> — UPI ID or bank account + IFSC.
            Stored encrypted; used solely to pay you your earnings via RazorpayX.
          </li>
          <li>
            <strong>Languages you speak, profile photo</strong> — shown to
            customers so they can pick partners they can communicate with.
          </li>
        </ul>

        <h3 className="mt-4 font-semibold">1.3 Booking &amp; payment data</h3>
        <ul className="list-disc pl-6">
          <li>
            <strong>Bookings you make or accept</strong>, including service,
            price, timing, and status history.
          </li>
          <li>
            <strong>Payment information</strong> — payment amounts and method
            (UPI, card, cash). We do <em>not</em> store card numbers, CVVs, or
            UPI PINs. Payment processing is handled by our licensed payment
            aggregator (Razorpay), which is regulated by the Reserve Bank of India.
          </li>
          <li>
            <strong>Reviews and ratings</strong> you submit or receive.
          </li>
        </ul>

        <h3 className="mt-4 font-semibold">1.4 Device &amp; usage data</h3>
        <ul className="list-disc pl-6">
          <li>
            <strong>Approximate location</strong> (foreground only, when you
            grant permission) — used to show you nearby providers and to share
            with your partner while a job is in progress. We do not track your
            location in the background.
          </li>
          <li>
            <strong>Push notification token</strong> (FCM) — so we can send you
            booking updates. You can revoke this any time in your device settings.
          </li>
          <li>
            <strong>App diagnostics</strong> — crash logs, error traces,
            anonymised usage patterns. Used to improve the app; contains no
            direct identifiers.
          </li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">2. Why we collect it (purposes)</h2>
        <ul className="list-disc pl-6">
          <li>To operate the Platform — matching customers to service partners, processing bookings, enabling payments.</li>
          <li>To verify partner identity under KYC obligations before allowing them to earn on the Platform.</li>
          <li>To send you booking-related communications (OTPs, status updates, receipts, refund notices).</li>
          <li>To resolve disputes, prevent fraud, and enforce our Terms of Service.</li>
          <li>To comply with legal obligations, respond to lawful requests from Indian authorities, and meet tax and audit requirements.</li>
          <li>To improve the Platform based on aggregated, anonymised usage data.</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">3. How we share it</h2>

        <p>We share personal data only with:</p>
        <ul className="list-disc pl-6">
          <li>
            <strong>Your assigned service partner (or, for partners, the customer)</strong> — name,
            phone, and address of the specific booking. Nothing beyond what's needed to
            complete the booking.
          </li>
          <li>
            <strong>Payment processors</strong> — Razorpay and RazorpayX, to process customer
            payments and partner payouts. Both are RBI-regulated.
          </li>
          <li>
            <strong>Infrastructure providers</strong> — Amazon Web Services (data hosting,
            Mumbai region), Google Firebase (push notifications), Google Maps (address
            lookup). None of these providers use your data for their own purposes; each is
            bound by their own privacy commitments.
          </li>
          <li>
            <strong>SMS provider</strong> — MSG91 (or equivalent) to deliver OTPs.
          </li>
          <li>
            <strong>Government or law enforcement</strong> — only in response to a lawful order
            (subpoena, court order, statutory request), or where we're required to disclose
            under Indian law.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> sell your personal data. We do not share your data with
          advertisers. We do not use your data to train third-party AI systems.
        </p>

        <h2 className="mt-8 text-xl font-semibold">4. Where we store it</h2>
        <p>
          Personal data is stored on Amazon Web Services servers in the Mumbai region
          (<em>ap-south-1</em>), inside India. KYC documents live in an encrypted,
          non-public S3 bucket with access logs. Sensitive fields (Aadhaar,
          bank details, UPI ID) are encrypted at rest using AES-256.
        </p>

        <h2 className="mt-8 text-xl font-semibold">5. How long we keep it</h2>
        <ul className="list-disc pl-6">
          <li><strong>Account data</strong> — for as long as your account is active.</li>
          <li><strong>Booking + payment records</strong> — 7 years, to meet Indian tax audit requirements.</li>
          <li><strong>KYC documents</strong> — 7 years after the partner's last booking, per RBI KYC record-keeping norms.</li>
          <li><strong>App diagnostics + logs</strong> — 30 days rolling.</li>
        </ul>
        <p>
          If you request deletion (see below), we honour it for data we're not
          legally required to retain. Data under statutory retention (payments,
          KYC) is deleted at the end of its retention window.
        </p>

        <h2 className="mt-8 text-xl font-semibold">6. Your rights under the DPDP Act</h2>
        <p>You have the right to:</p>
        <ul className="list-disc pl-6">
          <li><strong>Access</strong> — request a copy of the personal data we hold about you.</li>
          <li><strong>Correction</strong> — ask us to update inaccurate or incomplete data.</li>
          <li><strong>Erasure</strong> — request deletion (subject to legal retention obligations).</li>
          <li><strong>Withdraw consent</strong> — for processing that's based on your consent (e.g. push notifications, location). Withdrawal doesn't affect processing already carried out.</li>
          <li><strong>Grievance redressal</strong> — reach our Grievance Officer (below) with any complaint.</li>
          <li><strong>Nominate</strong> — nominate another individual to exercise your rights on your behalf in the event of death or incapacity.</li>
        </ul>
        <p>
          To exercise any of these rights, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          We respond within 30 days.
        </p>

        <h2 className="mt-8 text-xl font-semibold">7. Children</h2>
        <p>
          The Platform is not intended for anyone under 18. We do not knowingly
          collect data from children. If you believe a child has provided us
          data, please contact us and we'll delete it.
        </p>

        <h2 className="mt-8 text-xl font-semibold">8. Security</h2>
        <p>
          We use industry-standard measures: TLS for data in transit, AES-256
          encryption at rest for sensitive fields, IP-restricted admin access,
          quarterly access reviews, and role-based access control. No system is
          perfectly secure — if we detect a data breach affecting your rights,
          we will notify you and the Data Protection Board within the timeframe
          required by law.
        </p>

        <h2 className="mt-8 text-xl font-semibold">9. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. Material changes will be
          communicated via in-app notice, email, and a version bump on this
          page. Continuing to use the Platform after a change constitutes
          acceptance of the updated policy.
        </p>

        <h2 className="mt-8 text-xl font-semibold">10. Contact</h2>
        <dl className="mt-2 space-y-1 text-sm">
          <dt className="font-semibold">Data protection queries</dt>
          <dd><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></dd>
          <dt className="mt-3 font-semibold">Grievance Officer (per DPDP Act)</dt>
          <dd><a href={`mailto:${GRIEVANCE_OFFICER_EMAIL}`}>{GRIEVANCE_OFFICER_EMAIL}</a></dd>
          <dt className="mt-3 font-semibold">Registered address</dt>
          <dd>{REGISTERED_ADDRESS}</dd>
        </dl>

        <hr className="my-8 border-border" />
        <p className="text-xs text-muted-foreground">
          See also our{" "}
          <Link to="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </article>
    </div>
  );
}
