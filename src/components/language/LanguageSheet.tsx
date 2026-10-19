/**
 * The language picker (SVC-375): one bottom sheet, three tiles, Continue.
 *
 * Each tile names its language in its own script with the English name under
 * it, so a reader finds theirs without reading the others. The sheet's own
 * words follow the highlighted tile — tapping हिन्दी shows "आगे बढ़ें" — so the
 * Pro sees the choice before committing to it.
 *
 * Continue remembers the choice on the device first and then saves it to
 * `PATCH /users/me/language`. A failed save keeps the device's choice (the
 * screens switch anyway) and says so; the next sign-in that finds the backend
 * still empty asks again.
 *
 * Shown only while `i18n_enabled`; callers decide that.
 */
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import i18n from "@/i18n";
import { getStoredLanguage, setStoredLanguage } from "@/i18n/language";
import { LANGUAGES, LANGUAGE_NAMES, type AppLanguage } from "@/i18n/languages";
import { useLanguage } from "@/i18n/LanguageProvider";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { components } from "@/types/api";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/** One glyph per tile, drawn large and faint behind the names. */
const MARK: Record<AppLanguage, string> = { en: "A", hi: "अ", mr: "म" };

export function LanguageSheet({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const { updateUser, user } = useAuth();
  const screenLanguage = useLanguage();
  const initial = getStoredLanguage() ?? user?.preferred_language ?? screenLanguage;
  const [picked, setPicked] = useState<AppLanguage>(initial);
  const [saving, setSaving] = useState(false);
  const t = i18n.getFixedT(picked, "common");
  const others = LANGUAGES.filter((lang) => lang !== picked).map((lang) =>
    i18n.getFixedT(lang, "common")("language.title"),
  );

  const save = async () => {
    setSaving(true);
    setStoredLanguage(picked);
    try {
      const body: components["schemas"]["UpdateLanguageRequest"] = { language: picked };
      await apiFetch("/users/me/language", { method: "PATCH", body: JSON.stringify(body) });
      updateUser({ preferred_language: picked });
    } catch {
      toast.error(t("language.saveFailed"));
    } finally {
      setSaving(false);
      onOpenChange(false);
      onSaved?.();
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        // Reopening starts from what is in force, not from an abandoned tap.
        if (next) setPicked(getStoredLanguage() ?? user?.preferred_language ?? screenLanguage);
        onOpenChange(next);
      }}
    >
      <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle lang={picked}>{t("language.title")}</SheetTitle>
          <SheetDescription>{others.join(" · ")}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-3" role="group">
          {LANGUAGES.map((lang) => {
            const selected = lang === picked;
            return (
              <button
                key={lang}
                type="button"
                lang={lang}
                aria-pressed={selected}
                onClick={() => setPicked(lang)}
                className={`relative flex min-h-[76px] items-center overflow-hidden rounded-xl px-4 py-3.5 text-left transition-colors ${
                  selected
                    ? "border-2 border-primary bg-primary/5"
                    : "border border-border bg-card hover:bg-accent"
                }`}
              >
                <span className="relative z-10 flex flex-col gap-0.5">
                  <span
                    className={`text-xl font-semibold leading-snug ${
                      selected ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {LANGUAGE_NAMES[lang].native}
                  </span>
                  <span lang="en" className="text-[13px] text-muted-foreground">
                    {LANGUAGE_NAMES[lang].english}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`absolute right-12 top-1/2 -translate-y-1/2 text-5xl font-bold leading-none ${
                    selected ? "text-primary/15" : "text-muted"
                  }`}
                >
                  {MARK[lang]}
                </span>
                {selected && (
                  <span className="absolute right-4 top-1/2 z-10 flex h-[22px] w-[22px] -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p lang={picked} className="mt-3 text-xs text-muted-foreground">
          {t("language.note")}
        </p>

        <button
          type="button"
          lang={picked}
          onClick={save}
          disabled={saving}
          className="mt-3 flex h-[52px] w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : t("language.continue")}
        </button>
      </SheetContent>
    </Sheet>
  );
}
