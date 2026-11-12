/**
 * A booking's support notes (SVC-433): add one, read them all, newest first.
 * Append-only by design, so there is no edit or delete. A "contacted" mark is
 * listed here too, flagged, because it's the same record with a different kind.
 * Bodies and names come from outside: all rendered as text.
 */
import { useRef, useState } from "react";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Pill } from "@/components/teams/TeamBadges";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { formatIst } from "@/lib/bookings";
import {
  NOTE_MAX,
  adminRoleLabel,
  checkNote,
  noteAuthorLabel,
  noteErrorText,
  notesPath,
  type SupportNote,
} from "@/lib/support";
import type { ApiGetState } from "@/lib/use-api-get";

const WRAP = "[overflow-wrap:anywhere]";

interface SupportNotesProps {
  bookingId: string;
  notes: ApiGetState<SupportNote[]> & { retry: () => void };
  onAdded: () => void;
}

export function SupportNotes({ bookingId, notes, onAdded }: SupportNotesProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // State updates a render late, and a double click is quicker than that.
  const inFlight = useRef(false);

  async function addNote(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const check = checkNote(draft);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await apiFetch<SupportNote>(notesPath(bookingId), {
        method: "POST",
        body: JSON.stringify({ body: check.body }),
      });
      setDraft("");
      onAdded();
    } catch (caught) {
      setError(noteErrorText(caught, "note"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const over = draft.length > NOTE_MAX;

  return (
    <section aria-label="Support notes" className="space-y-3 rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">Support notes</h3>
      <form onSubmit={addNote} className="space-y-2" noValidate>
        <Label htmlFor={`note-${bookingId}`}>Add a note</Label>
        <Textarea
          id={`note-${bookingId}`}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          rows={3}
          aria-invalid={error ? true : undefined}
          aria-describedby={`note-${bookingId}-count${error ? ` note-${bookingId}-error` : ""}`}
          placeholder="What happened, what you told them, what's next."
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p
            id={`note-${bookingId}-count`}
            className={`text-xs tabular-nums ${over ? "text-destructive" : "text-muted-foreground"}`}
          >
            {draft.length} / {NOTE_MAX}
          </p>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Saving…" : "Add note"}
          </Button>
        </div>
        {error && (
          <p id={`note-${bookingId}-error`} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Notes can&apos;t be edited or deleted once added. Every admin role can read them.
        </p>
      </form>

      <div className="border-t pt-3">
        {notes.status === "loading" && <LoadingState rows={2} />}
        {notes.status === "error" && (
          <ErrorState message="Couldn't load the notes." onRetry={notes.retry} />
        )}
        {notes.status === "ready" && notes.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No notes on this booking yet.</p>
        )}
        {notes.status === "ready" && notes.data.length > 0 && (
          <ol aria-label="Notes" className="space-y-3">
            {notes.data.map((note) => {
              const role = adminRoleLabel(note.author.admin_role);
              return (
                <li key={note.id} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className={`font-medium text-foreground ${WRAP}`}>
                      {noteAuthorLabel(note.author)}
                    </span>
                    {role && <Pill tone="neutral">{role}</Pill>}
                    {note.kind === "contacted" && <Pill tone="good">Contacted customer</Pill>}
                    <span>{formatIst(note.created_at)} IST</span>
                  </div>
                  {note.body && (
                    <p className={`text-sm whitespace-pre-wrap ${WRAP}`}>{note.body}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
