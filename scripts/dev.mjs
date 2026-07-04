import { run } from "./run-dev-processes.mjs";
import { npmCommand } from "./npm-command.mjs";

run([
  {
    name: "tapir",
    ...npmCommand(["run", "dev:desktop"]),
    cwd: process.cwd()
  },
  {
    name: "node-api",
    ...npmCommand(["start"]),
    cwd: fixturePath("node-swagger-api")
  }
]);

function fixturePath(name) {
  return new URL(`../test-projects/${name}/`, import.meta.url);
}
