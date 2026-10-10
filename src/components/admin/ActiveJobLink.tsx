import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** Where an admin resolves a PRO_HAS_ACTIVE_JOB refusal: the blocking
 *  booking's sheet when the backend named it, else the bookings list. */
export function ActiveJobLink({ bookingId }: { bookingId: string | null }) {
  return (
    <Button asChild variant="outline" size="sm">
      {bookingId ? (
        <Link to="/admin/bookings" search={{ booking: bookingId }}>
          Open the booking
        </Link>
      ) : (
        <Link to="/admin/bookings">Open Bookings</Link>
      )}
    </Button>
  );
}
