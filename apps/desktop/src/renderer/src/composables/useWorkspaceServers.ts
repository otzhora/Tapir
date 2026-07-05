import { computed, ref } from "vue";
import type { NormalizedOperation, ServerWithDefinition, Workspace } from "@tapir/core";
import { bridgeUnavailableMessage, getTapirBridge as getAvailableTapirBridge } from "../tapirBridge";

export function useWorkspaceServers(setErrorMessage: (message: string) => void) {
  const workspace = ref<Workspace | null>(null);
  const servers = ref<ServerWithDefinition[]>([]);
  const selectedServerId = ref<string | null>(null);
  const selectedOperationId = ref<string | null>(null);

  const selectedServer = computed(() => servers.value.find((item) => item.server.id === selectedServerId.value) ?? null);
  const operations = computed(() => selectedServer.value?.definition?.operations ?? []);
  const selectedOperation = computed(() => operations.value.find((operation) => operation.operationId === selectedOperationId.value) ?? null);

  const groupedOperations = computed(() => {
    const groups = new Map<string, NormalizedOperation[]>();
    for (const operation of operations.value) {
      const groupName = operation.tags[0] ?? operation.path.split("/").filter(Boolean)[0] ?? "General";
      groups.set(groupName, [...(groups.get(groupName) ?? []), operation]);
    }
    return Array.from(groups, ([name, items]) => ({ name, items }));
  });

  async function loadInitialState(): Promise<void> {
    const tapir = getTapirBridge();
    if (!tapir) return;
    const state = await tapir.getInitialState();
    workspace.value = state.workspace;
    servers.value = state.servers;
    selectedServerId.value = servers.value[0]?.server.id ?? null;
  }

  function addServer(server: ServerWithDefinition): void {
    servers.value = [server, ...servers.value];
  }

  function updateServer(server: ServerWithDefinition): void {
    servers.value = servers.value.map((item) => item.server.id === server.server.id ? server : item);
  }

  function selectOperation(operation: NormalizedOperation): void {
    selectedOperationId.value = operation.operationId;
  }

  function getTapirBridge() {
    const tapir = getAvailableTapirBridge();
    if (!tapir) setErrorMessage(bridgeUnavailableMessage);
    return tapir;
  }

  return {
    addServer,
    groupedOperations,
    loadInitialState,
    operations,
    selectOperation,
    selectedOperation,
    selectedOperationId,
    selectedServer,
    selectedServerId,
    servers,
    updateServer,
    workspace
  };
}
