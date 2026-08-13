import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { npmCommand } from "./npm-command.mjs";
import { resolveReleaseVersion } from "./release-version.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = join(root, "artifacts");
const version = await resolveReleaseVersion();
if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`The root package.json has an invalid release version: ${String(version)}`);
}
const windowsVersion = `${version.split(/[-+]/, 1)[0]}.0`;
const packageName = `Tapir-${version}-win32-x64`;
const outputDir = join(artifactsDir, packageName);
const zipPath = join(artifactsDir, `${packageName}.zip`);
const logPath = join(artifactsDir, "package-windows.log");
const manifestPath = join(artifactsDir, "release-manifest.json");
const checksumsPath = join(artifactsDir, "SHA256SUMS.txt");

await mkdir(artifactsDir, { recursive: true });
await writeFile(logPath, `Tapir Windows packaging started ${new Date().toISOString()}\n`, "utf8");
await rm(outputDir, { recursive: true, force: true });
await rm(zipPath, { force: true });
await rm(manifestPath, { force: true });
await rm(checksumsPath, { force: true });

try {
  if (process.platform !== "win32") throw new Error("Tapir's Windows packaging command must run on Windows.");
  runNpm(["--workspace", "@tapir/desktop", "run", "build"]);
  runNpm(["run", "rebuild:native:electron"]);

  await cp(join(root, "node_modules", "electron", "dist"), outputDir, { recursive: true });
  await mkdir(join(outputDir, "resources", "app", "node_modules"), { recursive: true });
  await cp(join(root, "apps", "desktop", "out"), join(outputDir, "resources", "app", "out"), { recursive: true });
  await cp(join(root, "apps", "desktop", "build"), join(outputDir, "resources", "app", "build"), { recursive: true });
  await cp(join(root, "node_modules", "better-sqlite3"), join(outputDir, "resources", "app", "node_modules", "better-sqlite3"), { recursive: true });
  await writeFile(join(outputDir, "resources", "app", "package.json"), JSON.stringify({
    name: "tapir",
    version,
    private: true,
    type: "module",
    main: "out/main/index.js"
  }, null, 2), "utf8");
  await writeFile(join(outputDir, "resources", "app-update.yml"), [
    "provider: github",
    "owner: otzhora",
    "repo: Tapir",
    "updaterCacheDirName: tapir-updater"
  ].join("\n") + "\n", "utf8");
  await writeFile(join(outputDir, "PACKAGING.txt"), [
    "Tapir portable Windows build",
    "Launch Tapir.exe.",
    "Local data is stored in Electron's per-user application-data directory.",
    "This folder is self-contained and does not require the source repository or a development server."
  ].join("\r\n"), "utf8");
  await rm(join(outputDir, "Tapir.exe"), { force: true });
  await rename(join(outputDir, "electron.exe"), join(outputDir, "Tapir.exe"));
  run(join(root, "node_modules", "electron-winstaller", "vendor", "rcedit.exe"), [
    "Tapir.exe",
    "--set-icon",
    join("resources", "app", "build", "icon.ico"),
    "--set-version-string",
    "ProductName",
    "Tapir",
    "--set-version-string",
    "FileDescription",
    "Tapir",
    "--set-version-string",
    "InternalName",
    "Tapir",
    "--set-version-string",
    "OriginalFilename",
    "Tapir.exe",
    "--set-product-version",
    windowsVersion,
    "--set-file-version",
    windowsVersion
  ], outputDir);

  run("tar.exe", ["-a", "-c", "-f", zipPath, "-C", artifactsDir, packageName]);
  const sha256 = createHash("sha256").update(await readFile(zipPath)).digest("hex");
  const sourceRevision = gitOutput(["rev-parse", "HEAD"]);
  const sourceDirty = gitOutput(["status", "--short"]).length > 0;
  const manifest = {
    schemaVersion: 1,
    product: "Tapir",
    version,
    platform: "win32",
    architecture: "x64",
    archive: `${packageName}.zip`,
    sha256,
    sourceRevision,
    sourceDirty,
    createdAt: new Date().toISOString()
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(checksumsPath, `${sha256}  ${packageName}.zip\n`, "utf8");
  await log(`Portable directory: ${outputDir}\nZip artifact: ${zipPath}\nSHA-256: ${sha256}\nManifest: ${manifestPath}\nTapir Windows packaging completed ${new Date().toISOString()}\n`);
  console.log(`Tapir Windows artifacts created:\n${outputDir}\n${zipPath}\n${manifestPath}`);
  runNpm(["run", "package:installer:win"]);
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  await log(`PACKAGING FAILED\n${message}\n`);
  console.error(`${message}\nPackaging log: ${logPath}`);
  process.exitCode = 1;
}

function runNpm(args) {
  const command = npmCommand(args);
  run(command.command, command.args);
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: false, windowsHide: true });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (output) {
    process.stdout.write(output);
    log(`> ${command} ${args.join(" ")}\n${output}\n`);
  }
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status ?? "unknown"}.`);
}

function gitOutput(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr ?? "unknown error"}`);
  return result.stdout.trim();
}

function log(value) {
  appendFileSync(logPath, value, "utf8");
}
