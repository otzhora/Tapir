import { resolve } from "node:path";
import crypto, { createHash } from "node:crypto";
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

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve("src/renderer"),
    plugins: [vue()],
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src")
      }
    }
  }
});
