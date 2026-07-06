import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const desktopRoot = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@tapir/core": resolve(repoRoot, "packages/core/src/index.ts"),
      "@tapir/openapi": resolve(repoRoot, "packages/openapi/src/index.ts"),
      "@tapir/storage": resolve(repoRoot, "packages/storage/src/index.ts"),
      "@renderer": resolve(desktopRoot, "src/renderer/src")
    }
  }
});
