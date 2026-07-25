import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // CLAUDE.md rule 1: tenant-owned data is only ever reached through the scoped
  // helpers in lib/db/*. Importing the Prisma client anywhere else bypasses the
  // tenantId argument those helpers force you to pass, so it's banned outright.
  // If you hit this error, add a helper in lib/db/* — don't work around it.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/db/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              message:
                "Import Prisma only inside src/lib/db/**. Add a tenant-scoped helper there instead.",
            },
          ],
          patterns: [
            {
              group: ["**/lib/db/prisma", "**/lib/db/prisma.*"],
              message:
                "The Prisma client instance is private to src/lib/db/**. Use a scoped helper from that directory.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
