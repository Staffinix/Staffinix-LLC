import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // `My-Version` is a legacy gitlink checkout, not part of this application's
  // source tree. Excluding it prevents tools from recursively linting another
  // repository with its own configuration and dependencies.
  { ignores: ["dist", ".output", ".vercel/**", ".vinxi", "My-Version/**", "supabase/.temp/**"] },
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
      // React Compiler rules added in eslint-plugin-react-hooks 7. Keep them visible
      // without blocking builds while existing components are migrated.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          // TanStack Router route modules export `Route = createFileRoute(...)({ component })`.
          extraHOCs: ["createFileRoute", "createRootRoute", "createRootRouteWithContext"],
          allowExportNames: [
            "badgeVariants",
            "buttonVariants",
            "navigationMenuTriggerStyle",
            "toggleVariants",
            "useFormField",
            "useSidebar",
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      // Several server-function boundaries consume untyped Supabase rows. Keep these
      // visible without blocking builds while those boundaries are typed incrementally.
      "@typescript-eslint/no-explicit-any": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  eslintPluginPrettier,
);
