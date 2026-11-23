/**
 * Theme toggle for the marketing header (SVC-378 Phase 1.5).
 *
 * Three states cycle on click: system → light → dark → system.
 * The icon reflects the CURRENT effective theme, not the stored
 * choice — that is what a visitor can sanity-check against the page
 * ("sun icon means light theme is active"). The aria-label spells out
 * the next action ("Switch to dark theme").
 *
 * WHY A CYCLE, NOT A DROPDOWN
 * Three states + one button = two clicks maximum to reach any state.
 * A dropdown would need a listbox + aria + outside-click handler and
 * doubles the DOM for a surface most visitors use once. If we ever
 * need per-tab-visible state, swap this for a Popover that shows the
 * current choice and three radio options.
 *
 * Uses helpers from ./theme.ts so the inline-script bootstrap and
 * this component stay in step.
 */
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import {
  getStoredTheme,
  getSystemTheme,
  resolveTheme,
  setTheme,
  subscribeToSystemTheme,
  type ThemeChoice,
  type EffectiveTheme,
} from "./theme";

const CYCLE: Record<ThemeChoice, ThemeChoice> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const NEXT_LABEL: Record<ThemeChoice, string> = {
  system: "Switch to light theme",
  light: "Switch to dark theme",
  dark: "Switch to system theme",
};

export function ThemeToggle({ className = "" }: { className?: string }) {
  // Initialize from what the bootstrap script already applied. During
  // SSR (if we ever add it) both default to "system" / "light" and the
  // first client render reconciles — no hydration mismatch because we
  // don't commit the current-icon decision until useEffect runs.
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [effective, setEffective] = useState<EffectiveTheme>("light");

  useEffect(() => {
    const stored = getStoredTheme();
    setChoice(stored);
    setEffective(resolveTheme(stored));
  }, []);

  // When the choice is "system", honor live OS flips. When the choice is
  // explicit, ignore OS flips — the user pinned it for a reason.
  useEffect(() => {
    if (choice !== "system") return;
    return subscribeToSystemTheme((next) => setEffective(next));
  }, [choice]);

  const onClick = () => {
    const next = CYCLE[choice];
    const applied = setTheme(next);
    setChoice(next);
    setEffective(applied);
  };

  const Icon = effective === "dark" ? Moon : choice === "system" ? Monitor : Sun;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={NEXT_LABEL[choice]}
      title={`${choice.charAt(0).toUpperCase() + choice.slice(1)} theme`}
      className={`focus-inset inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${className}`}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
