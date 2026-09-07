// vitest.config.mjs
//
// Vitest ne lit pas les `paths` de jsconfig.json : l'alias `@/` du site est
// déclaré ici, pour que les tests importent les modules comme les pages le font.

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
