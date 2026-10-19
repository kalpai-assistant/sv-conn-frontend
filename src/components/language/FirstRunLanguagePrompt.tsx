/**
 * Asks for a language once after sign-in (SVC-375).
 *
 * Only when all of these hold: the kill switch is on for this user, they have
 * never chosen (`preferred_language` is null), and they are on a provider or
 * Pro screen — the only screens a choice changes. A customer is never asked.
 *
 * Not on `/provider/onboarding`: the wizard is still English until SVC-376
 * translates the SP's screens, and a Hindi picker followed by an English
 * wizard reads as broken. The SP is asked once they reach the rest of
 * `/provider`.
 *
 * Once per sign-in, whether they pick or close it: `resetLanguagePrompt` (on
 * logout) re-arms it. The rule itself is `shouldAskLanguage` in i18n/language. A save that failed leaves the backend empty, so the next
 * sign-in asks again.
 */
import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { markLanguageAsked, shouldAskLanguage } from "@/i18n/language";
import { useAuth } from "@/lib/auth-context";
import { LanguageSheet } from "./LanguageSheet";

export function FirstRunLanguagePrompt() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
  const ask = shouldAskLanguage(pathname, user);
  const userId = user?.id;

  // An effect, not render: recording "asked" is a side effect, and StrictMode's
  // double render would otherwise record it on a render React throws away.
  useEffect(() => {
    if (!ask || !userId) return;
    markLanguageAsked(userId);
    setOpen(true);
  }, [ask, userId]);

  if (!open) return null;
  return <LanguageSheet open={open} onOpenChange={setOpen} />;
}
