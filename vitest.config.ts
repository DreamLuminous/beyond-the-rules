import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@btr/contracts": fileURLToPath(new URL("./packages/contracts/src/index.ts", import.meta.url)),
      "@btr/rule-engine": fileURLToPath(new URL("./packages/rule-engine/src/index.ts", import.meta.url))
    }
  },
  test: { include: ["tests/**/*.test.ts"] }
});

