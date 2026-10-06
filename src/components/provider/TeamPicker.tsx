/**
 * Pick-a-Pro (SVC-321): the second half of a team SP's accept.
 *
 * Rendered inside the Incoming Request Card, not as its own overlay, because
 * nothing is claimed yet when it opens. The 202 from accept writes nothing: the
 * booking is still REQUESTED, still offered to every other SP, and still dies
 * when the card's countdown does. Staying in the card keeps that countdown on
 * screen and leaves the host's dismiss flow untouched. Backing out is free —
 * there is nothing to undo.
 *
 * The claim is `POST /bookings/{id}/assign`. See `assignOutcomeForError` for
 * which failures keep the picker open.
 *
 * Availability comes from two places. `busy` is in the 202 itself. Online
 * state is not — `TeamPickPro` has no such field — so it is joined from
 * `GET /providers/me/team`. If that side fetch fails, rows show no state rather
 * than all reading offline: /assign's PRO_OFFLINE is the real gate, and a
 * failed extra request must never stop the SP picking.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Check } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { DismissReason } from "@/hooks/useBookingOffer";
import {
  assignOutcomeForError,
  teamErrorMessage,
  useAssignPro,
  useTeam,
  type TeamPickPro,
} from "@/hooks/useTeam";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Availability = "available" | "busy" | "offline" | "unknown";

const LABEL: Record<Exclude<Availability, "unknown">, string> = {
  available: "Available",
  busy: "On a job",
  offline: "Offline",
};

const DOT: Record<Exclude<Availability, "unknown">, string> = {
  available: "bg-emerald-500",
  busy: "bg-amber-500",
  offline: "bg-muted-foreground/40",
};

interface TeamPickerProps {
  bookingId: string;
  pros: TeamPickPro[];
  /** The offer ran out under the open picker. */
  expired: boolean;
  onBack: () => void;
  onDismiss: (reason: DismissReason) => void;
}

export function TeamPicker({
  bookingId,
  pros: initialPros,
  expired,
  onBack,
  onDismiss,
}: TeamPickerProps) {
  const navigate = useNavigate();
  const team = useTeam();
  const assign = useAssignPro();
  const [pros, setPros] = useState(initialPros);
  // Learned from a 409 since the list loaded. Overrides what the 202 and the
  // team fetch said, which are both snapshots.
  const [learned, setLearned] = useState<Record<string, "busy" | "offline">>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const availability = (pro: TeamPickPro): Availability => {
    if (learned[pro.id]) return learned[pro.id];
    if (pro.busy) return "busy";
    // The SP's own toggle covers the Pro-for-self, and they are online — they
    // were just offered this job.
    if (pro.is_self) return "available";
    const member = team.data?.find((m) => m.id === pro.id);
    if (!member) return "unknown";
    return member.is_online ? "available" : "offline";
  };

  const selected = pros.find((p) => p.id === selectedId) ?? null;
  const pickable = (pro: TeamPickPro) => {
    const state = availability(pro);
    return state === "available" || state === "unknown";
  };

  const handleAssign = () => {
    if (!selected) return;
    const pro = selected;
    assign.mutate(
      { bookingId, professionalId: pro.id },
      {
        onSuccess: () => {
          toast.success(pro.is_self ? "Job accepted" : `Job assigned to ${pro.display_name}`);
          onDismiss("accepted");
          navigate({ to: "/provider/bookings/$bookingId", params: { bookingId } });
        },
        onError: (error) => {
          const outcome = assignOutcomeForError(error);
          if (outcome === "taken" || outcome === "unavailable") {
            if (outcome === "taken") toast("This job is no longer available");
            onDismiss(outcome);
            return;
          }
          toast.error(teamErrorMessage(error));
          if (outcome !== "repick") return;
          setSelectedId(null);
          const code = error instanceof ApiError ? error.code : undefined;
          if (code === "PRO_BUSY") setLearned((l) => ({ ...l, [pro.id]: "busy" }));
          if (code === "PRO_OFFLINE") setLearned((l) => ({ ...l, [pro.id]: "offline" }));
          // Removed from the team while the picker was open.
          if (code === "PRO_NOT_FOUND") setPros((list) => list.filter((p) => p.id !== pro.id));
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 id="incoming-request-title" className="text-xl font-bold text-foreground">
          Who's doing this job?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The job isn't yours until you assign it.
        </p>
      </div>

      <ul className="max-h-[45vh] space-y-2 overflow-y-auto" aria-label="Your team">
        {pros.map((pro) => {
          const state = availability(pro);
          const enabled = pickable(pro);
          const isSelected = pro.id === selectedId;
          return (
            <li key={pro.id}>
              <button
                type="button"
                disabled={!enabled || assign.isPending || expired}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(pro.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  isSelected ? "border-primary bg-primary/5" : "border-border",
                  enabled ? "hover:bg-secondary/50" : "cursor-not-allowed opacity-50",
                )}
              >
                <Avatar className="h-10 w-10" aria-hidden>
                  {pro.profile_photo_url && <AvatarImage src={pro.profile_photo_url} alt="" />}
                  <AvatarFallback>{pro.display_name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {pro.display_name}
                    {pro.is_self && <span className="text-muted-foreground"> (You)</span>}
                  </p>
                  {state !== "unknown" && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={cn("h-2 w-2 rounded-full", DOT[state])} aria-hidden />
                      {LABEL[state]}
                    </p>
                  )}
                </div>
                {isSelected && <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>

      {expired && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          This request has expired.
        </p>
      )}

      {/* Stacked, like Accept/Ignore (SVC-295): the countdown is still running. */}
      <div className="flex flex-col gap-2 pt-1">
        <Button
          className="w-full"
          onClick={handleAssign}
          disabled={!selected || assign.isPending || expired}
        >
          {assign.isPending
            ? "Assigning…"
            : selected
              ? selected.is_self
                ? "Do it myself"
                : `Assign to ${selected.display_name}`
              : "Pick someone"}
        </Button>
        <Button variant="ghost" className="w-full" onClick={onBack} disabled={assign.isPending}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
    </div>
  );
}
