import type {
  AddServerRequest,
  AddServerResponse,
  CallOperationRequest,
  CallOperationResponse,
  InitialStateResponse,
  SaveApiKeyHeaderRequest
} from "./ipc";
import type {
  ApiDefinitionRepository,
  HistoryRepository,
  HttpExecutor,
  NormalizedApiDefinition,
  NormalizedOperation,
  OpenApiDiscoveryService,
  OpenApiNormalizer,
  PreparedRequest,
  ServerRepository,
  AuthProfileRepository,
  Workspace
} from "./index";

export interface TapirApplicationDependencies {
  workspace: Workspace;
  servers: ServerRepository;
  definitions: ApiDefinitionRepository;
  authProfiles: AuthProfileRepository;
  history: HistoryRepository;
  discovery: OpenApiDiscoveryService;
  normalizer: OpenApiNormalizer;
  http: HttpExecutor;
}

export class TapirApplicationService {
  constructor(private dependencies: TapirApplicationDependencies) {}

  async getInitialState(): Promise<InitialStateResponse> {
    const { definitions, servers, workspace } = this.dependencies;
    const serverInstances = await servers.list(workspace.id);
    const enriched = await Promise.all(serverInstances.map(async (server) => {
      const definition = await definitions.latestForServer(server.id);
      return { server, definition: definition ? JSON.parse(definition.normalizedJson) as NormalizedApiDefinition : null };
    }));
    return { workspace, servers: enriched };
  }

  async addServer(input: AddServerRequest): Promise<AddServerResponse> {
    const { definitions, discovery, normalizer, servers, workspace } = this.dependencies;
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const discovered = await discovery.discover(baseUrl);
    const normalized = normalizer.normalize(discovered.document);
    const now = new Date().toISOString();
    const server = await servers.create({
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      name: normalized.name,
      baseUrl,
      specUrl: discovered.specUrl,
      apiDefinitionSourceId: null
    });
    const source = await definitions.createSource({
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      serverInstanceId: server.id,
      sourceUrl: discovered.specUrl,
      discoveryMethod: discovered.discoveryMethod,
      lastFetchedAt: now
    });
    await servers.updateDefinitionSource(server.id, source.id);
    const definition = await definitions.createDefinition({
      id: crypto.randomUUID(),
      sourceId: source.id,
      name: normalized.name,
      version: normalized.version,
      rawSpecJson: JSON.stringify(discovered.document),
      normalizedJson: JSON.stringify(normalized),
      fetchedAt: now
    });
    return { server: { ...server, apiDefinitionSourceId: source.id }, source, definition, normalized };
  }

  async saveApiKeyHeader(input: SaveApiKeyHeaderRequest) {
    const { authProfiles, workspace } = this.dependencies;
    return authProfiles.upsertApiKeyHeader({
      workspaceId: workspace.id,
      serverInstanceId: input.serverId,
      name: input.headerName,
      headerName: input.headerName,
      secretValue: input.secretValue
    });
  }

  async callOperation(input: CallOperationRequest): Promise<CallOperationResponse> {
    const { history, http, servers, workspace } = this.dependencies;
    const serverInstances = await servers.list(workspace.id);
    const server = serverInstances.find((candidate) => candidate.id === input.serverId);
    if (!server) throw new Error("Server not found.");

    const request = prepareRequest(server.baseUrl, input);
    const response = await http.execute(request);
    const redactedHeaders = redactHeaders(request.headers, input.apiKeyHeaderName);

    await history.create({
      workspaceId: workspace.id,
      serverInstanceId: server.id,
      operationId: input.operation.operationId,
      requestSnapshotJson: JSON.stringify({ ...request, headers: redactedHeaders }),
      responseStatus: response.status,
      responseHeadersJson: JSON.stringify(response.headers),
      responseBody: response.body,
      durationMs: response.durationMs
    });

    return { request: { ...request, headers: redactedHeaders }, response };
  }

  async listHistory(serverId: string) {
    return this.dependencies.history.listForServer(serverId);
  }
}

function prepareRequest(baseUrl: string, input: {
  operation: NormalizedOperation;
  values: Record<string, string>;
  body?: string;
  apiKeyHeaderName?: string;
  apiKeyValue?: string;
}): PreparedRequest {
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
  return { ...headers, [secretHeaderName]: "********" };
}
