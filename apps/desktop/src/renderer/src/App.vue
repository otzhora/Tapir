<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import { History as HistoryIcon, Server as ServerIcon } from "lucide-vue-next";
import type { CallHistoryEntry, HistoryFilter, NormalizedOperation, SaveAuthenticationRequest, ServerWithDefinition } from "@tapir/core";
import AppHeader from "./components/AppHeader.vue";
import HistoryPanel from "./components/HistoryPanel.vue";
import RequestWorkspace from "./components/RequestWorkspace.vue";
import ResponsePanel from "./components/ResponsePanel.vue";
import ServerConfiguration from "./components/ServerConfiguration.vue";
import ServersPanel from "./components/ServersPanel.vue";
import CurlImportDialog from "./components/CurlImportDialog.vue";
import type { CurlImportDraft } from "./curlImport";
import { CUSTOM_OPERATION_ID, useOperationRequest } from "./composables/useOperationRequest";
import { useResizablePanels } from "./composables/useResizablePanels";
import { useWorkspaceServers } from "./composables/useWorkspaceServers";
import { getTapirBridge } from "./tapirBridge";
import { panelClass } from "./uiClasses";

const errorMessage = ref("");
const history = ref<CallHistoryEntry[]>([]);
const historyCursor = ref<string | null>(null);
const historyFilter = ref<Omit<HistoryFilter, "workspaceId">>({});
const isLoadingHistory = ref(false);
const sidebarView = ref<"servers" | "history">("servers");
const workspaceView = ref<"requests" | "serverConfiguration">("requests");
const isCurlImportOpen = ref(false);
const curlImportError = ref("");
const isCurlImporting = ref(false);

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
  operations: workspaceServers.operations,
  selectedOperation: workspaceServers.selectedOperation,
  selectedOperationId: workspaceServers.selectedOperationId,
  selectedServer: workspaceServers.selectedServer,
  selectedServerId: workspaceServers.selectedServerId,
  workspace: workspaceServers.workspace,
  reloadHistory: () => loadHistory(true),
  setErrorMessage: (message) => {
    errorMessage.value = message;
  }
});

onMounted(async () => {
  await workspaceServers.loadInitialState();
  await request.loadDrafts();
  await loadHistory(true);
});

watch(workspaceServers.selectedServerId, () => {
  if (workspaceServers.selectedOperationId.value !== CUSTOM_OPERATION_ID) {
    workspaceServers.selectedOperationId.value = workspaceServers.operations.value[0]?.operationId ?? null;
  }
});

async function loadHistory(reset: boolean): Promise<void> {
  const tapir = getTapirBridge();
  const workspaceId = workspaceServers.workspace.value?.id;
  if (!tapir || !workspaceId || isLoadingHistory.value) return;
  isLoadingHistory.value = true;
  try {
    const page = await tapir.listHistory({ ...historyFilter.value, workspaceId, cursor: reset ? undefined : historyCursor.value ?? undefined, limit: 50 });
    history.value = reset ? page.entries : [...history.value, ...page.entries];
    historyCursor.value = page.nextCursor;
  } finally {
    isLoadingHistory.value = false;
  }
}

async function filterHistory(filter: Omit<HistoryFilter, "workspaceId">): Promise<void> {
  historyFilter.value = filter;
  await loadHistory(true);
}

async function deleteHistoryEntry(id: string): Promise<void> {
  const tapir = getTapirBridge();
  const workspaceId = workspaceServers.workspace.value?.id;
  if (!tapir || !workspaceId) return;
  await tapir.deleteHistoryEntry(workspaceId, id);
  history.value = history.value.filter((entry) => entry.id !== id);
}

async function clearHistory(): Promise<void> {
  const tapir = getTapirBridge();
  const workspaceId = workspaceServers.workspace.value?.id;
  if (!tapir || !workspaceId) return;
  await tapir.clearHistory({ ...historyFilter.value, workspaceId });
  await loadHistory(true);
}

