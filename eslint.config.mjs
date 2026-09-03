import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      /**
       * A leading underscore already means "named so it can be ignored", and
       * the default config honours that for parameters — `(_ctx, command)`,
       * `(snapshot, _command, ports)`, `get(_target, prop)`, a dozen more.
       * It did not honour it for a destructured *variable*, so the one place
       * that discards a key by name — `const { items: _promised, ...rest }` in
       * `withoutItems` — was the repo's only standing unused-var warning.
       *
       * Made consistent rather than worked around: a warning that fires on the
       * convention the codebase already uses is a warning people learn to
       * scroll past, which is the one thing a lint run must not become.
       */
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);

export default eslintConfig;
