import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Prettier disables ESLint rules that conflict with formatting
  prettierConfig,

  {
    files: ["**/*.ts", "**/*.tsx", "**/*.d.ts"],	  
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",          // warn on `any`, not error
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",                            // allow _unused params
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },                          // enforce `import type`
      ],
      "@typescript-eslint/no-floating-promises": "error",    // catch unawaited promises
      "@typescript-eslint/await-thenable": "error",          // no await on non-promises
      "@typescript-eslint/no-misused-promises": "error",     // no async in wrong places

      // ── General ─────────────────────────────────────────────────
      "no-console": "warn",                                  // use logger, not console
      "prefer-const": "error",                               // no unnecessary let
      "no-var": "error",                                     // never use var
      "eqeqeq": ["error", "always"],                        // always === not ==
      "no-throw-literal": "error",                           // only throw Error objects
    },
  },

  {
    // Relaxed rules for test files
    files: ["**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",           // `as any` common in tests
      "@typescript-eslint/no-floating-promises": "off",      // vi.fn() returns are fine
      "no-console": "off",
    },
  },

  {
    // Ignore build output and deps
    ignores: ["dist/**", "node_modules/**", "coverage/**", "venv/**", "**/*.d.ts"],
  }
);
