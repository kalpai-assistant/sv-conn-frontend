/**
 * One booking in the support console (SVC-433): the support actions, the same
 * detail pane the bookings screen uses (timeline, SP and Pro, money), and the
 * notes. Mounted per id (the page keys it), like the pane itself.
 */
import { useCallback, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { BookingDetailPane } from "@/components/bookings/BookingDetailPane";
import { SupportActions } from "@/components/support/SupportActions";
import { SupportNotes } from "@/components/support/SupportNotes";
import { Button } from "@/components/ui/button";
import type { AdminRole } from "@/lib/auth";
import { canForceCancel, type Booking } from "@/lib/bookings";
import { notesPath, type SupportNote } from "@/lib/support";
import { useApiGet } from "@/lib/use-api-get";

const NOTHING = () => {};

interface SupportBookingProps {
  bookingId: string;
  role: AdminRole;
  onClose: () => void;
  /** Set when the booking was opened from a customer: the way back to them. */
  onBackToCustomer?: () => void;
}

export function SupportBooking({
  bookingId,
  role,
  onClose,
  onBackToCustomer,
}: SupportBookingProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const notes = useApiGet<SupportNote[]>(notesPath(bookingId));
  const { refresh: refreshNotes } = notes;

  const onLoaded = useCallback((booking: Booking) => setStatus(booking.status), []);
  const bookingChanged = useCallback(() => setRefreshKey((n) => n + 1), []);

  return (
    <div className="space-y-4">
      {onBackToCustomer && (
        <Button variant="ghost" size="sm" onClick={onBackToCustomer} className="-ml-2">
          <ArrowLeft />
          Back to customer
        </Button>
      )}
      {/* The actions and notes go under the pane's header, so they read as this booking's. */}
      <BookingDetailPane
        bookingId={bookingId}
        canCancel={canForceCancel(role)}
        onClose={onClose}
        // The pane reloads itself after a cancel, and onLoaded passes the new status on.
        onChanged={NOTHING}
        refreshKey={refreshKey}
        onLoaded={onLoaded}
      >
        <SupportActions
          bookingId={bookingId}
          status={status}
          onBookingChanged={bookingChanged}
          onNotesChanged={refreshNotes}
        />
        <SupportNotes bookingId={bookingId} notes={notes} onAdded={refreshNotes} />
      </BookingDetailPane>
    </div>
  );
}
