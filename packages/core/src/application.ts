import type {
  AddServerRequest,
  AddServerResponse,
  CallCustomRequestRequest,
  CallOperationRequest,
  CallOperationResponse,
  CreateRequestDraftRequest,
  InitialStateResponse,
  ListRequestDraftsRequest,
  PreviewCustomRequestRequest,
  PreviewOperationResponse,
  RefreshServerSchemaRequest,
  RefreshServerSchemaResponse,
  SaveApiKeyHeaderRequest,
  ServerAuthenticationConfiguration,
  SaveServerVariablesRequest,
  SaveServerVariablesResponse,
  UpdateRequestDraftRequest
} from "./ipc";
import type {
  ApiDefinitionRepository,
  HistoryRepository,
  HttpExecutor,
  NormalizedApiDefinition,
  NormalizedOperation,
  OpenApiDiscoveryService,
  OpenApiNormalizer,
  RequestDraft,
  RequestDraftRepository,
  RequestDraftParameter,
  ServerRepository,
  ServerVariableRepository,
  AuthProfileRepository,
  Workspace
} from "./index";
import { prepareCustomRequest, prepareOperationRequest } from "./requestPreparation.js";
import { normalizeServerBaseUrl } from "./urlNormalization.js";

export interface TapirApplicationDependencies {
  workspace: Workspace;
  servers: ServerRepository;
  serverVariables: ServerVariableRepository;
  definitions: ApiDefinitionRepository;
  authProfiles: AuthProfileRepository;
  history: HistoryRepository;
  requestDrafts: RequestDraftRepository;
  discovery: OpenApiDiscoveryService;
  normalizer: OpenApiNormalizer;
  http: HttpExecutor;
}

export class TapirApplicationService {
  constructor(private dependencies: TapirApplicationDependencies) {}

  async getInitialState(): Promise<InitialStateResponse> {
    const { authProfiles, definitions, servers, serverVariables, workspace } = this.dependencies;
    const serverInstances = await servers.list(workspace.id);
    const enriched = await Promise.all(serverInstances.map(async (server) => {
      const definition = await definitions.latestForServer(server.id);
      const variables = await serverVariables.listForServer(server.id);
      const auth = await authProfiles.getForServer(server.id);
      return {
        server,
        definition: definition ? JSON.parse(definition.normalizedJson) as NormalizedApiDefinition : null,
        variables,
        authentication: auth ? authenticationConfiguration(auth.profile.configJson) : null
      };
    }));
    return { workspace, servers: enriched };
  }

  async addServer(input: AddServerRequest): Promise<AddServerResponse> {
    const { definitions, discovery, normalizer, servers, workspace } = this.dependencies;
    const baseUrl = normalizeServerBaseUrl(input.baseUrl);
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
    await definitions.createDefinition({
      id: crypto.randomUUID(),
      sourceId: source.id,
      name: normalized.name,
      version: normalized.version,
      rawSpecJson: JSON.stringify(discovered.document),
      normalizedJson: JSON.stringify(normalized),
      fetchedAt: now
    });
    return { server: { ...server, apiDefinitionSourceId: source.id }, normalized };
  }

