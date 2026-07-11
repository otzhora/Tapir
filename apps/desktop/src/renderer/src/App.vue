<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import { History as HistoryIcon, Server as ServerIcon } from "lucide-vue-next";
import type { CallHistoryEntry, NormalizedOperation, ServerWithDefinition } from "@tapir/core";
import AppHeader from "./components/AppHeader.vue";
import HistoryPanel from "./components/HistoryPanel.vue";
import RequestWorkspace from "./components/RequestWorkspace.vue";
import ResponsePanel from "./components/ResponsePanel.vue";
import ServersPanel from "./components/ServersPanel.vue";
import { CUSTOM_OPERATION_ID, useOperationRequest } from "./composables/useOperationRequest";
import { useResizablePanels } from "./composables/useResizablePanels";
import { useWorkspaceServers } from "./composables/useWorkspaceServers";
import { bridgeUnavailableMessage, getTapirBridge } from "./tapirBridge";
import { panelClass } from "./uiClasses";

const errorMessage = ref("");
const history = ref<CallHistoryEntry[]>([]);
const sidebarView = ref<"servers" | "history">("servers");

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
  workspace: workspaceServers.workspace,
  setErrorMessage: (message) => {
    errorMessage.value = message;
  }
});

onMounted(async () => {
  await workspaceServers.loadInitialState();
  await request.loadDrafts();
});

