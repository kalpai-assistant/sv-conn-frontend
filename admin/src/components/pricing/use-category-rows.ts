/**
 * The category rows with optimistic saves (SVC-428). A save shows at once and
 * rolls back if the backend refuses it.
 *
 * Saves on one row can overlap: an operator tabs from Commission to Floor before
 * the first PATCH answers. So each field remembers which save last touched it,
 * and an answer only writes the fields it still owns:
 * - on success, the server's row replaces ours, except fields a newer save is
 *   still waiting on: those keep the newer value;
 * - on failure, only fields still holding this save's value roll back, so a
 *   slow refusal can't undo a later edit. They roll back to what the backend
 *   last confirmed.
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

      patchCategory(id, patch).then(
        (saved) => {
          // Fields some other unanswered save owns keep their newer local value.
          const pending = (Object.keys(saved) as CategoryField[]).filter(
            (field) =>
              owners.current.has(cellKey(id, field)) &&
              owners.current.get(cellKey(id, field)) !== saveId,
          );
          release(ownedFields());
          confirmed.current.set(id, saved);
          replaceRow(id, (row) => withFields({ ...row, ...saved }, row, pending));
        },
        (err: unknown) => {
          const owned = ownedFields();
          release(owned);
          const restore = confirmed.current.get(id) ?? before;
          replaceRow(id, (row) => withFields(row, restore, owned));
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
