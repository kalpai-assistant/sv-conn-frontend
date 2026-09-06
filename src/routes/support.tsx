/**
 * Help & Support (SVC-277 bug 4).
 *
 * The Profile row for this rendered a chevron and did nothing — one of five
 * controls on that screen wired to no handler at all. A row that looks
 * tappable and isn't is worse than no row: someone with a problem taps it,
 * gets nothing, and concludes there is no way to reach us.
 *
 * Deliberately just the two contact routes we can actually answer. A form or a
 * chat widget would promise a response channel nobody is staffing yet.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from "@/lib/contact";

export const Route = createFileRoute("/support")({
  component: SupportPage,
});

function SupportPage() {
  return (
    <div className="min-h-screen p-6">
      <Link
        to="/profile"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Profile
      </Link>

      <h1 className="mt-4 text-lg font-semibold text-foreground">Help &amp; Support</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Something wrong with a booking, a payment or your account? Get in touch and we&apos;ll sort
        it out.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {/* Real links rather than copyable text: on a phone these hand off to
            the dialler and the mail app, which is the whole point of being
            reachable from inside the app. */}
        <a
          href={`tel:${SUPPORT_PHONE}`}
          className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-secondary/50"
        >
          <Phone className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Call us</p>
            <p className="text-sm text-muted-foreground">{SUPPORT_PHONE_DISPLAY}</p>
          </div>
        </a>

        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-secondary/50"
        >
          <Mail className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Email us</p>
            <p className="truncate text-sm text-muted-foreground">{SUPPORT_EMAIL}</p>
          </div>
        </a>
      </div>

      {/* Booking id is the first thing support asks for, so say it here rather
          than in a reply two hours later. */}
      <p className="mt-6 text-xs text-muted-foreground">
        If it&apos;s about a specific booking, please include the booking ID — you&apos;ll find it
        on the booking&apos;s tracking screen.
      </p>
    </div>
  );
}
