/**
 * A compact language switch for screens with no Profile to reach (SVC-395).
 *
 * The onboarding wizard is the case: a new SP picks a language from the
 * first-run prompt before step 1, and until onboarding is done there is no
 * Profile screen and so no Language row. Without this, a wrong pick stayed
 * for the whole wizard — found on device. Picking re-renders the current
 * step in place, so nothing typed is lost.
 *
 * Renders nothing while `i18n_enabled` is off.
 */
import { useState } from "react";
import { Languages } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { LANGUAGE_NAMES } from "@/i18n/languages";
import { useAuth } from "@/lib/auth-context";
import { LanguageSheet } from "./LanguageSheet";

export function LanguageChip() {
  const { user } = useAuth();
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  if (user?.i18n_enabled !== true) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("language.row")}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary/50"
      >
        <Languages className="h-3.5 w-3.5 text-muted-foreground" />
        <span lang={lang}>{LANGUAGE_NAMES[lang].native}</span>
      </button>
      {open && <LanguageSheet open={open} onOpenChange={setOpen} />}
    </>
  );
}
