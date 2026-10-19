/**
 * Puts the active language in context, decided during render (SVC-375).
 *
 * Decided in render, not in an effect, on purpose. A Pro who taps the avatar
 * on `/pro` lands on `/profile`, a customer route that must be English; an
 * effect would switch the language one commit late, so the first frame of
 * `/profile` (and its bottom nav) would paint in Hindi. Here the pathname, the
 * user and the stored choice give the language in the same render that draws
 * the screen, and every `useT` reads it from context in that render.
 *
 * The global i18next language is never changed: each `useT` gets a `t` fixed
 * to the context's language, so nothing reads a language left over from
 * another route. `<html lang>` follows in an effect — it is not painted.
 *
 * Outside this provider (unit tests that render a component alone) the
 * language is English.
 */
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import type { Namespace } from "./index";
import { activeLanguage, useStoredLanguage } from "./language";
import type { AppLanguage } from "./languages";

const LanguageContext = createContext<AppLanguage>("en");

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const stored = useStoredLanguage();
  const lang = activeLanguage({ pathname, user, stored });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return <LanguageContext.Provider value={lang}>{children}</LanguageContext.Provider>;
}

/** The language this screen renders in. */
export function useLanguage(): AppLanguage {
  return useContext(LanguageContext);
}

/** `t` for one namespace, fixed to this screen's language. */
export function useT(ns: Namespace = "common") {
  const lang = useLanguage();
  const { t } = useTranslation(ns, { lng: lang });
  return { t, lang };
}
