import { Link } from "@tanstack/react-router";
import { shortId } from "@/lib/bookings";

/**
 * Where a PRO_HAS_ACTIVE_JOB refusal sends the admin: the blocking booking, or the
 * bookings screen when the backend named none.
 */
export function ActiveJobLink({ bookingId }: { bookingId: string | null }) {
  const className = "font-medium underline underline-offset-2";
  return bookingId ? (
    <Link to="/operator/bookings" search={{ booking: bookingId }} className={className}>
      Open booking {shortId(bookingId)}
    </Link>
  ) : (
    <Link to="/operator/bookings" className={className}>
      Open bookings
    </Link>
  );
}
