/**
 * Trust signals row.
 *
 * Reads as three quick promises the platform makes: the professional is
 * KYC-checked, service only starts after a doorstep OTP the customer
 * shares, and there's an SOS entry point in-app for the service window.
 * All three are claims the platform can actually stand behind — KYC via
 * the /admin/kyc pipeline (SVC-87 / SVC-90), doorstep OTP via the booking
 * state machine (`en_route → in_progress` requires it, see
 * backend/app/models/booking.py), and SOS as a support contact
 * (help/support screen, planned).
 *
 * Deliberately not including any numbers — no "4.7 rating" or "10k homes
 * served" claims until we have real, reportable figures. See the
 * social-proof rule in docs/WIREFRAMES.md and
 * MARKETING_LANDING_WIP.md §5.
 */
import { ShieldCheck, LockKeyhole, Siren } from "lucide-react";

const ITEMS = [
  { Icon: ShieldCheck, label: "KYC-verified professionals" },
  { Icon: LockKeyhole, label: "Doorstep OTP required" },
  { Icon: Siren, label: "In-app SOS during service" },
];

export function TrustBar() {
  return (
    <section className="mx-4 mt-4 mb-6 rounded-2xl border border-border bg-card p-4">
      <ul className="flex flex-col gap-3">
        {ITEMS.map(({ Icon, label }) => (
          <li key={label} className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm text-foreground">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
