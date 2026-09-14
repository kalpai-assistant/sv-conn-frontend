/**
 * The full address list, over the location gate (SVC-287).
 *
 * ## Why a sheet and not the Addresses route
 *
 * The gate exists to block the app until the user says where they are. Sending
 * them to `/addresses` from it would mean navigating away from the thing doing
 * the blocking — and then either the gate re-asserts on return, which feels
 * like being thrown back, or it does not, which is a hole in the block.
 *
 * A sheet has neither problem. It layers on top and dismisses back to the gate,
 * which never stops being the screen underneath.
 *
 * ## What it is for
 *
 * The gate lists saved locations to *pick* from, and deliberately offers no way
 * to edit or delete them: a blocking screen is a poor place for a destructive
 * action, and a thumb aiming for "get me past this" should not be able to land
 * on Delete. But an address can be wrong at exactly the moment you are being
 * asked to choose it, and "fix it later" is a bad answer when later means after
 * the booking.
 *
 * So management lives here, one deliberate tap away, with the same `⋮` sheet
 * and the same confirmation the Addresses screen uses — the components, not
 * copies of them.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Home, MapPin, MoreVertical, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { InUseBadge } from "@/components/InUseBadge";
import { AddressActionsSheet, type AddressActionsTarget } from "@/components/AddressActionsSheet";
import { AddAddressSheet, type EditingAddress } from "@/components/AddAddressSheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteAddress } from "@/hooks/useApi";
import { useSelectedAddress } from "@/hooks/useSelectedAddress";

export function SavedAddressesSheet({
  onClose,
  onPick,
}: {
  onClose: () => void;
  /** Chose an address. The gate treats this as its answer and closes. */
  onPick: (id: string) => void;
}) {
  useLockBodyScroll(true);

  const { addresses, selected } = useSelectedAddress();
  const deleteAddress = useDeleteAddress();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<EditingAddress | null>(null);
  const [actionsFor, setActionsFor] = useState<AddressActionsTarget | null>(null);
  const [deleting, setDeleting] = useState<AddressActionsTarget | null>(null);

  const rows = addresses ?? [];

  // The add/edit form replaces this sheet rather than stacking on it. Three
  // layers over a blocking gate is a place to get lost, and the form already
  // has its own way out.
  if (adding || editing) {
    return (
      <AddAddressSheet
        editing={editing ?? undefined}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    );
  }

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
        transition={{ type: "spring", damping: 26, stiffness: 240 }}
        role="dialog"
        aria-label="Saved addresses"
        className="safe-bottom fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-h-[80vh] max-w-md flex-col rounded-t-3xl border-t border-border bg-card shadow-2xl"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 className="text-base font-semibold text-foreground">Saved addresses</h2>
          <button onClick={onClose} aria-label="Close saved addresses" className="rounded-full p-2">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <button
            onClick={() => setAdding(true)}
            className="mb-4 flex w-full items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-secondary/50"
          >
            <Plus className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-primary">Add new address</span>
          </button>

          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No saved addresses yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              {rows.map((addr, i) => (
                <div key={addr.id}>
                  {i > 0 && <div className="mx-4 border-t border-dashed border-border" />}
                  <div className="flex items-start gap-3 p-3">
                    {/* Tapping the row picks it — the same thing the gate's own
                        list does, so arriving here does not change what a tap
                        means. */}
                    <button
                      onClick={() => onPick(addr.id)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      {addr.label === "home" ? (
                        <Home className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold capitalize text-foreground">
                            {addr.label}
                          </p>
                          {selected?.id === addr.id && <InUseBadge />}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {addr.full}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() =>
                        setActionsFor({ id: addr.id, label: addr.label, full: addr.full })
                      }
                      aria-label={`Options for ${addr.label} address`}
                      className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-secondary"
                    >
                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {actionsFor && (
        <AddressActionsSheet
          address={actionsFor}
          onEdit={() => {
            const source = rows.find((r) => r.id === actionsFor.id);
            setEditing({
              id: actionsFor.id,
              label: actionsFor.label,
              full: actionsFor.full,
              house_floor: source?.house_floor,
              building: source?.building,
              landmark_area: source?.landmark_area,
              pincode: source?.pincode,
              contact_name: source?.contact_name,
              contact_phone: source?.contact_phone,
            });
            setActionsFor(null);
          }}
          onDelete={() => {
            setDeleting(actionsFor);
            setActionsFor(null);
          }}
          onClose={() => setActionsFor(null)}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this address?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.full} will be removed from your saved addresses. Bookings that already used
              it are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = deleting;
                setDeleting(null);
                if (!target) return;
                deleteAddress.mutate(target.id, {
                  onError: (err) =>
                    toast.error(
                      err instanceof Error ? err.message : "Couldn't delete that address.",
                    ),
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
