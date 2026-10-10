import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts", "scripts/**/*.test.ts"], testTimeout: 30_000,
    // Copied from pulse, but they import pulse server code (the demo seed scenario, the journal tag defaults).
    exclude: ["**/node_modules/**", "src/core/algorithms/healthMonitor.test.ts", "src/lib/behaviors.test.ts"],
  },
});
