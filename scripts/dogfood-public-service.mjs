import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TapirApplicationService } from "@tapir/core";
import { BasicOpenApiNormalizer, FetchOpenApiDiscoveryService } from "@tapir/openapi";
import { createLocalTapirStorage } from "@tapir/storage";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = join(root, "artifacts");
const reportPath = join(artifactsDir, "dogfood-public-service.json");
const tempDir = await mkdtemp(join(tmpdir(), "tapir-public-service-"));
const databasePath = join(tempDir, "tapir.sqlite");
const started = performance.now();
let storage;

try {
  storage = await createLocalTapirStorage(databasePath);
  let service = createService(storage);
  const added = await service.addServer({
    baseUrl: "https://api.github.com",
    specUrl: "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json"
  });
  const meta = added.normalized.operations.find((operation) => operation.method === "GET" && operation.path === "/meta");
  if (!meta) throw new Error("GitHub /meta operation was not normalized.");
  const call = await service.callOperation({ serverId: added.server.id, operationId: meta.operationId, values: {} });
  if (call.response.status !== 200) throw new Error(`GitHub /meta returned HTTP ${call.response.status}.`);

  const customCall = await service.callCustomRequest({
    serverId: null,
    method: "GET",
    url: "https://httpbin.org/status/418",
    parameters: [],
    headers: []
  });
  if (customCall.response.status !== 418) throw new Error(`httpbin status call returned HTTP ${customCall.response.status}.`);

  storage.db.close();
  storage = await createLocalTapirStorage(databasePath);
  service = createService(storage);
  const restarted = await service.getInitialState();
  const history = await service.listHistory({ workspaceId: restarted.workspace.id, limit: 10 });
  const restoredServer = restarted.servers.find((item) => item.server.id === added.server.id);
  if (restoredServer?.definition?.operations.length !== added.normalized.operations.length) {
    throw new Error("The persisted GitHub definition did not reload with the same operation count.");
  }
  if (history.entries.length !== 2 || !history.entries.some((entry) => entry.responseStatus === 200) || !history.entries.some((entry) => entry.responseStatus === 418)) {
    throw new Error(`Expected persisted 200 and 418 history entries, received ${history.entries.map((entry) => entry.responseStatus).join(", ")}.`);
  }

  const report = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    outcome: "passed",
    api: added.normalized.name,
    operations: added.normalized.operations.length,
    specUrl: added.server.specUrl,
    operationStatus: call.response.status,
    customStatus: customCall.response.status,
    historyEntriesAfterRestart: history.entries.length,
    databaseBytes: (await stat(databasePath)).size,
    durationMs: Math.round(performance.now() - started)
  };
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Public service dogfood passed: ${JSON.stringify(report)}`);
} finally {
  if (storage?.db.open) storage.db.close();
  await rm(tempDir, { recursive: true, force: true });
}

function createService(localStorage) {
  return new TapirApplicationService({
    ...localStorage,
    discovery: new FetchOpenApiDiscoveryService(),
    normalizer: new BasicOpenApiNormalizer(),
    http: { execute: executeRequest }
  });
}

async function executeRequest(request) {
  const requestStarted = performance.now();
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: "manual"
  });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
    durationMs: Math.round(performance.now() - requestStarted)
  };
}
