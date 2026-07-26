import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Teaches Vitest the `@/*` path alias from tsconfig.json.
 *
 * Until the email templates, every test imported its subject relatively and
 * nothing needed this. A template imports @/lib/format, so a test that loads one
 * fails at resolution rather than assertion — with an error that reads like a
 * missing package rather than a missing alias.
 *
 * Written by hand rather than through vite-tsconfig-paths: one alias doesn't
 * justify a dependency, and `vitest/config` is already installed.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
