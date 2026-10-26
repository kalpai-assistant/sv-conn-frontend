/**
 * The Language row on Profile (SVC-375): what is in force, and the picker.
 *
 * On `/provider/profile` for an SP, and on `/profile` for a team Pro — the
 * screen their avatar opens. `/profile` is a customer route and stays
 * English, so there the row reads "Language" with the chosen language's own
 * name beside it.
 *
 * Renders nothing while `i18n_enabled` is off, so with the switch off the
 * screen is exactly what it was.
 */
import { useState } from "react";
import { ChevronRight, Languages } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { useStoredLanguage } from "@/i18n/language";
import { LANGUAGE_NAMES } from "@/i18n/languages";
import { useAuth } from "@/lib/auth-context";
import { LanguageSheet } from "./LanguageSheet";

export function LanguageRow() {
  const { user } = useAuth();
  const { t } = useT();
  const stored = useStoredLanguage();
  const [open, setOpen] = useState(false);
  if (user?.i18n_enabled !== true) return null;

  const chosen = stored ?? user.preferred_language ?? "en";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-secondary/50"
      >
        <Languages className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
          {t("language.row")}
        </span>
        <span lang={chosen} className="text-sm text-muted-foreground">
          {LANGUAGE_NAMES[chosen].native}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && <LanguageSheet open={open} onOpenChange={setOpen} />}
    </>
  );
}
