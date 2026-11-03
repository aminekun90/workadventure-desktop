import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist", "release", "node_modules"] },
  js.configs.recommended,
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  {
    rules: {
      "no-console": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      // Lets `const { omitted, ...rest } = value` drop fields without a lint error.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  {
    // `import x = require()` is the only CommonJS import allowed under verbatimModuleSyntax.
    files: ["src/preload/**/*.cts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Renderer and preload code must never pull main-process or shared runtime code (zod, Node APIs).
    files: ["src/renderer/**/*.ts", "src/preload/**/*.cts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { patterns: [{ group: ["**/main/*", "**/shared/*"], allowTypeImports: true, message: "Renderer code may only import types from main or shared." }] },
      ],
    },
  },
);
