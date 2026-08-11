import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TapirApplicationService } from "@tapir/core";
import { BasicOpenApiNormalizer, FetchOpenApiDiscoveryService } from "@tapir/openapi";
import { createLocalTapirStorage } from "@tapir/storage";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = await availablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = await mkdtemp(join(tmpdir(), "tapir-auth-dogfood-"));
const databasePath = join(tempDir, "tapir.sqlite");
const child = spawn(process.execPath, ["server.js"], {
  cwd: join(root, "test-projects", "node-swagger-api"),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});
child.output = "";
child.stdout.on("data", (chunk) => { child.output += chunk.toString(); });
child.stderr.on("data", (chunk) => { child.output += chunk.toString(); });
let storage;

try {
  await waitFor(`${baseUrl}/health`);
  storage = await createLocalTapirStorage(databasePath);
  let service = createService(storage);
  const added = await service.addServer({ baseUrl, specUrl: `${baseUrl}/openapi.json` });
  const serverId = added.server.id;
  const credentials = [
    { schemeKey: "ApiKeyAuth", type: "apiKey", parameterName: "x-api-key", location: "header", secretValue: "tapir-node-secret" },
    { schemeKey: "BearerAuth", type: "bearer", secretValue: "tapir-node-token" },
    { schemeKey: "BasicAuth", type: "basic", username: "tapir", secretValue: "tapir-node-password" },
    { schemeKey: "QueryApiKeyAuth", type: "apiKey", parameterName: "api_key", location: "query", secretValue: "tapir-node-query-secret" },
    { schemeKey: "CookieApiKeyAuth", type: "apiKey", parameterName: "tapir_session", location: "cookie", secretValue: "tapir-node-session" }
  ];
  for (const credential of credentials) await service.saveAuthentication({ serverId, ...credential });

  const operationIds = [
    "getApiKeyIdentity", "getBearerIdentity", "getBasicIdentity", "getQueryApiKeyIdentity",
    "getCookieApiKeyIdentity", "getAlternativeIdentity", "getCombinedIdentity"
  ];
  for (const operationId of operationIds) await callAndAssert(service, serverId, operationId);

  storage.db.close();
  storage = await createLocalTapirStorage(databasePath);
  service = createService(storage);
  const restarted = await service.getInitialState();
  const restored = restarted.servers.find((item) => item.server.id === serverId);
  assert(restored?.authentication.length === credentials.length, `Expected ${credentials.length} persisted credentials after restart.`);
  const authenticationJson = JSON.stringify(restored.authentication);
  for (const secret of credentials.map((credential) => credential.secretValue)) {
    assert(!authenticationJson.includes(secret), `Initial authentication state exposed credential value ${secret}.`);
  }

  const authenticatedOptional = await callAndAssert(service, serverId, "getOptionalIdentity");
  assert(JSON.parse(authenticatedOptional.response.body).scheme === "bearer", "Configured optional auth did not send the bearer credential.");
  await service.deleteAuthentication({ serverId, schemeKey: "BearerAuth" });
  const anonymousOptional = await callAndAssert(service, serverId, "getOptionalIdentity");
  assert(JSON.parse(anonymousOptional.response.body).scheme === "anonymous", "Optional auth did not fall back to an anonymous request.");

  const history = await service.listHistory({ workspaceId: restarted.workspace.id, serverId, limit: 20 });
  assert(history.entries.length === operationIds.length + 2, "Not every authenticated request was persisted to history.");
  const historyJson = JSON.stringify(history);
  for (const secret of credentials.map((credential) => credential.secretValue)) {
    assert(!historyJson.includes(secret), `History exposed credential value ${secret}.`);
  }

  console.log(`Tapir authentication dogfood passed: ${operationIds.length + 2} calls, ${credentials.length} persisted profiles, secrets redacted.`);
} finally {
  if (storage?.db.open) storage.db.close();
  stop(child);
  await rm(tempDir, { recursive: true, force: true });
}

// Node's built-in fetch can retain an idle localhost connection on Windows after the fixture exits.
// All resources and temporary files are closed above, so end the successful dogfood process explicitly.
process.exit(0);

function createService(localStorage) {
  return new TapirApplicationService({
    ...localStorage,
    discovery: new FetchOpenApiDiscoveryService(),
    normalizer: new BasicOpenApiNormalizer(),
    http: { execute: executeRequest }
  });
}

async function callAndAssert(service, serverId, operationId) {
  const result = await service.callOperation({ serverId, operationId, values: {} });
  assert(result.response.status === 200, `${operationId} returned HTTP ${result.response.status}.`);
  const resultJson = JSON.stringify(result.request);
  assert(!resultJson.includes("tapir-node-secret"), `${operationId} exposed the header API key.`);
  assert(!resultJson.includes("tapir-node-token"), `${operationId} exposed the bearer token.`);
  assert(!resultJson.includes("tapir-node-password"), `${operationId} exposed the basic password.`);
  assert(!resultJson.includes("tapir-node-query-secret"), `${operationId} exposed the query API key.`);
  assert(!resultJson.includes("tapir-node-session"), `${operationId} exposed the cookie API key.`);
  return result;
}

async function executeRequest(request) {
  const started = performance.now();
  const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body, redirect: "manual" });
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: await response.text(), durationMs: Math.round(performance.now() - started) };
}

async function waitFor(url) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Node fixture exited before startup.\n${child.output}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}.\n${child.output}`);
}

function stop(processToStop) {
  if (processToStop.exitCode === null && processToStop.pid) {
    if (process.platform === "win32") spawnSync("taskkill.exe", ["/pid", String(processToStop.pid), "/t", "/f"], { stdio: "ignore" });
    else processToStop.kill("SIGTERM");
  }
  processToStop.stdout.destroy();
  processToStop.stderr.destroy();
}

function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => typeof address === "object" && address ? resolvePort(address.port) : reject(new Error("Could not allocate a fixture port.")));
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
