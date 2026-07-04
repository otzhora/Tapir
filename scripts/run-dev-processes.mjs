import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

export function run(commands) {
  const children = new Map();
  let shuttingDown = false;

  function prefixOutput(name, stream) {
    let buffer = "";

    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.length > 0) {
          console.log(`[${name}] ${line}`);
        }
      }
    });

    stream.on("end", () => {
      if (buffer.length > 0) {
        console.log(`[${name}] ${buffer}`);
      }
    });
  }

  function stopAll(exitCode = 0) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    for (const [name, child] of children) {
      if (!child.killed) {
        console.log(`[runner] stopping ${name}`);
        stopChild(child);
      }
    }

    setTimeout(() => process.exit(exitCode), 500).unref();
  }

  for (const item of commands) {
    const child = spawn(item.command, item.args, {
      cwd: item.cwd instanceof URL ? fileURLToPath(item.cwd) : item.cwd,
      env: item.env ? { ...process.env, ...item.env } : process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    children.set(item.name, child);
    prefixOutput(item.name, child.stdout);
    prefixOutput(item.name, child.stderr);

    child.on("error", (error) => {
      console.error(`[runner] failed to start ${item.name}: ${error.message}`);
      stopAll(1);
    });

    child.on("exit", (code, signal) => {
      children.delete(item.name);

      if (!shuttingDown) {
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        console.log(`[runner] ${item.name} exited with ${reason}`);
        stopAll(code ?? 1);
      }
    });
  }

  process.on("SIGINT", () => stopAll(0));
  process.on("SIGTERM", () => stopAll(0));
}

function stopChild(child) {
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore"
    });
    return;
  }

  child.kill();
}
