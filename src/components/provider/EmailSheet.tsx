import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { errorText } from "@/i18n/errors";
import { useT } from "@/i18n/LanguageProvider";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { pushBackInterceptor } from "@/lib/back-interceptor";
import type { components } from "@/types/api";

type UserResponse = components["schemas"]["UserResponse"];

/**
 * The SP's email, added or changed (SVC-486): one field and Save. Opened from
 * the home nudge and from the Email row on the Provider Profile.
 *
 * PATCH /users/me {email}. The backend trims and lower-cases it, and "" clears
 * it (the consumer profile sends null for empty, which leaves it as is: that
 * screen is untouched). A bad shape is a 422 from FastAPI's validation, whose
 * body has no message apiFetch can read, so the copy is ours, keyed on the
 * status alone.
 */
export function EmailSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, updateUser } = useAuth();
  const { t, lang } = useT("provider");
  const saved = user?.email ?? "";
  const [email, setEmail] = useState(saved);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Each opening starts from what is saved.
  useEffect(() => {
    if (!open) return;
    setEmail(saved);
    setInvalid(false);
    setError(null);
  }, [open, saved]);

  // Hardware back closes the sheet before the page underneath, as BusinessSection's does.
  useEffect(() => {
    if (!open) return;
    return pushBackInterceptor(() => {
      if (!saving) onOpenChange(false);
      return true;
    });
  }, [open, saving, onOpenChange]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const value = email.trim();
    if (value === saved) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    setError(null);
    setInvalid(false);
    try {
      const response = await apiFetch<UserResponse>("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ email: value }),
      });
      updateUser(response);
      toast.success(value ? t("emailForm.saved") : t("emailForm.removed"));
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setInvalid(true);
        setError(t("emailForm.invalid"));
      } else {
        setError(errorText(err, t("emailForm.failed"), lang));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{t("emailForm.title")}</SheetTitle>
          <SheetDescription>{t("emailForm.description")}</SheetDescription>
        </SheetHeader>
        <form onSubmit={save} noValidate className="mt-4 flex flex-col gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="provider-email">{t("emailForm.label")}</Label>
            <Input
              id="provider-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              placeholder={t("emailForm.placeholder")}
              aria-invalid={invalid}
              aria-describedby={error ? "provider-email-error" : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                setInvalid(false);
                setError(null);
              }}
            />
            {saved && <p className="text-xs text-muted-foreground">{t("emailForm.clearHint")}</p>}
            {error && (
              <p id="provider-email-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" className="h-10" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : t("emailForm.save")}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
