import process from "node:process";
import { fileURLToPath } from "node:url";

const npmLauncher = fileURLToPath(new URL("./tapir-npm.cmd", import.meta.url));

export function npmCommand(args) {
  return process.platform === "win32"
    ? {
        command: "cmd.exe",
        args: ["/d", "/c", npmLauncher, ...args]
      }
    : { command: "npm", args };
}
