/**
 * When-should-we-come picker.
 *
 * Four-hour bands (Now / Morning / Afternoon / Evening), not per-hour
 * slots — see the wireframe rationale in ``docs/WIREFRAMES.md`` §3.3.
 * Simplest for the backend (no per-hour availability check), simplest
 * for the consumer (four choices, one tap), and honest about the
 * dispatch reality: the offer is posted for the whole window and
 * whichever provider accepts inside it determines the exact arrival.
 *
 * The picker emits a ``Date`` at the START of the chosen band on the
 * chosen day (or ``null`` for "Now (instant)"), matching what the API
 * expects on ``bookings.scheduled_at``.
 */
import { useMemo, useState } from "react";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { motion } from "framer-motion";
import { X, Sun, CloudSun, Sunset, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SlotPickerSheetProps {
  /** Emits null for "Now (instant)", or the start-of-band Date for a scheduled slot. */
  onSelect: (scheduledAt: Date | null, label: string) => void;
  onClose: () => void;
  /** Number of days to offer in the date row. Today + N-1. */
  daysAhead?: number;
  /** Today counts if the current time is before this hour (24h). Otherwise
   *  today is dropped from the picker and tomorrow leads — see docstring. */
  todayCutoffHour?: number;
}

interface Band {
  key: "now" | "morning" | "afternoon" | "evening";
  label: string;
  window: string;
  startHour: number;
  endHour: number; // exclusive
  Icon: LucideIcon;
}

const BANDS: Band[] = [
  { key: "now", label: "Now", window: "in ~30 min", startHour: 0, endHour: 0, Icon: Zap },
  {
    key: "morning",
    label: "Morning",
    window: "8 AM – 12 PM",
    startHour: 8,
    endHour: 12,
    Icon: Sun,
  },
  {
    key: "afternoon",
    label: "Afternoon",
    window: "12 PM – 4 PM",
    startHour: 12,
    endHour: 16,
    Icon: CloudSun,
  },
  {
    key: "evening",
    label: "Evening",
    window: "4 PM – 8 PM",
    startHour: 16,
    endHour: 20,
    Icon: Sunset,
  },
];

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatPill(d: Date, isToday: boolean): { top: string; bottom: string } {
  if (isToday)
    return {
      top: "TDY",
      bottom: d.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase(),
    };
  return {
    top: String(d.getDate()),
    bottom: d.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase(),
  };
}

export function SlotPickerSheet({
  onSelect,
  onClose,
  daysAhead = 7,
  todayCutoffHour = 19,
}: SlotPickerSheetProps) {
  // Sheets are mounted only while open, so locking on mount is the same as
  // locking on open. Without this the page scrolls behind the backdrop.
  useLockBodyScroll(true);
  // Pre-compute the calendar. Runs once on mount; deliberately not
  // recomputed on interval — a user open for hours crossing midnight is
  // an edge case that doesn't justify the timer.
  const { days, todayIncluded } = useMemo(() => {
    const now = new Date();
    const startToday = now.getHours() < todayCutoffHour;
    const first = startOfDay(now);
    const items: Date[] = [];
    for (let i = 0; i < daysAhead; i++) {
      const d = new Date(first);
      d.setDate(first.getDate() + i);
      // Skip today if past cutoff (bands would be over anyway).
      if (i === 0 && !startToday) continue;
      items.push(d);
    }
    return { days: items, todayIncluded: startToday };
  }, [daysAhead, todayCutoffHour]);

  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const selectedDate = days[selectedDayIdx];
  const isToday = todayIncluded && selectedDayIdx === 0;

  // A band is disabled on today if its window has already passed. The
  // "Now" pseudo-band is only available today.
  const now = new Date();

  const isBandAvailable = (b: Band): boolean => {
    if (b.key === "now") return isToday;
    if (!isToday) return true;
    return now.getHours() < b.endHour;
  };

  const commit = (b: Band) => {
    if (b.key === "now") {
      onSelect(null, "Now (~30 min)");
      return;
    }
    const dt = new Date(selectedDate);
    dt.setHours(b.startHour, 0, 0, 0);
    onSelect(dt, `${dayLabel(selectedDate, isToday)}, ${b.window}`);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-foreground/40"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-h-[85vh] max-w-md flex-col rounded-t-3xl bg-card shadow-2xl safe-bottom"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 className="text-base font-semibold text-foreground">When should we come?</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary"
            aria-label="Close slot picker"
          >
            <X className="h-4 w-4 text-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Day
          </p>
          <div className="mb-6 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {days.map((d, idx) => {
              const { top, bottom } = formatPill(d, todayIncluded && idx === 0);
              const active = selectedDayIdx === idx;
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setSelectedDayIdx(idx)}
                  className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border transition-colors ${
                    active
                      ? "border-primary bg-accent text-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <span className="text-sm font-bold leading-tight">{top}</span>
                  <span className="text-[10px] font-medium leading-tight">{bottom}</span>
                </button>
              );
            })}
          </div>

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Time of day
          </p>
          <div className="flex flex-col gap-2">
            {BANDS.map((b) => {
              const available = isBandAvailable(b);
              return (
                <button
                  key={b.key}
                  onClick={() => available && commit(b)}
                  disabled={!available}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                    available
                      ? "border-border hover:border-primary hover:bg-accent"
                      : "border-border/60 opacity-40"
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent">
                    <b.Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{b.label}</p>
                    <p className="text-xs text-muted-foreground">{b.window}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>
    </>
  );
}

function dayLabel(d: Date, isToday: boolean): string {
  if (isToday) return "Today";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (startOfDay(d).getTime() === startOfDay(tomorrow).getTime()) return "Tomorrow";
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
}
