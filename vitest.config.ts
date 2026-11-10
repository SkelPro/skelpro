import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Compiles the CLI once so CLI tests don't each run ts-node.
    globalSetup: ["./test/global-setup.ts"],
  },
});
