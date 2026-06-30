import type {
  ApiDefinition,
  ApiDefinitionSource,
  CallHistoryEntry,
  CallOperationRequest,
  CallOperationResponse,
  InitialStateResponse,
  NormalizedApiDefinition,
  NormalizedOperation,
  PreparedRequest,
  ServerInstance,
  UserAuthProfile,
  Workspace
} from "@tapir/core";
import { BasicOpenApiNormalizer, FetchOpenApiDiscoveryService } from "@tapir/openapi";
import type { TapirBridge } from "../../preload";

const storageKey = "tapir.browser-dev-state";
const workspaceId = "browser-dev-workspace";
const discovery = new FetchOpenApiDiscoveryService();
const normalizer = new BasicOpenApiNormalizer();

interface BrowserDevState {
  workspace: Workspace;
  servers: Array<{
    server: ServerInstance;
    definition: NormalizedApiDefinition;
  }>;
  history: Record<string, CallHistoryEntry[]>;
}

export function getTapirBridge(): TapirBridge | null {
  if (window.tapir) return window.tapir;
  if (import.meta.env.DEV) return browserDevBridge;
  return null;
}

export const bridgeUnavailableMessage = "Tapir's desktop bridge is unavailable. Run Tapir with npm run dev and use the Electron window it opens.";

const browserDevBridge: TapirBridge = {
  async getInitialState() {
    const state = readState();
    return {
      workspace: state.workspace,
      servers: state.servers
    };
  },

  async addServer(baseUrl: string) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const discovered = await discovery.discover(normalizedBaseUrl);
    const normalized = normalizer.normalize(discovered.document);
    const now = new Date().toISOString();
    const server: ServerInstance = {
      id: crypto.randomUUID(),
      workspaceId,
      name: normalized.name,
      baseUrl: normalizedBaseUrl,
      specUrl: discovered.specUrl,
      apiDefinitionSourceId: null,
      createdAt: now,
      updatedAt: now
    };
    const source: ApiDefinitionSource = {
      id: crypto.randomUUID(),
      workspaceId,
      serverInstanceId: server.id,
      sourceUrl: discovered.specUrl,
      discoveryMethod: discovered.discoveryMethod,
      lastFetchedAt: now,
      createdAt: now,
      updatedAt: now
    };
    const definition: ApiDefinition = {
      id: crypto.randomUUID(),
      sourceId: source.id,
      name: normalized.name,
      version: normalized.version,
      rawSpecJson: JSON.stringify(discovered.document),
      normalizedJson: JSON.stringify(normalized),
      fetchedAt: now
    };

    const serverWithSource = { ...server, apiDefinitionSourceId: source.id };
    const state = readState();
    state.servers = [{ server: serverWithSource, definition: normalized }, ...state.servers];
    writeState(state);

    return { server: serverWithSource, source, definition, normalized };
  },

  async saveApiKeyHeader(input) {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      workspaceId,
      serverInstanceId: input.serverId,
      name: input.headerName,
      type: "apiKeyHeader",
      configJson: JSON.stringify({ headerName: input.headerName }),
      secretRef: "browser-dev-memory",
      createdAt: now,
      updatedAt: now
    } satisfies UserAuthProfile;
  },

  async callOperation(input) {
    const state = readState();
    const server = state.servers.find((item) => item.server.id === input.serverId)?.server;
    if (!server) throw new Error("Server not found.");

    const request = prepareRequest(server.baseUrl, input);
    const response = await executeRequest(request);
    const entry = {
      id: crypto.randomUUID(),
      workspaceId,
      serverInstanceId: server.id,
      operationId: input.operation.operationId,
      requestSnapshotJson: JSON.stringify({ ...request, headers: redactHeaders(request.headers, input.apiKeyHeaderName) }),
      responseStatus: response.response.status,
      responseHeadersJson: JSON.stringify(response.response.headers),
      responseBody: response.response.body,
      durationMs: response.response.durationMs,
      createdAt: new Date().toISOString()
    };

    state.history[server.id] = [entry, ...(state.history[server.id] ?? [])].slice(0, 50);
    writeState(state);

    return response;
  },

  async listHistory(serverId: string) {
    return readState().history[serverId] ?? [];
  }
};

function readState(): BrowserDevState {
  const fallback: BrowserDevState = {
    workspace: {
      id: workspaceId,
      name: "Browser Dev Workspace",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    servers: [],
    history: {}
  };
  const raw = localStorage.getItem(storageKey);
  if (!raw) return fallback;

  try {
    return { ...fallback, ...JSON.parse(raw) } as BrowserDevState;
  } catch {
    return fallback;
  }
}

function writeState(state: BrowserDevState): void {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function normalizeBaseUrl(value: string): string {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function prepareRequest(baseUrl: string, input: CallOperationRequest): PreparedRequest {
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

async function executeRequest(request: PreparedRequest): Promise<CallOperationResponse> {
  const started = performance.now();
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body
  });
  const body = await response.text();
  const headers = Object.fromEntries(response.headers.entries());
  return {
    request,
    response: {
      status: response.status,
      headers,
      body,
      durationMs: Math.round(performance.now() - started)
    }
  };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function redactHeaders(headers: Record<string, string>, secretHeaderName?: string): Record<string, string> {
  if (!secretHeaderName || !(secretHeaderName in headers)) return headers;
  return { ...headers, [secretHeaderName]: "********" };
}