  async refreshServerSchema(input: RefreshServerSchemaRequest): Promise<RefreshServerSchemaResponse> {
    const { definitions, discovery, normalizer, requestDrafts, servers, workspace } = this.dependencies;
    const serverInstances = await servers.list(workspace.id);
    const server = serverInstances.find((candidate) => candidate.id === input.serverId);
    if (!server) throw new Error("Server not found.");

    const previousDefinition = await definitions.latestForServer(server.id);
    const previousNormalized = previousDefinition ? JSON.parse(previousDefinition.normalizedJson) as NormalizedApiDefinition : null;
    const discovered = await discovery.discover(server.baseUrl);
    const normalized = normalizer.normalize(discovered.document);
    const now = new Date().toISOString();
    const sourceId = crypto.randomUUID();

    await definitions.createSource({
      id: sourceId,
      workspaceId: workspace.id,
      serverInstanceId: server.id,
      sourceUrl: discovered.specUrl,
      discoveryMethod: discovered.discoveryMethod,
      lastFetchedAt: now
    });
    const refreshedServer = await servers.updateAfterDefinitionRefresh(server.id, {
      name: normalized.name,
      specUrl: discovered.specUrl,
      sourceId
    });
    await definitions.createDefinition({
      id: crypto.randomUUID(),
      sourceId,
      name: normalized.name,
      version: normalized.version,
      rawSpecJson: JSON.stringify(discovered.document),
      normalizedJson: JSON.stringify(normalized),
      fetchedAt: now
    });

    const deprecatedDrafts = previousNormalized
      ? await this.deprecateChangedOpenApiDrafts(server, previousNormalized, normalized, now)
      : [];
    return { server: refreshedServer, normalized, deprecatedDrafts };
  }

  async saveApiKeyHeader(input: SaveApiKeyHeaderRequest): Promise<ServerAuthenticationConfiguration> {
    const { authProfiles, workspace } = this.dependencies;
    await this.requireWorkspaceServer(input.serverId);
    const headerName = input.headerName.trim();
    if (!headerName) throw new Error("API key header name is required.");
    if (!input.secretValue) throw new Error("API key value is required.");
    const profile = await authProfiles.upsertApiKeyHeader({
      workspaceId: workspace.id,
      serverInstanceId: input.serverId,
      name: headerName,
      headerName,
      secretValue: input.secretValue
    });
    return authenticationConfiguration(profile.configJson);
  }

  async saveServerVariables(input: SaveServerVariablesRequest): Promise<SaveServerVariablesResponse> {
    const { serverVariables, servers, workspace } = this.dependencies;
    const serverInstances = await servers.list(workspace.id);
    if (!serverInstances.some((server) => server.id === input.serverId)) throw new Error("Server not found.");
    const variables = await serverVariables.replaceForServer({
      workspaceId: workspace.id,
      serverInstanceId: input.serverId,
      variables: input.variables
    });
    return { variables };
  }

  async callOperation(input: CallOperationRequest): Promise<CallOperationResponse> {
    const { history, http, servers, serverVariables, workspace } = this.dependencies;
    const serverInstances = await servers.list(workspace.id);
    const server = serverInstances.find((candidate) => candidate.id === input.serverId);
    if (!server) throw new Error("Server not found.");

    const variables = await serverVariables.listForServer(server.id);
    const prepared = prepareOperationRequest(server.baseUrl, { ...input, variables, ...await this.operationAuthentication(server.id, input.operation) });
    if (prepared.validationIssues.length > 0) {
      throw new Error(prepared.validationIssues.map((issue) => issue.message).join(" "));
    }
    const response = await http.execute(prepared.request);

    await history.create({
      workspaceId: workspace.id,
      serverInstanceId: server.id,
      operationId: input.operation.operationId,
      requestDraftId: input.requestDraftId ?? null,
      requestSnapshotJson: JSON.stringify(prepared.redactedRequest),
      responseStatus: response.status,
      responseHeadersJson: JSON.stringify(response.headers),
      responseBody: response.body,
      durationMs: response.durationMs
    });

    return { request: prepared.redactedRequest, response };
  }

  async previewOperation(input: CallOperationRequest): Promise<PreviewOperationResponse> {
    const { servers, serverVariables, workspace } = this.dependencies;
    const serverInstances = await servers.list(workspace.id);
    const server = serverInstances.find((candidate) => candidate.id === input.serverId);
    if (!server) throw new Error("Server not found.");
    const variables = await serverVariables.listForServer(server.id);
    const prepared = prepareOperationRequest(server.baseUrl, { ...input, variables, ...await this.operationAuthentication(server.id, input.operation) });
    return { ...prepared, request: prepared.redactedRequest };
  }

