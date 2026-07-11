import { spawnSync } from "node:child_process";
import { npmCommand } from "./npm-command.mjs";

const nodeRebuild = runNpm(["run", "rebuild:native:node"]);
let testResult = null;
let fixtureResult = null;
let electronRebuild = null;

if (nodeRebuild.status === 0) {
  fixtureResult = spawnSync(process.execPath, ["scripts/test-fixture-auth.mjs"], { cwd: process.cwd(), stdio: "inherit", shell: false });
}

if (nodeRebuild.status === 0 && fixtureResult?.status === 0) {
  testResult = runNpm(["run", "test:workspaces"]);
}

electronRebuild = runNpm(["run", "rebuild:native:electron"]);

if (nodeRebuild.status !== 0) process.exit(nodeRebuild.status ?? 1);
if (fixtureResult && fixtureResult.status !== 0) process.exit(fixtureResult.status ?? 1);
if (testResult && testResult.status !== 0) process.exit(testResult.status ?? 1);
if (electronRebuild.status !== 0) process.exit(electronRebuild.status ?? 1);

function runNpm(args) {
  const command = npmCommand(args);
  return spawnSync(command.command, command.args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: false
  });
}
