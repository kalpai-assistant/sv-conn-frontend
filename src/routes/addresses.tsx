/**
 * The address book (SVC-287).
 *
 * ## Why this is a screen rather than a section of Profile
 *
 * The list used to live inline on Profile, with Edit and Delete as icon
 * buttons inside each row. Two of Rohan's findings came out of that shape: the
 * label rendered raw (so `home` rather than `Home`), and there was no way to
 * tell — or change — which address was active.
 *
 * A screen of its own gives the list room for a row that is genuinely tappable
 * and an obvious "add" affordance, and it matches where users already expect
 * an address book to be. Profile keeps a single row pointing here.
 *
 * ## Manage, not pick
 *
 * Deliberately: this screen edits and deletes, it does not change which
 * address a booking uses. Choosing happens in `AddressPickerSheet`, opened
 * from the Home location bar and from the Cart, at the moment the choice
 * matters — and that sheet already marks the active one.
 *
 * Two screens that both appear to select would be worse than one that clearly
 * does: a user who "selected" here and then saw a different address at
 * checkout would trust neither. So the active address is *shown* here, and
 * changed there.
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Home, MapPin, MoreVertical, Plus } from "lucide-react";
import { toast } from "sonner";
import { AddAddressSheet, type EditingAddress } from "@/components/AddAddressSheet";
import { AddressActionsSheet, type AddressActionsTarget } from "@/components/AddressActionsSheet";
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

export const Route = createFileRoute("/addresses")({
  component: AddressesPage,
});

/** Exported for tests: rendering it through `Route` needs a live router. */
export function AddressesPage() {
  // `selected` comes from the same hook the picker writes to, so the badge
  // here can never disagree with what the Home bar shows.
  const { addresses, selected, isLoading } = useSelectedAddress();
  const deleteAddress = useDeleteAddress();

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<EditingAddress | null>(null);
  const [actionsFor, setActionsFor] = useState<AddressActionsTarget | null>(null);
  const [deleting, setDeleting] = useState<AddressActionsTarget | null>(null);

  const rows = addresses ?? [];

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="flex items-center gap-3 border-b border-border p-4">
        <Link to="/profile" aria-label="Back to profile" className="rounded-lg p-1">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </Link>
        <h1 className="text-lg font-semibold text-foreground">Addresses</h1>
      </header>

      <div className="p-4">
        {/* Top of the screen, not buried under the list: on an empty address
            book it is the only thing to do, and on a full one it is still the
            reason most people came. */}
        <button
          onClick={() => setShowAdd(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/50"
        >
          <Plus className="h-5 w-5 text-primary" />
          <span className="flex-1 text-left text-sm font-semibold text-primary">
            Add New Address
          </span>
        </button>

        <h2 className="mb-2 mt-6 text-sm font-semibold text-foreground">Saved Addresses</h2>

        {isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading addresses">
            {[0, 1].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-secondary" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm font-medium text-foreground">No saved addresses yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add one so we know where to send your provider.
            </p>
          </div>
        ) : (
          // One card, dashed dividers between rows — the rows are facets of
          // one list rather than separate cards to compare.
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {rows.map((addr, i) => {
              const isSelected = selected?.id === addr.id;
              return (
                <div key={addr.id}>
                  {i > 0 && <div className="mx-4 border-t border-dashed border-border" />}
                  <div className="flex items-start gap-3 p-4">
                    {addr.label === "home" ? (
                      <Home className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    ) : (
                      <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {/* `capitalize` is display-only. The stored value must
                            stay lowercase: the backend pins label to
                            ^(home|work|other)$, and sending "Home" is a 422
                            (found on device in SVC-281). */}
                        <p className="text-sm font-semibold capitalize text-foreground">
                          {addr.label}
                        </p>
                        {/* Shown, not set. Which address is in use is decided
                            in the picker; repeating it here means the two
                            screens cannot tell the user different things. */}
                        {isSelected && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-primary">
                            <Check className="h-3 w-3" />
                            In use
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {addr.full}
                      </p>
                    </div>

                    <button
                      onClick={() =>
                        setActionsFor({ id: addr.id, label: addr.label, full: addr.full })
                      }
                      aria-label={`Options for ${addr.label} address`}
                      className="-mr-1 shrink-0 rounded-lg p-1.5 transition-colors hover:bg-secondary"
                    >
                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {actionsFor && (
        <AddressActionsSheet
          address={actionsFor}
          onEdit={() => {
            // Carry the stored columns into the form so it prefills from them
            // rather than from the composed line (SVC-287). `rows` is the
            // fetched address, which has the fields; `actionsFor` is only what
            // the sheet needed to name itself.
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
            // Hand off to the confirmation rather than deleting here — the
            // sheet raises the question, the dialog takes the answer.
            setDeleting(actionsFor);
            setActionsFor(null);
          }}
          onClose={() => setActionsFor(null)}
        />
      )}

      {showAdd && <AddAddressSheet onClose={() => setShowAdd(false)} />}
      {editing && <AddAddressSheet editing={editing} onClose={() => setEditing(null)} />}

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
    </div>
  );
}
