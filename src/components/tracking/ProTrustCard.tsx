/**
 * The Pro trust card on tracking (SVC-386).
 *
 * The customer sees who's coming to their door as a person, not an "Assigned
 * Partner" string. Photo + name + business + rating pill + verified badge +
 * optional experience chips, plus a direct-dial call button.
 *
 * ## What's optional, and why
 *
 * Backend may or may not yet expose `yearsOfExperience` and `areaBookingsCount`
 * on the booking response (SVC-386 marks both "if we track"). When they're
 * missing we drop the chip rather than render a zero — a chip reading
 * "0 yrs experience" is worse than no chip.
 *
 * `ratingCount === 0` renders a "New pro" badge instead of a rating pill.
 * The ticket is explicit: never show "0.0 ⭐".
 *
 * `isBackgroundVerified` must be `true` for the Verified chip to render.
 * This is the trust claim the ticket pins hardest — don't bluff. SVC-307
 * (Aadhaar KYC) is the real backing; v1 may stub `true` from the backend.
 *
 * `bookingsCompletedCount > 99` displays as "99+" to keep the card tight.
 *
 * `photoUrl` missing or 403 falls through to initials via Radix Avatar's
 * native image-error fallback. Never a broken-image icon — SVC-367 account
 * deletion scrubs photos so this path is a real one.
 */
import { BriefcaseBusiness, MapPin, Phone, ShieldCheck, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { initialsFrom } from "@/lib/initials";
import { cn } from "@/lib/utils";

export interface ProTrustCardProps {
  proName: string;
  /** Blank or null when the Pro is their own business (solo SP). */
  businessName?: string | null;
  phoneNumber?: string | null;
  photoUrl?: string | null;
  ratingAverage: number;
  ratingCount: number;
  bookingsCompletedCount: number;
  isBackgroundVerified: boolean;
  yearsOfExperience?: number;
  areaBookingsCount?: number;
  /** "warm" draws a subtle brand-primary gradient; "minimal" is flat on card. */
  variant?: "minimal" | "warm";
}

function bookingsLabel(count: number): string {
  return count > 99 ? "99+" : count.toString();
}

export function ProTrustCard({
  proName,
  businessName,
  phoneNumber,
  photoUrl,
  ratingAverage,
  ratingCount,
  bookingsCompletedCount,
  isBackgroundVerified,
  yearsOfExperience,
  areaBookingsCount,
  variant = "warm",
}: ProTrustCardProps) {
  const hasRating = ratingCount > 0;
  const initials = initialsFrom(proName);

  return (
    <article
      className={cn(
        "w-full overflow-hidden rounded-2xl border text-foreground shadow-sm",
        variant === "warm"
          ? "border-primary/15 bg-linear-to-br from-primary/[0.07] via-card to-card"
          : "border-border bg-card",
      )}
    >
      <div className="flex min-h-37 items-start gap-3 p-4">
        <Avatar className="size-18 shrink-0">
          {photoUrl && <AvatarImage src={photoUrl} alt="" />}
          <AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground">
            {initials ?? "?"}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[16px] font-bold leading-6">{proName}</h2>
              {businessName && (
                <p className="truncate text-[13px] leading-5 text-muted-foreground">
                  Professional at {businessName}
                </p>
              )}
            </div>
            {phoneNumber && (
              <a
                href={`tel:${phoneNumber}`}
                aria-label={`Call ${proName}`}
                className="-mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Phone aria-hidden="true" className="size-4.5" />
              </a>
            )}
          </div>

          {hasRating ? (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              <Star aria-hidden="true" className="size-3.5 fill-current" />
              <span>{ratingAverage.toFixed(1)}</span>
              <span aria-hidden="true">·</span>
              <span>{`${bookingsLabel(bookingsCompletedCount)} bookings`}</span>
            </div>
          ) : (
            <Badge
              variant="secondary"
              className="mt-2 rounded-full px-2.5 py-1 text-xs font-semibold"
            >
              New pro
            </Badge>
          )}

          <div className="mt-2 flex flex-wrap gap-1.5">
            {isBackgroundVerified && (
              <Badge
                variant="outline"
                className="gap-1 rounded-full border-primary/20 bg-background/70 px-2 py-1 text-[11px] font-medium text-muted-foreground"
              >
                <ShieldCheck aria-hidden="true" className="size-3.5 text-primary" />
                Background verified
              </Badge>
            )}
            {yearsOfExperience !== undefined && (
              <Badge
                variant="outline"
                className="gap-1 rounded-full border-border/70 bg-background/70 px-2 py-1 text-[11px] font-medium text-muted-foreground"
              >
                <BriefcaseBusiness aria-hidden="true" className="size-3.5" />
                {yearsOfExperience} yrs experience
              </Badge>
            )}
            {areaBookingsCount !== undefined && (
              <Badge
                variant="outline"
                className="gap-1 rounded-full border-border/70 bg-background/70 px-2 py-1 text-[11px] font-medium text-muted-foreground"
              >
                <MapPin aria-hidden="true" className="size-3.5" />
                Serviced your area {areaBookingsCount} times
              </Badge>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
