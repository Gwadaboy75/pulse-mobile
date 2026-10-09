const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

// Copied from pulse; they import pulse server code. Also excluded in vitest.config.ts and tsconfig.json.
const pulseServerTests = ["src/core/algorithms/healthMonitor.test.ts", "src/lib/behaviors.test.ts"];

module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist/*", ".expo/*", "src/data/migrations/*", ".claude/*", ...pulseServerTests] },
]);
