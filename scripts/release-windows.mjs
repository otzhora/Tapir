import { appendFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { npmCommand } from "./npm-command.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = join(root, "artifacts");
const logPath = join(artifactsDir, "release-windows.log");
const summaryPath = join(artifactsDir, "release-summary.json");
const allowDirty = process.argv.includes("--allow-dirty");

await mkdir(artifactsDir, { recursive: true });
await writeFile(logPath, `Tapir Windows release preflight started ${new Date().toISOString()}\n`, "utf8");
await rm(summaryPath, { force: true });

try {
  if (process.platform !== "win32") throw new Error("Tapir's Windows release command must run on Windows.");
  const dirtyFiles = output("git", ["status", "--short"]);
  if (dirtyFiles && !allowDirty) {
    throw new Error("Release preflight requires a clean worktree. Commit the intended release changes, then run it again.");
  }
  if (dirtyFiles) await log(`WARNING: verification build contains uncommitted changes:\n${dirtyFiles}\n`);

  runNpm(["run", "typecheck"]);
  runNpm(["test"]);
  runNpm(["run", "e2e:desktop"]);
  runNpm(["run", "package:win"]);
  runNpm(["run", "smoke:packaged:win"]);
  run("git", ["diff", "--check"]);

  const manifest = JSON.parse(await readFile(join(artifactsDir, "release-manifest.json"), "utf8"));
  const summary = {
    ok: true,
    verifiedAt: new Date().toISOString(),
    verification: ["typecheck", "tests", "fixture authentication", "Electron E2E", "NSIS installer and update metadata", "packaging", "packaged smoke", "git diff --check"],
    ...manifest
  };
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await log(`RELEASE PREFLIGHT PASSED\n${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Tapir Windows release preflight passed.\nSummary: ${summaryPath}`);
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  await log(`RELEASE PREFLIGHT FAILED\n${message}\n`);
  console.error(`${message}\nRelease log: ${logPath}`);
  process.exitCode = 1;
}

function runNpm(args) {
  const command = npmCommand(args);
  run(command.command, command.args);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", shell: false, windowsHide: true });
  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (combined) {
    process.stdout.write(combined);
    appendFileSync(logPath, `> ${command} ${args.join(" ")}\n${combined}\n`, "utf8");
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status ?? "unknown"}.`);
}

function output(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", shell: false, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr ?? "unknown error"}`);
  return result.stdout.trim();
}

function log(value) {
  appendFileSync(logPath, value, "utf8");
}
