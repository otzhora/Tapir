import { contextBridge, ipcRenderer } from "electron";
import type {
  CallOperationRequest,
  CallCustomRequestRequest,
  CreateRequestDraftRequest,
  HistoryFilter,
  HistoryQuery,
  PreviewCustomRequestRequest,
  DeleteAuthenticationRequest,
  SaveAuthenticationRequest,
  SaveServerVariablesRequest,
  TapirIpcChannel,
  TapirIpcRequest,
  TapirIpcResponse,
  UpdateRequestDraftRequest,
  UpdateServerConfigurationRequest
} from "@tapir/core";

function invoke<Channel extends TapirIpcChannel>(
  channel: Channel,
  request: TapirIpcRequest<Channel>
): Promise<TapirIpcResponse<Channel>> {
  return ipcRenderer.invoke(channel, request) as Promise<TapirIpcResponse<Channel>>;
}

const api = {
  getInitialState: () => invoke("tapir:getInitialState", undefined),
  addServer: (baseUrl: string) => invoke("tapir:addServer", { baseUrl }),
  refreshServerSchema: (serverId: string) => invoke("tapir:refreshServerSchema", { serverId }),
  rediscoverServerSchema: (serverId: string) => invoke("tapir:rediscoverServerSchema", { serverId }),
  updateServerConfiguration: (input: UpdateServerConfigurationRequest) => invoke("tapir:updateServerConfiguration", input),
  deleteServer: (serverId: string) => invoke("tapir:deleteServer", serverId),
  saveAuthentication: (input: SaveAuthenticationRequest) => invoke("tapir:saveAuthentication", input),
  deleteAuthentication: (input: DeleteAuthenticationRequest) => invoke("tapir:deleteAuthentication", input),
  saveServerVariables: (input: SaveServerVariablesRequest) => invoke("tapir:saveServerVariables", input),
  previewOperation: (input: CallOperationRequest) => invoke("tapir:previewOperation", input),
  callOperation: (input: CallOperationRequest) => invoke("tapir:callOperation", input),
  listHistory: (input: HistoryQuery) => invoke("tapir:listHistory", input),
  deleteHistoryEntry: (workspaceId: string, id: string) => invoke("tapir:deleteHistoryEntry", { workspaceId, id }),
  clearHistory: (input: HistoryFilter) => invoke("tapir:clearHistory", input),
  listRequestDrafts: (workspaceId: string) => invoke("tapir:listRequestDrafts", { workspaceId }),
  createRequestDraft: (input: CreateRequestDraftRequest) => invoke("tapir:createRequestDraft", input),
  updateRequestDraft: (input: UpdateRequestDraftRequest) => invoke("tapir:updateRequestDraft", input),
  deleteRequestDraft: (id: string) => invoke("tapir:deleteRequestDraft", id),
  previewCustomRequest: (input: PreviewCustomRequestRequest) => invoke("tapir:previewCustomRequest", input),
  callCustomRequest: (input: CallCustomRequestRequest) => invoke("tapir:callCustomRequest", input)
};

contextBridge.exposeInMainWorld("tapir", api);

export type TapirBridge = typeof api;