  async listHistory(serverId: string) {
    await this.requireWorkspaceServer(serverId);
    return this.dependencies.history.listForServer(serverId);
  }

  async listRequestDrafts(input: ListRequestDraftsRequest): Promise<RequestDraft[]> {
    if (input.workspaceId !== this.dependencies.workspace.id) throw new Error("Workspace not found.");
    return this.dependencies.requestDrafts.listForWorkspace(input.workspaceId);
  }

  async createRequestDraft(input: CreateRequestDraftRequest): Promise<RequestDraft> {
    const { requestDrafts, workspace } = this.dependencies;
    if (input.serverId) await this.requireWorkspaceServer(input.serverId);
    return requestDrafts.create({
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      serverInstanceId: input.serverId,
      sourceType: input.sourceType,
      operationId: input.operationId,
      deprecatedAt: null,
      deprecationReason: null,
      name: input.name,
      isNameManual: input.isNameManual ?? false,
      method: input.method,
      path: input.path ?? "",
      url: input.url ?? "",
      parametersJson: JSON.stringify(input.parameters ?? []),
      headersJson: JSON.stringify(input.headers ?? []),
      body: input.body ?? "",
      contentType: input.contentType ?? "application/json",
      sortOrder: input.sortOrder ?? Date.now()
    });
  }

  async updateRequestDraft(input: UpdateRequestDraftRequest): Promise<RequestDraft> {
    const existing = await this.requireWorkspaceDraft(input.draft.id);
    if (input.draft.serverInstanceId) await this.requireWorkspaceServer(input.draft.serverInstanceId);
    return this.dependencies.requestDrafts.update({
      ...input.draft,
      id: existing.id,
      workspaceId: this.dependencies.workspace.id
    });
  }

  async deleteRequestDraft(id: string): Promise<void> {
    await this.requireWorkspaceDraft(id);
    await this.dependencies.requestDrafts.delete(id);
  }

  async previewCustomRequest(input: PreviewCustomRequestRequest): Promise<PreviewOperationResponse> {
    return prepareCustomRequest({ ...input, variables: await this.variablesForOptionalServer(input.serverId) });
  }

  async callCustomRequest(input: CallCustomRequestRequest): Promise<CallOperationResponse> {
    const { history, http, workspace } = this.dependencies;
    const prepared = prepareCustomRequest({ ...input, variables: await this.variablesForOptionalServer(input.serverId) });
    if (prepared.validationIssues.length > 0) {
      throw new Error(prepared.validationIssues.map((issue) => issue.message).join(" "));
    }
    const response = await http.execute(prepared.request);
    if (input.serverId) {
      await history.create({
        workspaceId: workspace.id,
        serverInstanceId: input.serverId,
        operationId: null,
        requestDraftId: input.requestDraftId ?? null,
        requestSnapshotJson: JSON.stringify(prepared.redactedRequest),
        responseStatus: response.status,
        responseHeadersJson: JSON.stringify(response.headers),
        responseBody: response.body,
        durationMs: response.durationMs
      });
    }
    return { request: prepared.redactedRequest, response };
  }

  private async variablesForOptionalServer(serverId: string | null | undefined) {
    if (!serverId) return [];
    const { servers, serverVariables, workspace } = this.dependencies;
    const serverInstances = await servers.list(workspace.id);
    if (!serverInstances.some((server) => server.id === serverId)) throw new Error("Server not found.");
    return serverVariables.listForServer(serverId);
  }

  private async requireWorkspaceServer(serverId: string) {
    const { servers, workspace } = this.dependencies;
    const server = (await servers.list(workspace.id)).find((candidate) => candidate.id === serverId);
    if (!server) throw new Error("Server not found.");
    return server;
  }

  private async requireWorkspaceDraft(draftId: string): Promise<RequestDraft> {
    const { requestDrafts, workspace } = this.dependencies;
    const draft = (await requestDrafts.listForWorkspace(workspace.id)).find((candidate) => candidate.id === draftId);
    if (!draft) throw new Error("Request draft not found.");
    return draft;
  }