async function selectOperation(operation: NormalizedOperation): Promise<void> {
  workspaceView.value = "requests";
  workspaceServers.selectOperation(operation);
  await nextTick();
  await request.ensureActiveSpaceHasDraft();
}

async function addOperationRequest(operation: NormalizedOperation): Promise<void> {
  workspaceView.value = "requests";
  workspaceServers.selectOperation(operation);
  await request.createOpenApiRequest(operation);
}

async function selectCustom(): Promise<void> {
  workspaceView.value = "requests";
  workspaceServers.selectedOperationId.value = CUSTOM_OPERATION_ID;
  await nextTick();
  await request.ensureActiveSpaceHasDraft();
}

async function addCustomRequest(): Promise<void> {
  workspaceView.value = "requests";
  workspaceServers.selectedOperationId.value = CUSTOM_OPERATION_ID;
  await request.createCustomRequest();
}

async function selectSandbox(): Promise<void> {
  workspaceView.value = "requests";
  workspaceServers.selectedServerId.value = null;
  workspaceServers.selectedOperationId.value = CUSTOM_OPERATION_ID;
  await nextTick();
  await request.ensureActiveSpaceHasDraft();
}

async function addSandboxRequest(): Promise<void> {
  workspaceView.value = "requests";
  workspaceServers.selectedServerId.value = null;
  workspaceServers.selectedOperationId.value = CUSTOM_OPERATION_ID;
  await request.createCustomRequest(null, "");
}

async function importCurl(draft: CurlImportDraft): Promise<void> {
  if (isCurlImporting.value) return;
  isCurlImporting.value = true;
  curlImportError.value = "";
  try {
    let serverId = draft.serverId;
    if (draft.createServerBaseUrl) {
      const tapir = window.tapir;
      if (!tapir) throw new Error("Tapir's desktop bridge is unavailable.");
      const result = await tapir.addServer(draft.createServerBaseUrl);
      const server = { server: result.server, definition: result.normalized, variables: [], authentication: [] };
      workspaceServers.addServer(server);
      serverId = result.server.id;
    }
    workspaceView.value = "requests";
    const imported = await request.createImportedCustomRequest({ ...draft, serverId });
    if (!imported) return;
    workspaceServers.selectedOperationId.value = CUSTOM_OPERATION_ID;
    workspaceServers.selectedServerId.value = serverId;
    await nextTick();
    request.selectDraft(imported.id);
    isCurlImportOpen.value = false;
  } catch (error) {
    curlImportError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isCurlImporting.value = false;
  }
}

function selectServer(serverId: string): void {
  workspaceView.value = "requests";
  workspaceServers.selectedServerId.value = serverId;
  workspaceServers.selectedOperationId.value = workspaceServers.operations.value[0]?.operationId ?? CUSTOM_OPERATION_ID;
}

async function saveAuthentication(input: Omit<SaveAuthenticationRequest, "serverId">): Promise<void> {
  const selected = workspaceServers.selectedServer.value;
  if (!selected) return;
  const tapir = window.tapir;
  if (!tapir) return;
  const authentication = await tapir.saveAuthentication({ ...input, serverId: selected.server.id });
  workspaceServers.updateServer({
    ...selected,
    authentication: [...selected.authentication.filter((item) => item.schemeKey !== authentication.schemeKey), authentication]
  });
  await request.refreshPreview();
}

async function deleteAuthentication(schemeKey: string): Promise<void> {
  const selected = workspaceServers.selectedServer.value;
  const tapir = window.tapir;
  if (!selected || !tapir) return;
  await tapir.deleteAuthentication({ serverId: selected.server.id, schemeKey });
  workspaceServers.updateServer({ ...selected, authentication: selected.authentication.filter((item) => item.schemeKey !== schemeKey) });
  await request.refreshPreview();
}

