import { spawnSync } from "node:child_process";
import { npmCommand } from "./npm-command.mjs";

const nodeRebuild = runNpm(["run", "rebuild:native:node"]);
let buildResult = null;
let dogfoodResult = null;

if (nodeRebuild.status === 0) buildResult = runNpm(["--workspace", "@tapir/desktop", "run", "build:dependencies"]);
if (nodeRebuild.status === 0 && buildResult?.status === 0) {
  dogfoodResult = spawnSync(process.execPath, ["scripts/dogfood-public-service.mjs"], { cwd: process.cwd(), stdio: "inherit", shell: false });
}
const electronRebuild = runNpm(["run", "rebuild:native:electron"]);

if (nodeRebuild.status !== 0) process.exit(nodeRebuild.status ?? 1);
if (buildResult && buildResult.status !== 0) process.exit(buildResult.status ?? 1);
if (dogfoodResult && dogfoodResult.status !== 0) process.exit(dogfoodResult.status ?? 1);
if (electronRebuild.status !== 0) process.exit(electronRebuild.status ?? 1);

function runNpm(args) {
  const command = npmCommand(args);
  return spawnSync(command.command, command.args, { cwd: process.cwd(), stdio: "inherit", shell: false });
}
