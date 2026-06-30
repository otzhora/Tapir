import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rebuild } from "@electron/rebuild";

const require = createRequire(import.meta.url);
const electronVersion = require("electron/package.json").version;
const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(desktopDir, "../..");
const storageDir = resolve(projectRoot, "packages/storage");

await rebuild({
  buildPath: storageDir,
  electronVersion,
  onlyModules: ["better-sqlite3"],
  projectRootPath: storageDir
});
