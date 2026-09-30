import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BusinessLogo } from "@/components/provider/BusinessLogo";
import { BusinessNameField } from "@/components/provider/BusinessNameField";
import { LogoPicker } from "@/components/provider/LogoPicker";
import {
  useUpdateBusinessName,
  useUploadBusinessImage,
  type ProviderProfile,
} from "@/hooks/useApi";
import { pushBackInterceptor } from "@/lib/back-interceptor";

/**
 * "Your business" on the Provider Profile (SVC-337): the business name and logo,
 * and an Edit sheet to change them after onboarding.
 *
 * Edits are staged in the sheet and only sent on Save; Cancel discards them.
 * That is why a picked logo is held rather than uploaded on pick. There is no
 * way to remove a logo — the backend has no endpoint for it.
 */
export function BusinessSection({ profile }: { profile: ProviderProfile }) {
  const [open, setOpen] = useState(false);
  // Bumped on every Edit, so each opening starts a fresh form (see the key below).
  const [editSession, setEditSession] = useState(0);
  const name = profile.business_name ?? "";

  return (
    <>
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-border p-4">
        <BusinessLogo
          src={profile.business_image_url}
          alt={name ? `${name} logo` : "Default business logo"}
          className="h-12 w-12"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {name || "Add your business name"}
          </p>
          <p className="text-sm text-muted-foreground">Your business</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setEditSession((n) => n + 1);
            setOpen(true);
          }}
        >
          Edit
        </Button>
      </div>

      {/* Keyed per opening so every Edit starts from what is saved, never from
          a previous, cancelled edit. Keyed on the session rather than on `open`
          so closing does not remount it and cut its exit animation short. */}
      <EditBusinessSheet key={editSession} open={open} onOpenChange={setOpen} profile={profile} />
    </>
  );
}

function EditBusinessSheet({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ProviderProfile;
}) {
  const savedName = profile.business_name ?? "";
  const [businessName, setBusinessName] = useState(savedName);
  const [logo, setLogo] = useState<Blob | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateBusinessName = useUpdateBusinessName();
  const uploadBusinessImage = useUploadBusinessImage();
  const saving = updateBusinessName.isPending || uploadBusinessImage.isPending;

  // Hardware back closes the sheet (discarding the edit, like Cancel) before the
  // router pops the Profile page underneath — without this, back left the page
  // with the sheet still up. Mid-save it is swallowed rather than acted on, the
  // same as every other way of closing the sheet while saving.
  useEffect(() => {
    if (!open) return;
    return pushBackInterceptor(() => {
      if (!saving) onOpenChange(false);
      return true;
    });
  }, [open, saving, onOpenChange]);

  const save = async () => {
    setError(null);
    const trimmed = businessName.trim();
    if (!trimmed) {
      setInvalid(true);
      setError("Please enter your business name.");
      return;
    }
    const nameChanged = trimmed !== savedName;
    if (!nameChanged && !logo) {
      onOpenChange(false);
      return;
    }
    try {
      if (nameChanged) await updateBusinessName.mutateAsync(trimmed);
      if (logo) await uploadBusinessImage.mutateAsync(logo);
      toast.success("Business details updated");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save your changes. Try again.");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Edit business</SheetTitle>
          <SheetDescription>Changes are saved when you tap Save.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-5">
          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <BusinessNameField
            id="edit-business-name"
            value={businessName}
            onChange={(value) => {
              setBusinessName(value);
              if (invalid && value.trim()) setInvalid(false);
            }}
            invalid={invalid}
          />

          <div className="space-y-2">
            <Label>
              Business logo <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <LogoPicker currentUrl={profile.business_image_url} file={logo} onSelect={setLogo} />
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" className="h-10 flex-1" disabled={saving} onClick={save}>
              {saving ? <Loader2 className="animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