function configureServer(serverId: string): void {
  workspaceServers.selectedServerId.value = serverId;
  workspaceView.value = "serverConfiguration";
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

function serverUpdated(server: ServerWithDefinition): void {
  workspaceServers.updateServer(server);
}

async function serverDeleted(serverId: string): Promise<void> {
  workspaceServers.removeServer(serverId);
  workspaceView.value = "requests";
  await request.loadDrafts();
  await loadHistory(true);
  workspaceServers.selectedOperationId.value = workspaceServers.operations.value[0]?.operationId ?? CUSTOM_OPERATION_ID;
  await nextTick();
  await request.ensureActiveSpaceHasDraft();
}

</script>

<template>
  <div class="flex h-screen min-w-0 flex-col overflow-hidden bg-[var(--tapir-bg)] text-[var(--tapir-text)]">
    <AppHeader
      :operations-count="workspaceServers.operations.value.length"
      :selected-server="workspaceServers.selectedServer.value"
      :servers-count="workspaceServers.servers.value.length"
      :workspace="workspaceServers.workspace.value"
      @import-curl="curlImportError = ''; isCurlImportOpen = true"
    />

    <CurlImportDialog
      v-if="isCurlImportOpen"
      :current-server-id="workspaceServers.selectedServerId.value"
      :external-error="curlImportError"
      :is-importing="isCurlImporting"
      :servers="workspaceServers.servers.value"
      @cancel="isCurlImportOpen = false"
      @import="importCurl"
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
        :servers="workspaceServers.servers.value"
        :workspace="workspaceServers.workspace.value"
        @add-custom-request="addCustomRequest"
        @add-sandbox-request="addSandboxRequest"
        @add-operation-request="addOperationRequest"
        @server-added="workspaceServers.addServer"
        @server-refreshed="serverRefreshed"
        @configure-server="configureServer"
        @select-server="selectServer"
        @select-custom="selectCustom"
        @select-sandbox="selectSandbox"
        @select-operation="selectOperation"
      />
      <HistoryPanel
        v-else
        :history="history"
        :servers="workspaceServers.servers.value"
        :has-more="Boolean(historyCursor)"
        :is-loading="isLoadingHistory"
        @filter-history="filterHistory"
        @load-more="loadHistory(false)"
        @delete-history="deleteHistoryEntry"
        @clear-history="clearHistory"
        @restore-history="request.restoreHistory"
      />
        </div>
      </aside>

      <div class="resize-handle" title="Drag to resize sidebar" @mousedown="startColumnResize($event)"></div>

      <section :class="['grid min-w-0 overflow-hidden bg-[var(--tapir-bg-panel-soft)] backdrop-blur-xl', isResizingLayout ? 'is-dragging' : 'transition-[grid-template-rows] duration-300 ease-out']" :style="workspaceView === 'requests' ? responseStyle : undefined">
        <ServerConfiguration
          v-if="workspaceView === 'serverConfiguration' && workspaceServers.selectedServer.value"
          :server="workspaceServers.selectedServer.value"
          @variables-saved="workspaceServers.updateServerVariables"
          @server-updated="serverUpdated"
          @server-refreshed="serverRefreshed"
          @server-deleted="serverDeleted"
        />
        <RequestWorkspace
          v-else
          :active-draft="request.activeDraft.value"
          :authentication="workspaceServers.selectedServer.value?.authentication ?? []"
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
          :required-body-fields="request.requiredBodyFields.value"
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
          @close-drafts="request.closeDrafts"
          @copy-curl="request.copyCurl"
          @create-draft="request.isCustomSpace.value ? request.createCustomRequest() : workspaceServers.selectedOperation.value && request.createOpenApiRequest(workspaceServers.selectedOperation.value)"
          @remove-header="request.removeHeader"
          @remove-parameter="request.removeParameter"
          @save-authentication="saveAuthentication"
          @delete-authentication="deleteAuthentication"
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
          @generate-body-example="request.generateBodyExample"
        />

        <div v-if="workspaceView === 'requests'" class="resize-handle horizontal" title="Drag to resize response" @mousedown="startResponseResize"></div>

        <ResponsePanel
          v-if="workspaceView === 'requests'"
          :collapsed="collapsedPanels.response"
          :pretty-body="request.prettyBody.value"
          :response-view="request.responseView.value"
          @collapse="collapsedPanels.response = $event"
        />
      </section>

    </main>
  </div>
</template>
