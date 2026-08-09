import { cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { npmCommand } from "./npm-command.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = join(root, "artifacts");
const packageName = "Tapir-win32-x64";
const outputDir = join(artifactsDir, packageName);
const zipPath = join(artifactsDir, `${packageName}.zip`);
const logPath = join(artifactsDir, "package-windows.log");

await mkdir(artifactsDir, { recursive: true });
await writeFile(logPath, `Tapir Windows packaging started ${new Date().toISOString()}\n`, "utf8");

try {
  if (process.platform !== "win32") throw new Error("Tapir's Windows packaging command must run on Windows.");
  runNpm(["--workspace", "@tapir/desktop", "run", "build"]);
  runNpm(["run", "rebuild:native:electron"]);

  await rm(outputDir, { recursive: true, force: true });
  await rm(zipPath, { force: true });
  await cp(join(root, "node_modules", "electron", "dist"), outputDir, { recursive: true });
  await mkdir(join(outputDir, "resources", "app", "node_modules"), { recursive: true });
  await cp(join(root, "apps", "desktop", "out"), join(outputDir, "resources", "app", "out"), { recursive: true });
  await cp(join(root, "node_modules", "better-sqlite3"), join(outputDir, "resources", "app", "node_modules", "better-sqlite3"), { recursive: true });
  await writeFile(join(outputDir, "resources", "app", "package.json"), JSON.stringify({
    name: "tapir",
    version: "0.1.0",
    private: true,
    type: "module",
    main: "out/main/index.js"
  }, null, 2), "utf8");
  await writeFile(join(outputDir, "PACKAGING.txt"), [
    "Tapir portable Windows build",
    "Launch Tapir.exe.",
    "Local data is stored in Electron's per-user application-data directory.",
    "This folder is self-contained and does not require the source repository or a development server."
  ].join("\r\n"), "utf8");
  await rm(join(outputDir, "Tapir.exe"), { force: true });
  await rename(join(outputDir, "electron.exe"), join(outputDir, "Tapir.exe"));

  run("tar.exe", ["-a", "-c", "-f", zipPath, "-C", artifactsDir, packageName]);
  await log(`Portable directory: ${outputDir}\nZip artifact: ${zipPath}\nTapir Windows packaging completed ${new Date().toISOString()}\n`);
  console.log(`Tapir Windows artifacts created:\n${outputDir}\n${zipPath}`);
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

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", shell: false, windowsHide: true });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (output) {
    process.stdout.write(output);
    log(`> ${command} ${args.join(" ")}\n${output}\n`);
  }
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status ?? "unknown"}.`);
}

function log(value) {
  appendFileSync(logPath, value, "utf8");
}
