/**
 * i18next for the provider and Pro apps (SVC-375).
 *
 * Every resource is bundled and init is synchronous, so a language is ready
 * the moment it is asked for: no loading state, no network, and the first
 * render already has its strings. That is what lets the active language be
 * chosen during render (see `LanguageProvider`) rather than one frame late.
 *
 * English is both the start language and the fallback, so a key missing from
 * hi/mr renders English, never the raw key. The parity test keeps the three
 * key sets identical anyway; the fallback is for the copy that is present but
 * empty while a translation is drafted.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./en/common.json";
import enPro from "./en/pro.json";
import enProvider from "./en/provider.json";
import hiCommon from "./hi/common.json";
import hiPro from "./hi/pro.json";
import hiProvider from "./hi/provider.json";
import mrCommon from "./mr/common.json";
import mrPro from "./mr/pro.json";
import mrProvider from "./mr/provider.json";
import type { AppLanguage } from "./languages";

export const NAMESPACES = ["common", "pro", "provider"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const resources: Record<AppLanguage, Record<Namespace, object>> = {
  en: { common: enCommon, pro: enPro, provider: enProvider },
  hi: { common: hiCommon, pro: hiPro, provider: hiProvider },
  mr: { common: mrCommon, pro: mrPro, provider: mrProvider },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  ns: NAMESPACES,
  defaultNS: "common",
  // React escapes already.
  interpolation: { escapeValue: false },
  returnNull: false,
  returnEmptyString: false,
  initAsync: false,
  react: { useSuspense: false },
});

export default i18n;
