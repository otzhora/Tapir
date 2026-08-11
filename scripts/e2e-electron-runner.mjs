import { spawnSync } from "node:child_process";
import process from "node:process";
import { npmCommand } from "./npm-command.mjs";

const rebuild = runNpm(["run", "rebuild:native:electron"]);
if (rebuild.status !== 0) process.exit(rebuild.status ?? 1);

const build = runNpm(["--workspace", "@tapir/desktop", "run", "build"]);
if (build.status !== 0) process.exit(build.status ?? 1);

const e2e = spawnSync(process.execPath, ["scripts/e2e-electron.mjs"], {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: false
});
process.exit(e2e.status ?? 1);

function runNpm(args) {
  const command = npmCommand(args);
  return spawnSync(command.command, command.args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: false
  });
}
