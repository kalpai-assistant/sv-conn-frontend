/**
 * The category rows with optimistic saves (SVC-428). A save shows at once and
 * rolls back if the backend refuses it.
 *
 * Saves on one row can overlap, and their answers can arrive out of order. The
 * backend locks the row, so it applies saves in the order they were sent, and
 * a later save's value is the one the DB keeps. So, per field:
 * - each field remembers which unanswered save last wrote it (its owner), and
 *   which save's answer last confirmed it;
 * - an answer only ever touches the fields its own PATCH changed, never the
 *   rest of the row: its row is a snapshot that may be older than another
 *   answer already shown;
 * - a success confirms a field only if no later save has confirmed it, and
 *   shows it only if no later save is still in flight on it;
 * - a failure rolls back only fields it still owns, to the confirmed value, so
 *   a slow refusal can't undo a later edit.
 */
import { useCallback, useRef, useState } from "react";
import {
  affectedFields,
  applyPatch,
  changesRow,
  errorField,
  patchCategory,
  pricingErrorMessage,
  withFields,
  type CategoryField,
  type CategoryPatch,
  type CategoryPricingRow,
} from "@/lib/pricing";

export type CellErrors = Record<string, string>;

export function cellKey(rowId: string, field: CategoryField): string {
  return `${rowId}:${field}`;
}

export function useCategoryRows(initial: CategoryPricingRow[]) {
  const [rows, setRows] = useState(initial);
  const [errors, setErrors] = useState<CellErrors>({});
  // The latest rows, for building a save's snapshot outside a state updater.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  // cellKey → the id of the save that last wrote that field and hasn't answered.
  const owners = useRef(new Map<string, number>());
  // Each row as the backend last confirmed it. A rollback goes back to this, not
  // to the screen before the save: that may hold another save's unconfirmed value.
  const confirmed = useRef(new Map(initial.map((row) => [row.id, row])));
  // cellKey → the id of the save whose answer last confirmed that field.
  const confirmedBy = useRef(new Map<string, number>());
  const nextSave = useRef(0);

  const replaceRow = useCallback(
    (id: string, update: (row: CategoryPricingRow) => CategoryPricingRow) => {
      setRows((current) => {
        const next = current.map((row) => (row.id === id ? update(row) : row));
        rowsRef.current = next;
        return next;
      });
    },
    [],
  );

  const clearError = useCallback((id: string, field: CategoryField) => {
    setErrors((current) => {
      const key = cellKey(id, field);
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  /**
   * Saves one cell (or the sensitive + bounds pair). `origin` is the cell the
   * operator edited: an error shows there unless the 422 names another column
   * of the same save.
   */
  const save = useCallback(
    (id: string, patch: CategoryPatch, origin: CategoryField) => {
      const before = rowsRef.current.find((row) => row.id === id);
      if (!before) return;
      const fields = affectedFields(patch);
      for (const field of fields) clearError(id, field);
      if (!changesRow(before, patch)) return;

      const saveId = ++nextSave.current;
      for (const field of fields) owners.current.set(cellKey(id, field), saveId);
      replaceRow(id, (row) => applyPatch(row, patch));

      const ownedFields = () =>
        fields.filter((field) => owners.current.get(cellKey(id, field)) === saveId);
      const release = (owned: CategoryField[]) => {
        for (const field of owned) owners.current.delete(cellKey(id, field));
      };
      // Fields no save is waiting on: they show the confirmed value.
      const settledFields = () => fields.filter((field) => !owners.current.has(cellKey(id, field)));

      patchCategory(id, patch).then(
        (saved) => {
          release(ownedFields());
          const newer = fields.filter(
            (field) => (confirmedBy.current.get(cellKey(id, field)) ?? 0) < saveId,
          );
          for (const field of newer) confirmedBy.current.set(cellKey(id, field), saveId);
          const restore = withFields(confirmed.current.get(id) ?? before, saved, newer);
          confirmed.current.set(id, restore);
          // A later save still in flight on a field keeps its newer local value.
          replaceRow(id, (row) => withFields(row, restore, settledFields()));
        },
        (err: unknown) => {
          release(ownedFields());
          const restore = confirmed.current.get(id) ?? before;
          replaceRow(id, (row) => withFields(row, restore, settledFields()));
          const named = errorField(err);
          const where = named && fields.includes(named) ? named : origin;
          setErrors((current) => ({ ...current, [cellKey(id, where)]: pricingErrorMessage(err) }));
        },
      );
    },
    [clearError, replaceRow],
  );

  return { rows, errors, save, clearError };
}
