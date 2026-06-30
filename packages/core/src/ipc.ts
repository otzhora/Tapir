import type {
  CallHistoryEntry,
  NormalizedApiDefinition,
  NormalizedOperation,
  PreparedOperationRequest,
  ServerInstance,
  UserAuthProfile,
  Workspace
} from "./index";

export interface ServerWithDefinition {
  server: ServerInstance;
  definition: NormalizedApiDefinition | null;
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

export interface SaveApiKeyHeaderRequest {
  serverId: string;
  headerName: string;
  secretValue: string;
}

export interface CallOperationRequest {
  serverId: string;
  operation: NormalizedOperation;
  values: Record<string, string>;
  body?: string;
  contentType?: string;
  apiKeyHeaderName?: string;
  apiKeyValue?: string;
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

export interface TapirIpcContract {
  "tapir:getInitialState": {
    request: void;
    response: InitialStateResponse;
  };
  "tapir:addServer": {
    request: AddServerRequest;
    response: AddServerResponse;
  };
  "tapir:saveApiKeyHeader": {
    request: SaveApiKeyHeaderRequest;
    response: UserAuthProfile;
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
}

export type TapirIpcChannel = keyof TapirIpcContract;

export type TapirIpcRequest<Channel extends TapirIpcChannel> = TapirIpcContract[Channel]["request"];

export type TapirIpcResponse<Channel extends TapirIpcChannel> = TapirIpcContract[Channel]["response"];
