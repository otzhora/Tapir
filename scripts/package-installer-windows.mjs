import { appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = join(root, "artifacts");
const installerDir = join(artifactsDir, "installer");
const logPath = join(artifactsDir, "package-installer-windows.log");
const releaseManifest = JSON.parse(await readFile(join(artifactsDir, "release-manifest.json"), "utf8"));
const version = releaseManifest.version;
const portableDir = join(artifactsDir, `Tapir-${version}-win32-x64`);

await mkdir(artifactsDir, { recursive: true });
await rm(installerDir, { recursive: true, force: true });
appendFileSync(logPath, `Tapir installer packaging started ${new Date().toISOString()}\n`, "utf8");

try {
  if (process.platform !== "win32") throw new Error("Tapir's Windows installer must be built on Windows.");
  const builder = join(root, "node_modules", "electron-builder", "out", "cli", "cli.js");
  const result = spawnSync(process.execPath, [
    builder,
    "--win",
    "nsis",
    "--x64",
    "--prepackaged",
    portableDir,
    "--config",
    join(root, "electron-builder.yml"),
    `--config.extraMetadata.version=${version}`
  ], { cwd: root, encoding: "utf8", shell: false, windowsHide: true });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  appendFileSync(logPath, output, "utf8");
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`electron-builder failed with exit code ${result.status ?? "unknown"}.`);
  const installerName = `Tapir-Setup-${version}-x64.exe`;
  const installerPath = join(installerDir, installerName);
  const blockmapName = `${installerName}.blockmap`;
  const metadataName = "latest.yml";
  const installerBytes = await readFile(installerPath);
  await readFile(join(installerDir, blockmapName));
  const updateMetadata = await readFile(join(installerDir, metadataName), "utf8");
  if (!updateMetadata.includes(`version: ${version}`) || !updateMetadata.includes(`url: ${installerName}`)) {
    throw new Error(`${metadataName} does not describe the expected ${installerName} release.`);
  }
  const installerSha256 = createHash("sha256").update(installerBytes).digest("hex");
  const manifestPath = join(artifactsDir, "release-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await writeFile(manifestPath, `${JSON.stringify({
    ...manifest,
    installer: installerName,
    installerSha256,
    updateMetadata: metadataName,
    installerBlockmap: blockmapName
  }, null, 2)}\n`, "utf8");
  appendFileSync(join(artifactsDir, "SHA256SUMS.txt"), `${installerSha256}  ${installerName}\n`, "utf8");
  appendFileSync(logPath, `Tapir installer packaging completed ${new Date().toISOString()}\n`, "utf8");
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  appendFileSync(logPath, `INSTALLER PACKAGING FAILED\n${message}\n`, "utf8");
  console.error(`${message}\nInstaller log: ${logPath}`);
  process.exitCode = 1;
}
