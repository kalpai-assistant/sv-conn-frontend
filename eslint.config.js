import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "dist-mobile",
      // Marketing SPA build output. Gitignored (see .gitignore) but was
      // missing from the lint ignore list, so a local `build:marketing`
      // left behind bundle output that then failed prettier/no-explicit-any
      // rules on the next `npm run lint`.
      "dist-marketing",
      ".output",
      ".vinxi",
      // Native project trees — ESLint walking these is what makes local
      // runs feel stuck. Nothing under them is TS/TSX we author anyway.
      "android",
      "ios",
      "src/routeTree.gen.ts",
      // Generated from openapi-typescript (svc_connect.json). Regenerated on
      // every backend spec change — hand-lint would be a fight.
      "src/types/api.ts",
    ],
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
          // Named non-component exports that we've decided are safe to sit
          // alongside components. The rule exists to keep HMR reliable —
          // these particular names are stable enough (shadcn primitives
          // rarely change; auth/router are edit-once files) that the HMR
          // downgrade to "remount instead of hot-swap" costs us nothing in
          // practice.
          //
          // Additions to this list should include a one-line justification
          // in the PR — the goal is a small, well-understood exception list,
          // not an ever-growing catch-all.
          allowExportNames: [
            // shadcn cva variants — used across the app for consistent styling,
            // paired with the component for import ergonomics.
            "badgeVariants",
            "buttonVariants",
            "toggleVariants",
            "navigationMenuTriggerStyle",
            // shadcn hooks bundled with their components in canonical shadcn.
            "useFormField",
            "useSidebar",
            // Our own auth + router utilities. Extracting to separate files
            // adds indirection without meaningful HMR benefit for files that
            // change once a quarter.
            "useAuth",
            "getRouter",
            // Cart hook is co-located with CartProvider (mirrors the
            // auth-context.tsx pattern). Same reasoning: the provider file
            // is edit-once and the co-location keeps the API together.
            "useCart",
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      // Blocking. The 18 preexisting `any`s were retyped against the
      // OpenAPI spec (openapi-typescript → src/types/api.ts) and the
      // Razorpay window shim. Any new `any` requires either a type or
      // an explicit `// eslint-disable-next-line ...` with a reason.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  eslintPluginPrettier,
);
