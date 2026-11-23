import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmailSheet } from "@/components/provider/EmailSheet";
import { useT } from "@/i18n/LanguageProvider";
import { useAuth } from "@/lib/auth-context";
import { isEmailNudgeSnoozed, snoozeEmailNudge } from "@/lib/email-nudge";

/**
 * "Add your email to get pricing notices by email" (SVC-486), on the SP's home
 * while their email is empty. Add opens the email sheet; Not now hides it for
 * EMAIL_NUDGE_SNOOZE_DAYS. It never blocks anything: it is only a card.
 */
export function EmailNudge() {
  const { user } = useAuth();
  const { t } = useT("provider");
  const userId = user?.id ?? "";
  const [snoozed, setSnoozed] = useState(() => isEmailNudgeSnoozed(userId));
  const [open, setOpen] = useState(false);

  // The sheet stays mounted after a save so it can close, even though the
  // saved email hides the card.
  const show = Boolean(user) && !user?.email && !snoozed;

  return (
    <>
      {show && (
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{t("emailNudge.title")}</p>
            <p className="text-sm text-muted-foreground">{t("emailNudge.body")}</p>
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" onClick={() => setOpen(true)}>
                {t("emailNudge.add")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  snoozeEmailNudge(userId);
                  setSnoozed(true);
                }}
              >
                {t("emailNudge.notNow")}
              </Button>
            </div>
          </div>
        </div>
      )}
      <EmailSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
