export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiDefinitionSource {
  id: string;
  workspaceId: string;
  serverInstanceId: string;
  sourceUrl: string;
  discoveryMethod: string;
  lastFetchedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServerInstance {
  id: string;
  workspaceId: string;
  name: string;
  baseUrl: string;
  specUrl: string;
  apiDefinitionSourceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServerVariable {
  id: string;
  workspaceId: string;
  serverInstanceId: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export interface NormalizedParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  description?: string;
  style?: "matrix" | "label" | "form" | "simple" | "spaceDelimited" | "pipeDelimited" | "deepObject";
  explode?: boolean;
  allowReserved?: boolean;
  schema?: unknown;
}

export interface NormalizedRequestBodyMediaType {
  mediaType: string;
  schema?: unknown;
}

export interface NormalizedSecurityScheme {
  key: string;
  type: string;
  name?: string;
  in?: "query" | "header" | "cookie";
  scheme?: string;
  bearerFormat?: string;
  description?: string;
}

export interface NormalizedOperation {
  operationId: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: NormalizedParameter[];
  requestBodySchema?: unknown;
  requestBodyMediaTypes: NormalizedRequestBodyMediaType[];
  responses?: unknown;
  securityRequirements: Array<Record<string, string[]>>;
  securitySchemes: NormalizedSecurityScheme[];
}

export interface NormalizedApiDefinition {
  name: string;
  version: string;
  servers: string[];
  operations: NormalizedOperation[];
}

export interface ApiDefinition {
  id: string;
  sourceId: string;
  name: string;
  version: string;
  rawSpecJson: string;
  normalizedJson: string;
  fetchedAt: string;
}

export interface UserAuthProfile {
  id: string;
  workspaceId: string;
  serverInstanceId: string | null;
  name: string;
  type: "apiKeyHeader" | "apiKey" | "bearer" | "basic";
  configJson: string;
  secretRef: string;
  createdAt: string;
  updatedAt: string;
}

export interface SecretValue {
  id: string;
  authProfileId: string;
  encryptedOrPlainValue: string;
  createdAt: string;
  updatedAt: string;
}

export interface PreparedRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface PreparedRequestValidationIssue {
  field: string;
  message: string;
}

export interface PreparedOperationRequest {
  request: PreparedRequest;
  redactedRequest: PreparedRequest;
  validationIssues: PreparedRequestValidationIssue[];
}

export type RequestDraftSourceType = "openapi" | "custom";

export interface RequestDraftParameter {
  id: string;
  name: string;
  in: "path" | "query" | "header" | "cookie";
  value: string;
  enabled: boolean;
  required?: boolean;
  description?: string;
  source: "openapi" | "custom";
}

export interface RequestDraftHeader {
  id: string;
  name: string;
  value: string;
  enabled: boolean;
}

export interface RequestDraft {
  id: string;
  workspaceId: string;
  serverInstanceId: string | null;
  sourceType: RequestDraftSourceType;
  operationId: string | null;
  deprecatedAt: string | null;
  deprecationReason: string | null;
  name: string;
  isNameManual: boolean;
  method: HttpMethod;
  path: string;
  url: string;
  parametersJson: string;
  headersJson: string;
  body: string;
  contentType: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface HttpResponseSnapshot {
  status: number;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
}

export interface CallHistoryEntry {
  id: string;
  workspaceId: string;
  serverInstanceId: string;
  operationId: string | null;
  requestDraftId: string | null;
  requestSnapshotJson: string;
  responseStatus: number | null;
  responseHeadersJson: string | null;
  responseBody: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface ServerRepository {
  create(input: Omit<ServerInstance, "createdAt" | "updatedAt">): Promise<ServerInstance>;
  list(workspaceId: string): Promise<ServerInstance[]>;
  updateAfterDefinitionRefresh(serverId: string, input: { name: string; specUrl: string; sourceId: string }): Promise<ServerInstance>;
  updateDefinitionSource(serverId: string, sourceId: string): Promise<void>;
  updateConfiguration(serverId: string, input: { name: string; baseUrl: string; specUrl: string }): Promise<ServerInstance>;
  delete(serverId: string, options: { detachCustomDrafts: boolean }): Promise<void>;
}

export interface ServerVariableRepository {
  listForServer(serverInstanceId: string): Promise<ServerVariable[]>;
  replaceForServer(input: {
    workspaceId: string;
    serverInstanceId: string;
    variables: Array<{ id?: string; key: string; value: string }>;
  }): Promise<ServerVariable[]>;
}

export interface ApiDefinitionRepository {
  createSource(input: Omit<ApiDefinitionSource, "createdAt" | "updatedAt">): Promise<ApiDefinitionSource>;
  createDefinition(input: ApiDefinition): Promise<ApiDefinition>;
  latestForServer(serverId: string): Promise<ApiDefinition | null>;
}

export interface AuthProfileRepository {
  upsert(input: {
    workspaceId: string;
    serverInstanceId: string;
    schemeKey: string;
    type: "apiKey" | "bearer" | "basic";
    name: string;
    parameterName?: string;
    location?: "query" | "header" | "cookie";
    username?: string;
    secretValue: string;
  }): Promise<UserAuthProfile>;
  listForServer(serverInstanceId: string): Promise<Array<{ profile: UserAuthProfile; secret: SecretValue }>>;
  delete(serverInstanceId: string, schemeKey: string): Promise<void>;
}

export interface HistoryRepository {
  create(input: Omit<CallHistoryEntry, "id" | "createdAt">): Promise<CallHistoryEntry>;
  listForServer(serverInstanceId: string): Promise<CallHistoryEntry[]>;
}

export interface RequestDraftRepository {
  create(input: Omit<RequestDraft, "createdAt" | "updatedAt">): Promise<RequestDraft>;
  update(input: RequestDraft): Promise<RequestDraft>;
  delete(id: string): Promise<void>;
  listForWorkspace(workspaceId: string): Promise<RequestDraft[]>;
}

export interface HttpExecutor {
  execute(request: PreparedRequest): Promise<HttpResponseSnapshot>;
}

export interface DiscoveryResult {
  specUrl: string;
  discoveryMethod: string;
  document: unknown;
}

export interface OpenApiDiscoveryService {
  discover(baseUrl: string): Promise<DiscoveryResult>;
  fetch(specUrl: string): Promise<DiscoveryResult>;
}

export interface OpenApiNormalizer {
  normalize(document: unknown): NormalizedApiDefinition;
}

export * from "./ipc.js";
export * from "./application.js";
export * from "./requestPreparation.js";
export * from "./urlNormalization.js";
export * from "./variables.js";