  private async operationAuthentication(serverId: string, operation: NormalizedOperation) {
    const supported = operation.securitySchemes.find((scheme) => scheme.type === "apiKey" && scheme.in === "header");
    const required = supported && operation.securityRequirements.some((requirement) => supported.key in requirement);
    if (!supported || !required) return {};
    const stored = await this.dependencies.authProfiles.getForServer(serverId);
    if (!stored) return {};
    const configuration = authenticationConfiguration(stored.profile.configJson);
    if (configuration.headerName.toLowerCase() !== supported.name?.toLowerCase()) return {};
    return { apiKeyHeaderName: configuration.headerName, apiKeyValue: stored.secret.encryptedOrPlainValue };
  }

  private async deprecateChangedOpenApiDrafts(
    server: { id: string; baseUrl: string },
    previous: NormalizedApiDefinition,
    next: NormalizedApiDefinition,
    now: string
  ): Promise<RequestDraft[]> {
    const drafts = await this.dependencies.requestDrafts.listForWorkspace(this.dependencies.workspace.id);
    const nextOperations = new Map(next.operations.map((operation) => [operation.operationId, operation]));
    const previousOperations = new Map(previous.operations.map((operation) => [operation.operationId, operation]));
    const deprecated: RequestDraft[] = [];

    for (const draft of drafts) {
      if (draft.serverInstanceId !== server.id || draft.sourceType !== "openapi" || !draft.operationId) continue;
      const previousOperation = previousOperations.get(draft.operationId);
      const nextOperation = nextOperations.get(draft.operationId);
      if (nextOperation && previousOperation && stableJson(previousOperation) === stableJson(nextOperation)) continue;

      const reason = nextOperation
        ? "The OpenAPI operation schema changed. This saved request was moved to Custom so its old inputs stay intact."
        : "The OpenAPI operation was removed. This saved request was moved to Custom so its old inputs stay intact.";
      const retired = await this.dependencies.requestDrafts.update({
        ...draft,
        sourceType: "custom",
        operationId: null,
        deprecatedAt: now,
        deprecationReason: reason,
        name: draft.isNameManual ? draft.name : `${draft.name} (deprecated)`,
        url: customUrlFromDraft(server.baseUrl, draft),
        parametersJson: JSON.stringify(customParametersFromDraft(draft))
      });
      deprecated.push(retired);
    }

    return deprecated;
  }
}

function authenticationConfiguration(configJson: string): ServerAuthenticationConfiguration {
  const parsed = JSON.parse(configJson) as { headerName?: unknown };
  if (typeof parsed.headerName !== "string" || !parsed.headerName.trim()) throw new Error("Saved API key header configuration is invalid.");
  return { type: "apiKeyHeader", headerName: parsed.headerName, configured: true };
}

function customUrlFromDraft(baseUrl: string, draft: RequestDraft): string {
  if (draft.url) return draft.url;
  let path = draft.path || "/";
  for (const parameter of parseDraftParameters(draft).filter((item) => item.in === "path")) {
    const token = `{${parameter.name}}`;
    path = path.replace(token, parameter.value ? encodeURIComponent(parameter.value) : token);
  }
  try {
    return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
  } catch {
    return `${baseUrl}${path}`;
  }
}

function customParametersFromDraft(draft: RequestDraft): RequestDraftParameter[] {
  return parseDraftParameters(draft)
    .filter((parameter) => parameter.in !== "path")
    .map((parameter) => ({ ...parameter, source: "custom" }));
}

function parseDraftParameters(draft: RequestDraft): RequestDraftParameter[] {
  try {
    const parsed = JSON.parse(draft.parametersJson) as unknown;
    return Array.isArray(parsed) ? parsed as RequestDraftParameter[] : [];
  } catch {
    return [];
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)])
  );
}
