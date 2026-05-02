import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import type { BookingStatus, Booking } from "@/lib/mock-data";
import { useBookings } from "@/hooks/useApi";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/bookings")({
  head: () => ({
    meta: [
      { title: "My Bookings — ServiceConnect" },
      { name: "description", content: "View your active and past service bookings." },
    ],
  }),
  component: BookingsPage,
});

const activeStatuses: BookingStatus[] = ["REQUESTED", "ACCEPTED", "EN_ROUTE", "IN_PROGRESS"];

function statusColor(status: string) {
  switch (status) {
    case "REQUESTED": return "bg-yellow-100 text-yellow-700";
    case "ACCEPTED": return "bg-blue-100 text-blue-700";
    case "EN_ROUTE": return "bg-purple-100 text-purple-700";
    case "IN_PROGRESS": return "bg-orange-100 text-orange-700";
    case "COMPLETED": return "bg-green-100 text-green-700";
    case "CANCELLED": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

function BookingsPage() {
  const [tab, setTab] = useState<"active" | "past">("active");
  const { data: allBookings, isLoading } = useBookings();
  
  const bookings: Booking[] = allBookings || [];
  const active = bookings.filter((b) => activeStatuses.includes(b.status as BookingStatus));
  const past = bookings.filter((b) => !activeStatuses.includes(b.status as BookingStatus));
  const list = tab === "active" ? active : past;

  return (
    <div className="min-h-screen pb-20">
      <div className="sticky top-0 z-30 border-b border-border bg-card px-4 pt-4">
        <h1 className="text-lg font-semibold text-foreground mb-3">My Bookings</h1>
        <div className="flex gap-1 bg-secondary rounded-lg p-1">
          {(["active", "past"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t === "active" ? "Active" : "Past"}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-3">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No {tab} bookings</p>
        ) : (
          list.map((b) => (
          <Link
            key={b.id}
            to="/tracking/$bookingId"
            params={{ bookingId: b.id }}
            className="rounded-xl border border-border bg-card p-4 block"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">{b.service.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {b.service.provider?.name || "Finding nearby partner..."}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(b.status)}`}>
                {b.status.replace("_", " ")}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{new Date(b.scheduledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
              <span className="font-semibold text-foreground">₹{b.totalAmount}</span>
            </div>
          </Link>
          ))
        )}
      </div>
    </div>
  );
}
