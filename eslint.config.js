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
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
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
