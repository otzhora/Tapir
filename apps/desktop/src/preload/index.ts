import { contextBridge, ipcRenderer } from "electron";
import type {
  CallOperationRequest,
  CallCustomRequestRequest,
  CreateRequestDraftRequest,
  PreviewCustomRequestRequest,
  SaveApiKeyHeaderRequest,
  TapirIpcChannel,
  TapirIpcRequest,
  TapirIpcResponse,
  UpdateRequestDraftRequest
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
  saveApiKeyHeader: (input: SaveApiKeyHeaderRequest) => invoke("tapir:saveApiKeyHeader", input),
  previewOperation: (input: CallOperationRequest) => invoke("tapir:previewOperation", input),
  callOperation: (input: CallOperationRequest) => invoke("tapir:callOperation", input),
  listHistory: (serverId: string) => invoke("tapir:listHistory", serverId),
  listRequestDrafts: (workspaceId: string) => invoke("tapir:listRequestDrafts", { workspaceId }),
  createRequestDraft: (input: CreateRequestDraftRequest) => invoke("tapir:createRequestDraft", input),
  updateRequestDraft: (input: UpdateRequestDraftRequest) => invoke("tapir:updateRequestDraft", input),
  deleteRequestDraft: (id: string) => invoke("tapir:deleteRequestDraft", id),
  previewCustomRequest: (input: PreviewCustomRequestRequest) => invoke("tapir:previewCustomRequest", input),
  callCustomRequest: (input: CallCustomRequestRequest) => invoke("tapir:callCustomRequest", input)
};

contextBridge.exposeInMainWorld("tapir", api);

export type TapirBridge = typeof api;
