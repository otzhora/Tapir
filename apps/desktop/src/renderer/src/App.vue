<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { CallHistoryEntry } from "@tapir/core";
import AppHeader from "./components/AppHeader.vue";
import HistoryPanel from "./components/HistoryPanel.vue";
import OperationsPanel from "./components/OperationsPanel.vue";
import RequestWorkspace from "./components/RequestWorkspace.vue";
import ResponsePanel from "./components/ResponsePanel.vue";
import ServersPanel from "./components/ServersPanel.vue";
import { useOperationRequest } from "./composables/useOperationRequest";
import { useResizablePanels } from "./composables/useResizablePanels";
import { useWorkspaceServers } from "./composables/useWorkspaceServers";
import { bridgeUnavailableMessage, getTapirBridge } from "./tapirBridge";

const errorMessage = ref("");
const history = ref<CallHistoryEntry[]>([]);

const {
  collapsedPanels,
  isResizingLayout,
  responseStyle,
  shellStyle,
  startColumnResize,
  startResponseResize
} = useResizablePanels();

const workspaceServers = useWorkspaceServers((message) => {
  errorMessage.value = message;
});

const request = useOperationRequest({
  collapsedPanels,
  history,
  operations: workspaceServers.operations,
  selectedOperation: workspaceServers.selectedOperation,
  selectedOperationId: workspaceServers.selectedOperationId,
  selectedServer: workspaceServers.selectedServer,
  setErrorMessage: (message) => {
    errorMessage.value = message;
  }
});

onMounted(async () => {
  await workspaceServers.loadInitialState();
});

watch(workspaceServers.selectedServerId, async (serverId) => {
  workspaceServers.selectedOperationId.value = workspaceServers.operations.value[0]?.operationId ?? null;
  request.responseView.value = null;
  request.clearRequestInputs();
  if (!serverId) {
    history.value = [];
    return;
  }
  const tapir = getTapirBridge();
  if (!tapir) {
    errorMessage.value = bridgeUnavailableMessage;
    return;
  }
  history.value = await tapir.listHistory(serverId);
});

function togglePanel(panel: "servers" | "operations" | "history"): void {
  collapsedPanels[panel] = !collapsedPanels[panel];
}
</script>

<template>
  <div class="flex h-screen min-w-0 flex-col overflow-hidden bg-[#101316] text-[#d9e1df]">
    <AppHeader
      :collapsed-panels="collapsedPanels"
      :operations-count="workspaceServers.operations.value.length"
      :selected-server="workspaceServers.selectedServer.value"
      :servers-count="workspaceServers.servers.value.length"
      :workspace="workspaceServers.workspace.value"
      @toggle-panel="togglePanel"
    />

    <main :class="['app-shell grid min-h-0 flex-1 bg-[#101316] text-[#d9e1df]', isResizingLayout ? 'is-dragging' : 'transition-[grid-template-columns] duration-300 ease-out']" :style="shellStyle">
      <ServersPanel
        :collapsed="collapsedPanels.servers"
        :selected-server-id="workspaceServers.selectedServerId.value"
        :servers="workspaceServers.servers.value"
        :workspace="workspaceServers.workspace.value"
        @collapse="collapsedPanels.servers = $event"
        @server-added="workspaceServers.addServer"
        @select-server="workspaceServers.selectedServerId.value = $event"
      />

      <div class="resize-handle" title="Drag to resize servers" @mousedown="startColumnResize('servers', $event)"></div>

      <OperationsPanel
        :collapsed="collapsedPanels.operations"
        :grouped-operations="workspaceServers.groupedOperations.value"
        :operations-count="workspaceServers.operations.value.length"
        :selected-operation-id="workspaceServers.selectedOperationId.value"
        :selected-server="workspaceServers.selectedServer.value"
        @collapse="collapsedPanels.operations = $event"
        @select-operation="workspaceServers.selectOperation"
      />

      <div class="resize-handle" title="Drag to resize operations" @mousedown="startColumnResize('operations', $event)"></div>

      <section :class="['grid min-w-0 overflow-hidden bg-[#0f1317]', isResizingLayout ? 'is-dragging' : 'transition-[grid-template-rows] duration-300 ease-out']" :style="responseStyle">
        <RequestWorkspace
          :active-request-tab="request.activeRequestTab.value"
          :auth-header-name="request.authHeaderName.value"
          :auth-secret="request.authSecret.value"
          :body-value="request.bodyValue.value"
          :can-send="request.canSend.value"
          :content-type="request.contentType.value"
          :curl-command="request.curlCommand.value"
          :is-previewing="request.isPreviewing.value"
          :is-sending="request.isSending.value"
          :operation-url="request.operationUrl.value"
          :parameter-values="request.parameterValues"
          :pretty-request="request.prettyRequest.value"
          :request-body-schema="request.requestBodySchema.value"
          :request-preview="request.requestPreview.value"
          :request-tabs="request.requestTabs.value"
          :responses-schema="request.responsesSchema.value"
          :selected-content-types="request.selectedContentTypes.value"
          :selected-operation="workspaceServers.selectedOperation.value"
          :selected-server="workspaceServers.selectedServer.value"
          :validation-issues="request.validationIssues.value"
          @call-operation="request.callOperation"
          @copy-curl="request.copyCurl"
          @set-parameter="request.setParameterValue"
          @update-active-request-tab="request.activeRequestTab.value = $event"
          @update-auth-header-name="request.authHeaderName.value = $event"
          @update-auth-secret="request.authSecret.value = $event"
          @update-body-value="request.bodyValue.value = $event"
          @update-content-type="request.contentType.value = $event"
        />

        <div class="resize-handle horizontal" title="Drag to resize response" @mousedown="startResponseResize"></div>

        <ResponsePanel
          :collapsed="collapsedPanels.response"
          :pretty-body="request.prettyBody.value"
          :response-view="request.responseView.value"
          @collapse="collapsedPanels.response = $event"
        />
      </section>

      <div class="resize-handle" :class="collapsedPanels.history && 'is-hidden-edge'" title="Drag to resize history" @mousedown="startColumnResize('history', $event)"></div>

      <HistoryPanel
        :collapsed="collapsedPanels.history"
        :history="history"
        @collapse="collapsedPanels.history = $event"
        @restore-history="request.restoreHistory"
      />
    </main>
  </div>
</template>
