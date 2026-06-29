import { contextBridge, ipcRenderer } from "electron";
import type {
  CallOperationRequest,
  SaveApiKeyHeaderRequest,
  TapirIpcChannel,
  TapirIpcRequest,
  TapirIpcResponse
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
  callOperation: (input: CallOperationRequest) => invoke("tapir:callOperation", input),
  listHistory: (serverId: string) => invoke("tapir:listHistory", serverId)
};

contextBridge.exposeInMainWorld("tapir", api);

export type TapirBridge = typeof api;
