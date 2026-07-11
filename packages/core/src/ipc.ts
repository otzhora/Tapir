import type {
  CallHistoryEntry,
  HttpMethod,
  NormalizedApiDefinition,
  NormalizedOperation,
  PreparedOperationRequest,
  RequestDraft,
  RequestDraftHeader,
  RequestDraftParameter,
  ServerInstance,
  ServerVariable,
  Workspace
} from "./index";

export interface ServerWithDefinition {
  server: ServerInstance;
  definition: NormalizedApiDefinition | null;
  variables: ServerVariable[];
  authentication: ServerAuthenticationConfiguration | null;
}

export interface ServerAuthenticationConfiguration {
  type: "apiKeyHeader";
  headerName: string;
  configured: true;
}

export interface InitialStateResponse {
  workspace: Workspace;
  servers: ServerWithDefinition[];
}

export interface AddServerRequest {
  baseUrl: string;
}

export interface AddServerResponse {
  server: ServerInstance;
  normalized: NormalizedApiDefinition;
}

export interface RefreshServerSchemaRequest {
  serverId: string;
}

export interface RefreshServerSchemaResponse {
  server: ServerInstance;
  normalized: NormalizedApiDefinition;
  deprecatedDrafts: RequestDraft[];
}

export interface SaveApiKeyHeaderRequest {
  serverId: string;
  headerName: string;
  secretValue: string;
}

export interface SaveServerVariablesRequest {
  serverId: string;
  variables: Array<{ id?: string; key: string; value: string }>;
}

export interface SaveServerVariablesResponse {
  variables: ServerVariable[];
}

export interface CallOperationRequest {
  serverId: string;
  requestDraftId?: string;
  operation: NormalizedOperation;
  values: Record<string, string>;
  body?: string;
  contentType?: string;
}

export interface CallOperationResponse {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  };
  response: {
    status: number;
    headers: Record<string, string>;
    body: string;
    durationMs: number;
  };
}

export interface PreviewOperationRequest extends CallOperationRequest {}

export interface PreviewOperationResponse extends PreparedOperationRequest {}

export interface CreateRequestDraftRequest {
  serverId: string | null;
  sourceType: RequestDraft["sourceType"];
  operationId: string | null;
  name: string;
  isNameManual?: boolean;
  method: HttpMethod;
  path?: string;
  url?: string;
  parameters?: RequestDraftParameter[];
  headers?: RequestDraftHeader[];
  body?: string;
  contentType?: string;
  sortOrder?: number;
}

export interface UpdateRequestDraftRequest {
  draft: RequestDraft;
}

export interface ListRequestDraftsRequest {
  workspaceId: string;
}

export interface PreviewCustomRequestRequest {
  method: HttpMethod;
  serverId?: string | null;
  url: string;
  parameters: RequestDraftParameter[];
  headers: RequestDraftHeader[];
  body?: string;
  contentType?: string;
}

export interface CallCustomRequestRequest extends PreviewCustomRequestRequest {
  serverId: string | null;
  requestDraftId?: string;
}

export interface TapirIpcContract {
  "tapir:getInitialState": {
    request: void;
    response: InitialStateResponse;
  };
  "tapir:addServer": {
    request: AddServerRequest;
    response: AddServerResponse;
  };
  "tapir:refreshServerSchema": {
    request: RefreshServerSchemaRequest;
    response: RefreshServerSchemaResponse;
  };
  "tapir:saveApiKeyHeader": {
    request: SaveApiKeyHeaderRequest;
    response: ServerAuthenticationConfiguration;
  };
  "tapir:saveServerVariables": {
    request: SaveServerVariablesRequest;
    response: SaveServerVariablesResponse;
  };
  "tapir:callOperation": {
    request: CallOperationRequest;
    response: CallOperationResponse;
  };
  "tapir:previewOperation": {
    request: PreviewOperationRequest;
    response: PreviewOperationResponse;
  };
  "tapir:listHistory": {
    request: string;
    response: CallHistoryEntry[];
  };
  "tapir:listRequestDrafts": {
    request: ListRequestDraftsRequest;
    response: RequestDraft[];
  };
  "tapir:createRequestDraft": {
    request: CreateRequestDraftRequest;
    response: RequestDraft;
  };
  "tapir:updateRequestDraft": {
    request: UpdateRequestDraftRequest;
    response: RequestDraft;
  };
  "tapir:deleteRequestDraft": {
    request: string;
    response: void;
  };
  "tapir:previewCustomRequest": {
    request: PreviewCustomRequestRequest;
    response: PreviewOperationResponse;
  };
  "tapir:callCustomRequest": {
    request: CallCustomRequestRequest;
    response: CallOperationResponse;
  };
}

export type TapirIpcChannel = keyof TapirIpcContract;

export type TapirIpcRequest<Channel extends TapirIpcChannel> = TapirIpcContract[Channel]["request"];

export type TapirIpcResponse<Channel extends TapirIpcChannel> = TapirIpcContract[Channel]["response"];
