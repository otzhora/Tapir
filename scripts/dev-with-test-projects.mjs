import process from "node:process";
import { fileURLToPath } from "node:url";
import { npmCommand } from "./npm-command.mjs";
import { run } from "./run-dev-processes.mjs";

const commands = [
  {
    name: "tapir",
    ...npmCommand(["run", "dev:desktop"]),
    cwd: process.cwd()
  },
  {
    name: "node-api",
    ...npmCommand(["start"]),
    cwd: fixturePath("node-swagger-api")
  },
  {
    name: "dotnet-api",
    command: "dotnet",
    args: ["run"],
    cwd: fixturePath("dotnet-swagger-api")
  }
];

run(commands);

function fixturePath(name) {
  return fileURLToPath(new URL(`../test-projects/${name}/`, import.meta.url));
}
