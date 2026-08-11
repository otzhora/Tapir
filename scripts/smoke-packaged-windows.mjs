import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = join(root, "artifacts");
const manifestPath = join(artifactsDir, "release-manifest.json");
const logPath = join(artifactsDir, "smoke-packaged-windows.log");
let tempDir;
let fixture;
let fixtureOutput = "";

await writeFile(logPath, `Tapir packaged smoke test started ${new Date().toISOString()}\n`, "utf8");
try {
  if (process.platform !== "win32") throw new Error("Tapir's packaged smoke test must run on Windows.");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    manifest.schemaVersion !== 1
    || typeof manifest.version !== "string"
    || typeof manifest.sha256 !== "string"
    || !/^[a-f0-9]{64}$/.test(manifest.sha256)
    || typeof manifest.archive !== "string"
    || !manifest.archive.endsWith(".zip")
    || manifest.archive !== basename(manifest.archive)
  ) {
    throw new Error(`Invalid release manifest at ${manifestPath}.`);
  }
  const zipPath = join(artifactsDir, manifest.archive);
  const port = await availablePort();
  const fixtureUrl = `http://127.0.0.1:${port}`;
  tempDir = await mkdtemp(join(tmpdir(), "tapir-packaged-smoke-"));
  const reportPath = join(tempDir, "report.json");
  const profilePath = join(tempDir, "profile");
  const extractedRoot = join(tempDir, manifest.archive.replace(/\.zip$/i, ""));
  const executable = join(extractedRoot, "Tapir.exe");
  const archiveSha256 = createHash("sha256").update(await readFile(zipPath)).digest("hex");
  if (archiveSha256 !== manifest.sha256) throw new Error(`Packaged ZIP checksum mismatch: expected ${manifest.sha256}, received ${archiveSha256}.`);
  const extraction = spawnSync("tar.exe", ["-xf", zipPath, "-C", tempDir], { cwd: root, encoding: "utf8", shell: false, windowsHide: true });
  await log(`[ZIP extraction]\n${extraction.stdout ?? ""}${extraction.stderr ?? ""}\n`);
  if (extraction.error) throw extraction.error;
  if (extraction.status !== 0) throw new Error(`Could not extract the packaged ZIP (exit ${extraction.status ?? "unknown"}).`);
  fixture = spawn(process.execPath, [join(root, "test-projects", "node-swagger-api", "server.js")], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  fixture.stdout?.on("data", (chunk) => { fixtureOutput += chunk.toString(); log(`[fixture] ${chunk}`); });
  fixture.stderr?.on("data", (chunk) => { fixtureOutput += chunk.toString(); log(`[fixture:error] ${chunk}`); });
  await waitForFixture(`${fixtureUrl}/health`);

  const result = spawnSync(executable, [`--user-data-dir=${profilePath}`], {
    cwd: dirname(executable),
    env: {
      ...process.env,
      TAPIR_PACKAGED_SMOKE: "1",
      TAPIR_SMOKE_BASE_URL: fixtureUrl,
      TAPIR_SMOKE_REPORT: reportPath,
      ELECTRON_ENABLE_LOGGING: "1"
    },
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 60_000
  });
  await log(`[Tapir stdout]\n${result.stdout ?? ""}\n[Tapir stderr]\n${result.stderr ?? ""}\n`);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Packaged Tapir exited with code ${result.status ?? "unknown"}.`);

  const report = JSON.parse(await readFile(reportPath, "utf8"));
  if (report.ok !== true || report.isPackaged !== true) throw new Error(`Packaged smoke report indicates failure: ${JSON.stringify(report)}`);
  if (report.appVersion !== manifest.version) throw new Error(`Packaged version ${report.appVersion} does not match manifest version ${manifest.version}.`);
  if (report.databaseExists !== true) throw new Error("Packaged Tapir did not create its SQLite database.");
  if (report.rendererLoaded !== true) throw new Error(`Packaged renderer did not load from the artifact: ${report.rendererUrl}`);
  if (report.responseStatus !== 200 || report.historyCount < 1) throw new Error(`Packaged request/history verification failed: ${JSON.stringify(report)}`);
  if (!String(report.nativeBindingPath).startsWith(extractedRoot)) throw new Error(`Native binding loaded outside the extracted artifact: ${report.nativeBindingPath}`);
  if (!String(report.resourcesPath).startsWith(extractedRoot)) throw new Error(`Packaged resources resolved outside the extracted artifact: ${report.resourcesPath}`);
  await log(`Smoke report:\n${JSON.stringify(report, null, 2)}\nTapir packaged smoke test passed ${new Date().toISOString()}\n`);
  console.log("Packaged Tapir smoke test passed.");
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  await log(`SMOKE TEST FAILED\n${message}\n`);
  console.error(`${message}\nSmoke log: ${logPath}`);
  process.exitCode = 1;
} finally {
  fixture?.kill();
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
}

async function waitForFixture(url) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (fixture?.exitCode !== null) throw new Error(`Fixture exited before startup.\n${fixtureOutput}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until the bounded fixture startup deadline.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Fixture did not become ready at ${url}.`);
}

async function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a fixture port."));
        return;
      }
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

function log(value) {
  appendFileSync(logPath, value, "utf8");
}
