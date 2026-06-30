import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type {
  CallOperationRequest,
  InitialStateResponse,
  NormalizedApiDefinition,
  NormalizedOperation,
  PreparedRequest,
  SaveApiKeyHeaderRequest,
  TapirIpcChannel,
  TapirIpcRequest,
  TapirIpcResponse
} from "@tapir/core";
import { BasicOpenApiNormalizer, FetchOpenApiDiscoveryService } from "@tapir/openapi";
import {
  ensureDefaultWorkspace,
  openTapirDatabase,
  SqliteApiDefinitionRepository,
  SqliteAuthProfileRepository,
  SqliteHistoryRepository,
  SqliteServerRepository
} from "@tapir/storage";

const discovery = new FetchOpenApiDiscoveryService();
const normalizer = new BasicOpenApiNormalizer();

let services: Awaited<ReturnType<typeof createServices>>;

async function createServices() {
  const dataDir = join(app.getPath("userData"), "tapir-data");
  mkdirSync(dataDir, { recursive: true });
  const db = await openTapirDatabase(join(dataDir, "tapir.sqlite"));
  const workspace = ensureDefaultWorkspace(db);
  return {
    workspace,
    servers: new SqliteServerRepository(db),
    definitions: new SqliteApiDefinitionRepository(db),
    authProfiles: new SqliteAuthProfileRepository(db),
    history: new SqliteHistoryRepository(db)
  };
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "Tapir",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  return createServices();
}).then((createdServices) => {
  services = createdServices;
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function registerIpc(): void {
  handle("tapir:getInitialState", async (): Promise<InitialStateResponse> => {
    const servers = await services.servers.list(services.workspace.id);
    const enriched = await Promise.all(servers.map(async (server) => {
      const definition = await services.definitions.latestForServer(server.id);
      return { server, definition: definition ? JSON.parse(definition.normalizedJson) as NormalizedApiDefinition : null };
    }));
    return { workspace: services.workspace, servers: enriched };
  });

  handle("tapir:addServer", async (input) => {
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const discovered = await discovery.discover(baseUrl);
    const normalized = normalizer.normalize(discovered.document);
    const now = new Date().toISOString();
    const server = await services.servers.create({
      id: crypto.randomUUID(),
      workspaceId: services.workspace.id,
      name: normalized.name,
      baseUrl,
      specUrl: discovered.specUrl,
      apiDefinitionSourceId: null
    });
    const source = await services.definitions.createSource({
      id: crypto.randomUUID(),
      workspaceId: services.workspace.id,
      serverInstanceId: server.id,
      sourceUrl: discovered.specUrl,
      discoveryMethod: discovered.discoveryMethod,
      lastFetchedAt: now
    });
    await services.servers.updateDefinitionSource(server.id, source.id);
    const definition = await services.definitions.createDefinition({
      id: crypto.randomUUID(),
      sourceId: source.id,
      name: normalized.name,
      version: normalized.version,
      rawSpecJson: JSON.stringify(discovered.document),
      normalizedJson: JSON.stringify(normalized),
      fetchedAt: now
    });
    return { server: { ...server, apiDefinitionSourceId: source.id }, source, definition, normalized };
  });

  handle("tapir:saveApiKeyHeader", async (input: SaveApiKeyHeaderRequest) => {
    return services.authProfiles.upsertApiKeyHeader({
      workspaceId: services.workspace.id,
      serverInstanceId: input.serverId,
      name: input.headerName,
      headerName: input.headerName,
      secretValue: input.secretValue
    });
  });

  handle("tapir:callOperation", async (input: CallOperationRequest) => {
    const servers = await services.servers.list(services.workspace.id);
    const server = servers.find((candidate) => candidate.id === input.serverId);
    if (!server) throw new Error("Server not found.");

    const request = await prepareRequest(server.baseUrl, input);
    const response = await executeRequest(request);

    await services.history.create({
      workspaceId: services.workspace.id,
      serverInstanceId: server.id,
      operationId: input.operation.operationId,
      requestSnapshotJson: JSON.stringify({ ...request, headers: redactHeaders(request.headers, input.apiKeyHeaderName) }),
      responseStatus: response.status,
      responseHeadersJson: JSON.stringify(response.headers),
      responseBody: response.body,
      durationMs: response.durationMs
    });

    return { request: { ...request, headers: redactHeaders(request.headers, input.apiKeyHeaderName) }, response };
  });

  handle("tapir:listHistory", async (serverId) => {
    return services.history.listForServer(serverId);
  });
}

function handle<Channel extends TapirIpcChannel>(
  channel: Channel,
  handler: (request: TapirIpcRequest<Channel>) => Promise<TapirIpcResponse<Channel>>
): void {
  ipcMain.handle(channel, (_event, request: TapirIpcRequest<Channel>) => handler(request));
}

async function prepareRequest(baseUrl: string, input: {
  operation: NormalizedOperation;
  values: Record<string, string>;
  body?: string;
  apiKeyHeaderName?: string;
  apiKeyValue?: string;
}): Promise<PreparedRequest> {
  let path = input.operation.path;
  for (const parameter of input.operation.parameters.filter((parameter) => parameter.in === "path")) {
    path = path.replace(`{${parameter.name}}`, encodeURIComponent(input.values[parameter.name] ?? ""));
  }

  const url = new URL(path.replace(/^\//, ""), ensureTrailingSlash(baseUrl));
  for (const parameter of input.operation.parameters.filter((parameter) => parameter.in === "query")) {
    const value = input.values[parameter.name];
    if (value) url.searchParams.set(parameter.name, value);
  }

  const headers: Record<string, string> = {};
  for (const parameter of input.operation.parameters.filter((parameter) => parameter.in === "header")) {
    const value = input.values[parameter.name];
    if (value) headers[parameter.name] = value;
  }
  if (input.apiKeyHeaderName && input.apiKeyValue) {
    headers[input.apiKeyHeaderName] = input.apiKeyValue;
  }
  if (input.body && input.operation.method !== "GET") {
    headers["content-type"] = headers["content-type"] ?? "application/json";
  }

  return {
    method: input.operation.method,
    url: url.toString(),
    headers,
    body: input.operation.method === "GET" ? undefined : input.body
  };
}

async function executeRequest(request: PreparedRequest) {
  const started = performance.now();
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body
  });
  const body = await response.text();
  const headers = Object.fromEntries(response.headers.entries());
  return {
    status: response.status,
    headers,
    body,
    durationMs: Math.round(performance.now() - started)
  };
}

function normalizeBaseUrl(value: string): string {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function redactHeaders(headers: Record<string, string>, secretHeaderName?: string): Record<string, string> {
  if (!secretHeaderName || !(secretHeaderName in headers)) return headers;
  return { ...headers, [secretHeaderName]: "••••••••" };
}
