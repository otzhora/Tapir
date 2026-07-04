import { resolve } from "node:path";
import crypto, { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

type CryptoWithHash = typeof crypto & {
  hash?: (algorithm: string, data: unknown, outputEncoding: crypto.BinaryToTextEncoding) => string;
};

const cryptoWithHash = crypto as CryptoWithHash;
if (!cryptoWithHash.hash) {
  Object.defineProperty(cryptoWithHash, "hash", {
    value: (algorithm: string, data: unknown, outputEncoding: crypto.BinaryToTextEncoding) =>
      createHash(algorithm).update(data as string).digest(outputEncoding as BufferEncoding)
  });
}

const vue = (await import("@vitejs/plugin-vue")).default;
const tailwindcss = (await import("@tailwindcss/vite")).default;
const workspacePackages = ["@tapir/core", "@tapir/openapi", "@tapir/storage"];
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const desktopRoot = fileURLToPath(new URL("./", import.meta.url));
const workspaceAliases = {
  "@tapir/core": resolve(repoRoot, "packages/core/src/index.ts"),
  "@tapir/openapi": resolve(repoRoot, "packages/openapi/src/index.ts"),
  "@tapir/storage": resolve(repoRoot, "packages/storage/src/index.ts")
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    resolve: {
      alias: workspaceAliases
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: workspaceAliases
    }
  },
  renderer: {
    root: resolve(desktopRoot, "src/renderer"),
    plugins: [tailwindcss(), vue()],
    resolve: {
      alias: {
        "@renderer": resolve(desktopRoot, "src/renderer/src")
      }
    }
  }
});