watch(workspaceServers.selectedServerId, async (serverId) => {
  workspaceServers.selectedOperationId.value = workspaceServers.operations.value[0]?.operationId ?? null;
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

async function selectOperation(operation: NormalizedOperation): Promise<void> {
  workspaceServers.selectOperation(operation);
  await nextTick();
  await request.ensureActiveSpaceHasDraft();
}

async function addOperationRequest(operation: NormalizedOperation): Promise<void> {
  workspaceServers.selectOperation(operation);
  await request.createOpenApiRequest(operation);
}

async function selectCustom(): Promise<void> {
  workspaceServers.selectedOperationId.value = CUSTOM_OPERATION_ID;
  await nextTick();
  await request.ensureActiveSpaceHasDraft();
}

async function addCustomRequest(): Promise<void> {
  workspaceServers.selectedOperationId.value = CUSTOM_OPERATION_ID;
  await request.createCustomRequest();
}

async function serverRefreshed(server: ServerWithDefinition, deprecatedDraftCount: number): Promise<void> {
  workspaceServers.updateServer(server);
  await request.loadDrafts();
  if (workspaceServers.selectedServerId.value !== server.server.id) return;
  const selectedOperationStillExists = workspaceServers.operations.value.some((operation) => operation.operationId === workspaceServers.selectedOperationId.value);
  if (!selectedOperationStillExists || deprecatedDraftCount > 0) {
    workspaceServers.selectedOperationId.value = deprecatedDraftCount > 0 ? CUSTOM_OPERATION_ID : workspaceServers.operations.value[0]?.operationId ?? CUSTOM_OPERATION_ID;
    await nextTick();
    await request.ensureActiveSpaceHasDraft();
  }
}

</script>

<template>
  <div class="flex h-screen min-w-0 flex-col overflow-hidden bg-[var(--tapir-bg)] text-[var(--tapir-text)]">
    <AppHeader
      :operations-count="workspaceServers.operations.value.length"
      :selected-server="workspaceServers.selectedServer.value"
      :servers-count="workspaceServers.servers.value.length"
      :workspace="workspaceServers.workspace.value"
    />

    <main :class="['app-shell grid min-h-0 flex-1 text-[var(--tapir-text)]', isResizingLayout ? 'is-dragging' : 'transition-[grid-template-columns] duration-300 ease-out']" :style="shellStyle">
      <aside :class="[panelClass, 'grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden']">
        <div class="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-[var(--tapir-border-control)] bg-[var(--tapir-bg-control)] p-1" aria-label="Sidebar view">
          <button class="chrome-button justify-center" :class="sidebarView === 'servers' && 'is-active'" type="button" @click="sidebarView = 'servers'">
            <ServerIcon :size="15" /> Servers
          </button>
          <button class="chrome-button justify-center" :class="sidebarView === 'history' && 'is-active'" type="button" @click="sidebarView = 'history'">
            <HistoryIcon :size="15" /> History
          </button>
        </div>
        <div class="min-h-0 overflow-x-hidden overflow-y-auto">
      <ServersPanel
        v-if="sidebarView === 'servers'"
        :grouped-operations="workspaceServers.groupedOperations.value"
        :operations-count="workspaceServers.operations.value.length"
        :selected-operation-id="workspaceServers.selectedOperationId.value"
        :selected-server-id="workspaceServers.selectedServerId.value"
        :selected-server="workspaceServers.selectedServer.value"
        :servers="workspaceServers.servers.value"
        :workspace="workspaceServers.workspace.value"
        @add-custom-request="addCustomRequest"
        @add-operation-request="addOperationRequest"
        @server-added="workspaceServers.addServer"
        @server-refreshed="serverRefreshed"
        @server-variables-saved="workspaceServers.updateServerVariables"
        @select-server="workspaceServers.selectedServerId.value = $event"
        @select-custom="selectCustom"
        @select-operation="selectOperation"
      />
      <HistoryPanel
        v-else
        :history="history"
        @restore-history="request.restoreHistory"
      />
        </div>
      </aside>

      <div class="resize-handle" title="Drag to resize sidebar" @mousedown="startColumnResize($event)"></div>

      <section :class="['grid min-w-0 overflow-hidden bg-[var(--tapir-bg-panel-soft)] backdrop-blur-xl', isResizingLayout ? 'is-dragging' : 'transition-[grid-template-rows] duration-300 ease-out']" :style="responseStyle">
        <RequestWorkspace
          :active-draft="request.activeDraft.value"
          :active-request-tab="request.activeRequestTab.value"
          :can-send="request.canSend.value"
          :curl-command="request.curlCommand.value"
          :draft-tabs="request.visibleDrafts.value"
          :headers="request.headers.value"
          :is-custom-space="request.isCustomSpace.value"
          :is-previewing="request.isPreviewing.value"
          :is-sending="request.isSending.value"
          :operation-url="request.operationUrl.value"
          :parameters="request.parameters.value"
          :pretty-request="request.prettyRequest.value"
          :request-body-schema="request.requestBodySchema.value"
          :request-preview="request.requestPreview.value"
          :request-tabs="request.requestTabs.value"
          :responses-schema="request.responsesSchema.value"
          :selected-content-types="request.selectedContentTypes.value"
          :selected-operation="workspaceServers.selectedOperation.value"
          :selected-server="workspaceServers.selectedServer.value"
          :validation-issues="request.validationIssues.value"
          @add-header="request.addHeader"
          @add-parameter="request.addParameter"
          @call-operation="request.callOperation"
          @close-draft="request.closeDraft"
          @copy-curl="request.copyCurl"
          @create-draft="request.isCustomSpace.value ? request.createCustomRequest() : workspaceServers.selectedOperation.value && request.createOpenApiRequest(workspaceServers.selectedOperation.value)"
          @remove-header="request.removeHeader"
          @remove-parameter="request.removeParameter"
          @select-draft="request.selectDraft"
          @set-parameter="request.setParameterValue"
          @toggle-header="request.toggleHeader"
          @toggle-parameter="request.toggleParameter"
          @update-active-request-tab="request.activeRequestTab.value = $event"
          @update-body-value="request.updateBodyValue"
          @update-content-type="request.updateContentType"
          @update-draft-name="request.updateDraftName"
          @update-header="request.updateHeader"
          @update-method="request.updateMethod"
          @update-parameter-name="request.updateParameterName"
          @update-url="request.updateUrl"
        />

        <div class="resize-handle horizontal" title="Drag to resize response" @mousedown="startResponseResize"></div>

        <ResponsePanel
          :collapsed="collapsedPanels.response"
          :pretty-body="request.prettyBody.value"
          :response-view="request.responseView.value"
          @collapse="collapsedPanels.response = $event"
        />
      </section>

    </main>
  </div>
</template>
