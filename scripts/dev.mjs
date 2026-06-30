import { run } from "./run-dev-processes.mjs";

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

function npmCommand(args) {
  return process.platform === "win32"
    ? { command: "cmd.exe", args: ["/d", "/s", "/c", "npm", ...args] }
    : { command: "npm", args };
}

function fixturePath(name) {
  return new URL(`../test-projects/${name}/`, import.meta.url);
}
