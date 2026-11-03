import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Mirrors ../eslint.config.js, minus the consumer-only pieces (native trees,
// OpenAPI types, i18n literal-string rule).
export default tseslint.config(
  {
    ignores: ["dist", "src/routeTree.gen.ts"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          allowExportNames: [
            // shadcn cva variants, paired with the component as in the consumer app.
            "buttonVariants",
            // TanStack file routes must export `Route`; the router owns their HMR.
            "Route",
          ],
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  eslintPluginPrettier,
);
