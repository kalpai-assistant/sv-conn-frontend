/**
 * The categories tab's body (SVC-428): a table from @3xl up, one card per
 * category below it, as the other screens do. An L1 with children is a group
 * heading; every other category carries its six editable fields.
 *
 * Turning Sensitive on doesn't save by itself: it opens that row's bounds input,
 * and the bounds save sends both fields in one PATCH. Turning it off saves at
 * once, and the backend clears the bounds.
 */
import { useState, type ReactNode } from "react";
import { Pill } from "@/components/teams/TeamBadges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FIELD_LABELS,
  NUMERIC_FIELDS,
  cellPayload,
  groupCategories,
  sensitivePayload,
  type CategoryField,
  type CategoryPatch,
  type CategoryPricingRow,
} from "@/lib/pricing";
import { EditableCell } from "./EditableCell";
import { cellKey, type CellErrors } from "./use-category-rows";

type Save = (id: string, patch: CategoryPatch, origin: CategoryField) => void;

interface TableProps {
  rows: CategoryPricingRow[];
  canEdit: boolean;
  errors: CellErrors;
  onSave: Save;
}

const WRAP = "[overflow-wrap:anywhere]";

function InactivePill({ row }: { row: CategoryPricingRow }) {
  return row.is_active ? null : <Pill tone="quiet">Inactive</Pill>;
}

/** The six cells of one category, shared by its table row and its card. */
function useCategoryCells(
  row: CategoryPricingRow,
  canEdit: boolean,
  errors: CellErrors,
  onSave: Save,
): Record<CategoryField, ReactNode> {
  // Sensitive was ticked and the bounds input is open; nothing is saved yet.
  const [pairing, setPairing] = useState(false);
  const errorFor = (field: CategoryField) => errors[cellKey(row.id, field)];

  function toggle(on: boolean) {
    if (on) {
      if (!row.is_sensitive) setPairing(true);
      return;
    }
    setPairing(false);
    if (row.is_sensitive) onSave(row.id, sensitivePayload(false), "is_sensitive");
  }

  const sensitiveError = errorFor("is_sensitive");
  const cells = {
    is_sensitive: (
      <div className="space-y-1">
        <input
          type="checkbox"
          checked={row.is_sensitive || pairing}
          disabled={!canEdit}
          aria-label={`Sensitive: ${row.name}`}
          onChange={(event) => toggle(event.target.checked)}
          className="size-4 accent-primary disabled:cursor-not-allowed"
        />
        {sensitiveError && (
          <p role="alert" className="max-w-40 text-xs text-destructive">
            {sensitiveError}
          </p>
        )}
      </div>
    ),
  } as Record<CategoryField, ReactNode>;

  for (const field of NUMERIC_FIELDS) {
    cells[field] =
      field === "bounds_pct" && pairing ? (
        <EditableCell
          key="pairing"
          rowName={row.name}
          field={field}
          value={null}
          canEdit
          pairing={{ onCancel: () => setPairing(false) }}
          onSave={(value) => {
            setPairing(false);
            onSave(row.id, sensitivePayload(true, value as number), "bounds_pct");
          }}
        />
      ) : (
        <EditableCell
          key="cell"
          rowName={row.name}
          field={field}
          value={row[field]}
          // Bounds exist only on a sensitive category: tick Sensitive to set them.
          canEdit={canEdit && (field !== "bounds_pct" || row.is_sensitive)}
          error={errorFor(field)}
          onSave={(value) => onSave(row.id, cellPayload(field, value), field)}
        />
      );
  }
  return cells;
}

const COLUMNS: CategoryField[] = ["is_sensitive", ...NUMERIC_FIELDS];

function CategoryTableRow({
  row,
  nested,
  canEdit,
  errors,
  onSave,
}: { row: CategoryPricingRow; nested: boolean } & Omit<TableProps, "rows">) {
  const cells = useCategoryCells(row, canEdit, errors, onSave);
  return (
    <TableRow className={`align-top ${row.is_active ? "" : "opacity-60"}`}>
      <TableCell className={`whitespace-normal ${nested ? "pl-6" : ""}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`font-medium ${WRAP}`}>{row.name}</span>
          <InactivePill row={row} />
        </div>
      </TableCell>
      {COLUMNS.map((field) => (
        <TableCell key={field}>{cells[field]}</TableCell>
      ))}
    </TableRow>
  );
}

function CategoryCard({
  row,
  canEdit,
  errors,
  onSave,
}: { row: CategoryPricingRow } & Omit<TableProps, "rows">) {
  const cells = useCategoryCells(row, canEdit, errors, onSave);
  return (
    <article
      aria-label={row.name}
      className={`space-y-3 rounded-lg border bg-card p-3 text-sm ${row.is_active ? "" : "opacity-60"}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className={`font-medium ${WRAP}`}>{row.name}</h3>
        <InactivePill row={row} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {COLUMNS.map((field) => (
          <div key={field} className="min-w-0 space-y-1">
            <dt className="text-xs text-muted-foreground">{columnLabel(field)}</dt>
            <dd>{cells[field]}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function columnLabel(field: CategoryField): string {
  return field === "platform_commission_min" ? "Commission floor" : FIELD_LABELS[field];
}

function GroupHeading({ row }: { row: CategoryPricingRow }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${row.is_active ? "" : "opacity-60"}`}>
      <span className={`font-semibold ${WRAP}`}>{row.name}</span>
      <InactivePill row={row} />
    </div>
  );
}

export function CategoryPricingTable({ rows, canEdit, errors, onSave }: TableProps) {
  const items = groupCategories(rows);
  const shared = { canEdit, errors, onSave };
  return (
    <div className="@container">
      <ul aria-label="Categories" className="space-y-2 @3xl:hidden">
        {items.map((item) => (
          <li key={item.row.id} className={item.kind === "group" ? "pt-3 first:pt-0" : ""}>
            {item.kind === "group" ? (
              <h2 className="text-sm">
                <GroupHeading row={item.row} />
              </h2>
            ) : (
              <CategoryCard row={item.row} {...shared} />
            )}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-lg border @3xl:block">
        <Table aria-label="Categories">
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              {COLUMNS.map((field) => (
                <TableHead key={field}>{FIELD_LABELS[field]}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) =>
              item.kind === "group" ? (
                <TableRow key={item.row.id} className="bg-muted/50 hover:bg-muted/50">
                  <TableCell colSpan={COLUMNS.length + 1}>
                    <GroupHeading row={item.row} />
                  </TableCell>
                </TableRow>
              ) : (
                <CategoryTableRow
                  key={item.row.id}
                  row={item.row}
                  nested={item.nested}
                  {...shared}
                />
              ),
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
