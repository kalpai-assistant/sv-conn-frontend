/**
 * Asks for a language once after sign-in (SVC-375).
 *
 * Only when all of these hold: the kill switch is on for this user, they have
 * never chosen (`preferred_language` is null), and they are on a provider or
 * Pro screen — the only screens a choice changes. A customer is never asked.
 *
 * A new SP is asked at the start of `/provider/onboarding` (SVC-376), so the
 * whole sign-up is in their language. The wizard reads the language from
 * context, so picking one re-renders the current step in place: nothing is
 * remounted and nothing typed is lost.
 *
 * Once per sign-in, whether they pick or close it: `resetLanguagePrompt` (on
 * logout) re-arms it. The rule itself is `shouldAskLanguage` in i18n/language.
 * A pick whose save failed is not asked about again: the app keeps it and
 * sends it on the next start (SVC-395).
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
