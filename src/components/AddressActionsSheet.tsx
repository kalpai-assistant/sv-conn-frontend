/**
 * Edit / Delete for one saved address (SVC-287).
 *
 * ## Why the actions moved into a sheet
 *
 * They used to be two icon buttons sitting inside the address row on the
 * Profile screen. That worked, but it wedged the row shut: the row could never
 * itself become tappable, because a button inside a button is invalid markup
 * and — more practically — a thumb aiming at the row kept landing on Delete.
 *
 * Moving them behind a `⋮` frees the row and gives the destructive action its
 * own deliberate step, which is the pattern Zepto and Blinkit both use for an
 * address book.
 *
 * ## The address is named at the top
 *
 * Not decoration. Once the actions live in a sheet, the row that raised it is
 * behind a scrim, and "Delete" with no subject is how someone deletes the
 * wrong address. Restating which one this is costs two lines and removes that
 * whole class of mistake.
 */
import { motion } from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";

export interface AddressActionsTarget {
  id: string;
  /** Stored lowercase — `home` | `work` | `other`. Capitalised for display only. */
  label: string;
  full: string;
}

export function AddressActionsSheet({
  address,
  onEdit,
  onDelete,
  onClose,
}: {
  address: AddressActionsTarget;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  // Sheets mount only while open, so locking on mount is locking on open.
  useLockBodyScroll(true);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        role="dialog"
        aria-label={`Actions for ${address.label} address`}
        className="safe-bottom fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md p-3"
      >
        {/* Which address these actions belong to. See the module docs. */}
        <div className="rounded-2xl bg-card p-4">
          <p className="text-sm font-semibold capitalize text-foreground">{address.label}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{address.full}</p>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl bg-card">
          <button
            onClick={onEdit}
            className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary"
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Edit</span>
          </button>

          <div className="mx-4 border-t border-dashed border-border" />

          {/* Destructive styling, and it still only *opens* the confirmation —
              nothing is removed on this tap. */}
          <button
            onClick={onDelete}
            className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">Delete</span>
          </button>
        </div>
      </motion.div>
    </>
  );
}
