/**
 * Storybook preview — SVC-489.
 *
 * Imports `../src/styles.css` so OKLCH tokens, Tailwind utilities, and the
 * `@media (prefers-color-scheme: dark)` block all resolve the same way they
 * do in-app.
 *
 * The `theme` global toolbar maps to the same `.dark` class the app sets
 * via `useSyncSystemColorScheme`, so stories can be eyeballed in both modes
 * without having to flip OS preferences. Setting to "system" defers to the
 * OS — matches the real app's default behaviour.
 */
import type { Preview } from "@storybook/react-vite";
import React, { useEffect } from "react";

import "../src/styles.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "centered",
  },
  globalTypes: {
    theme: {
      description: "Toggle between light, dark, and system (OS pref).",
      defaultValue: "system",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "system", title: "System" },
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const { theme } = context.globals as { theme?: "system" | "light" | "dark" };
      useEffect(() => {
        const html = document.documentElement;
        if (theme === "dark") {
          html.classList.add("dark");
          return;
        }
        if (theme === "light") {
          html.classList.remove("dark");
          return;
        }
        // system: mirror the OS the same way `useSyncSystemColorScheme` does.
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const apply = (dark: boolean) => html.classList.toggle("dark", dark);
        apply(media.matches);
        const listener = (event: MediaQueryListEvent) => apply(event.matches);
        media.addEventListener("change", listener);
        return () => media.removeEventListener("change", listener);
      }, [theme]);
      return <Story />;
    },
  ],
};

export default preview;
