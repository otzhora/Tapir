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
  SaveApiKeyHeaderRequest,
  UpdateRequestDraftRequest
} from "./ipc";
import type {
  ApiDefinitionRepository,
  HistoryRepository,
  HttpExecutor,
  NormalizedApiDefinition,
  OpenApiDiscoveryService,
  OpenApiNormalizer,
  RequestDraft,
  RequestDraftRepository,
  ServerRepository,
  AuthProfileRepository,
  Workspace
} from "./index";
import { prepareCustomRequest, prepareOperationRequest } from "./requestPreparation.js";
import { normalizeServerBaseUrl } from "./urlNormalization.js";

export interface TapirApplicationDependencies {
  workspace: Workspace;
  servers: ServerRepository;
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

    const prepared = prepareOperationRequest(server.baseUrl, input);
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
    const { servers, workspace } = this.dependencies;
    const serverInstances = await servers.list(workspace.id);
    const server = serverInstances.find((candidate) => candidate.id === input.serverId);
    if (!server) throw new Error("Server not found.");
    return prepareOperationRequest(server.baseUrl, input);
  }

  async listHistory(serverId: string) {
    return this.dependencies.history.listForServer(serverId);
  }

  async listRequestDrafts(input: ListRequestDraftsRequest): Promise<RequestDraft[]> {
    if (input.workspaceId !== this.dependencies.workspace.id) throw new Error("Workspace not found.");
    return this.dependencies.requestDrafts.listForWorkspace(input.workspaceId);
  }

  async createRequestDraft(input: CreateRequestDraftRequest): Promise<RequestDraft> {
    const { requestDrafts, workspace } = this.dependencies;
    return requestDrafts.create({
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      serverInstanceId: input.serverId,
      sourceType: input.sourceType,
      operationId: input.operationId,
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
    if (input.draft.workspaceId !== this.dependencies.workspace.id) throw new Error("Workspace not found.");
    return this.dependencies.requestDrafts.update(input.draft);
  }

  async deleteRequestDraft(id: string): Promise<void> {
    await this.dependencies.requestDrafts.delete(id);
  }

  async previewCustomRequest(input: PreviewCustomRequestRequest): Promise<PreviewOperationResponse> {
    return prepareCustomRequest(input);
  }

  async callCustomRequest(input: CallCustomRequestRequest): Promise<CallOperationResponse> {
    const { history, http, workspace } = this.dependencies;
    const prepared = prepareCustomRequest(input);
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
}
