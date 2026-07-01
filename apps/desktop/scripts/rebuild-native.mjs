import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { rebuild } from "@electron/rebuild";
import { getAbi } from "node-abi";

const require = createRequire(import.meta.url);
const electronVersion = require("electron/package.json").version;
const electronBinary = require("electron");
const electronAbi = Number(getAbi(electronVersion, "electron"));
const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(desktopDir, "../..");
const driveAlias = createWindowsDriveAlias(projectRoot);
const rebuildRoot = driveAlias?.root ?? projectRoot;
const rebuildStorageDir = resolve(rebuildRoot, "packages/storage");

try {
  await rebuild({
    buildFromSource: true,
    buildPath: rebuildStorageDir,
    electronVersion,
    force: true,
    forceABI: electronAbi,
    onlyModules: ["better-sqlite3"],
    projectRootPath: rebuildRoot
  });
} finally {
  driveAlias?.dispose();
}

verifyElectronNativeModule(projectRoot, electronAbi);

function createWindowsDriveAlias(targetPath) {
  if (process.platform !== "win32" || !targetPath.includes(" ")) {
    return null;
  }

  for (const letter of "ZYXWVUTSRQPONMLKJIHGFED".split("")) {
    const drive = `${letter}:`;
    const root = `${drive}\\`;
    if (existsSync(root)) continue;

    try {
      execFileSync("subst", [drive, targetPath], { windowsHide: true });
      return {
        root,
        dispose: () => {
          execFileSync("subst", [drive, "/d"], { windowsHide: true });
        }
      };
    } catch {
      continue;
    }
  }

  return null;
}

function verifyElectronNativeModule(cwd, abi) {
  const nativeBindingPath = resolve(cwd, `node_modules/better-sqlite3/bin/${process.platform}-${process.arch}-${abi}/better-sqlite3.node`);
  execFileSync(electronBinary, ["-e", `require(${JSON.stringify(nativeBindingPath)})`], {
    cwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1"
    },
    stdio: "pipe",
    windowsHide: true
  });
}
