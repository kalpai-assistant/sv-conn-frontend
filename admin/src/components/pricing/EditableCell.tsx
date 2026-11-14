/**
 * One inline-editable number cell (SVC-428). Click (or Enter / Space on the
 * button) opens an input; Enter or leaving the input saves, Escape cancels. A
 * value that doesn't change isn't saved. The client check runs first; a
 * refusal from the backend shows under the cell after the rollback.
 *
 * `pairing` is the bounds half of turning Sensitive on: the input opens at once,
 * and an empty value or Escape cancels the toggle instead of saving.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { FIELD_LABELS, formatCell, inputText, parseCell, type NumericField } from "@/lib/pricing";

interface EditableCellProps {
  rowName: string;
  field: NumericField;
  value: number | null;
  canEdit: boolean;
  /** The backend's refusal of the last save, if it refused. */
  error?: string;
  onSave: (value: number | null) => void;
  pairing?: { onCancel: () => void };
}

export function EditableCell({
  rowName,
  field,
  value,
  canEdit,
  error,
  onSave,
  pairing,
}: EditableCellProps) {
  const label = `${FIELD_LABELS[field]} for ${rowName}`;
  const shown = formatCell(field, value);
  const [editing, setEditing] = useState(Boolean(pairing));
  const [draft, setDraft] = useState(() => inputText(value));
  const [invalid, setInvalid] = useState<string | null>(null);
  // Enter or Escape already settled this edit, so the blur that follows is ignored.
  const settled = useRef(false);
  const refocus = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const invalidId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  function start() {
    setDraft(inputText(value));
    setInvalid(null);
    settled.current = false;
    setEditing(true);
  }

  function close(returnFocus: boolean) {
    settled.current = true;
    refocus.current = returnFocus;
    setInvalid(null);
    setEditing(false);
  }

  function cancel(returnFocus: boolean) {
    close(returnFocus);
    pairing?.onCancel();
  }

  function commit(returnFocus: boolean) {
    if (pairing && draft.trim() === "") {
      cancel(returnFocus);
      return;
    }
    const parsed = parseCell(field, draft);
    if (!parsed.ok) {
      setInvalid(parsed.error);
      return;
    }
    close(returnFocus);
    if (pairing || parsed.value !== value) {
      onSave(parsed.value);
    }
  }

  if (editing) {
    const describedBy = [pairing ? hintId : null, invalid ? invalidId : null]
      .filter(Boolean)
      .join(" ");
    return (
      <div className="space-y-1">
        <Input
          autoFocus
          value={draft}
          aria-label={label}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy || undefined}
          inputMode="decimal"
          autoComplete="off"
          className="h-8 w-28 tabular-nums"
          onChange={(event) => {
            setDraft(event.target.value);
            setInvalid(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(true);
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancel(true);
            }
          }}
          onBlur={() => {
            if (!settled.current) commit(false);
          }}
        />
        {pairing && (
          <p id={hintId} className="max-w-40 text-xs text-muted-foreground">
            A sensitive category needs bounds. Empty or Esc undoes the tick.
          </p>
        )}
        {invalid && (
          <p id={invalidId} role="alert" className="max-w-40 text-xs text-destructive">
            {invalid}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {canEdit ? (
        <button
          ref={buttonRef}
          type="button"
          onClick={start}
          aria-label={`Edit ${label}, ${shown === "—" ? "not set" : shown}`}
          aria-describedby={error ? errorId : undefined}
          className="-mx-1.5 rounded px-1.5 py-0.5 text-left tabular-nums underline decoration-muted-foreground/50 decoration-dotted underline-offset-4 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {shown}
        </button>
      ) : (
        <span className="tabular-nums">{shown}</span>
      )}
      {error && (
        <p id={errorId} role="alert" className="max-w-40 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
