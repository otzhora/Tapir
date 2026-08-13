import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function resolveReleaseVersion() {
  const rootPackage = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const baseVersion = rootPackage.version;
  if (typeof baseVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(baseVersion)) {
    throw new Error(`The root package.json must contain a stable base version, received: ${String(baseVersion)}`);
  }

  const releaseDate = process.env.TAPIR_RELEASE_DATE;
  if (releaseDate === undefined || releaseDate === "") return baseVersion;
  if (!/^\d{8}$/.test(releaseDate)) {
    throw new Error(`TAPIR_RELEASE_DATE must use YYYYMMDD format, received: ${releaseDate}`);
  }
  return `${baseVersion}-${releaseDate}`;
}
