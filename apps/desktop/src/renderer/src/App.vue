<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import { LoaderCircle } from "lucide-vue-next";
import type { CallHistoryEntry, NormalizedOperation, SaveAuthenticationRequest, ServerWithDefinition } from "@tapir/core";
import AppHeader from "./components/AppHeader.vue";
import RequestWorkspace from "./components/RequestWorkspace.vue";
import ResponsePanel from "./components/ResponsePanel.vue";
import ServerConfiguration from "./components/ServerConfiguration.vue";
import ServersPanel from "./components/ServersPanel.vue";
import CurlImportDialog from "./components/CurlImportDialog.vue";
import AddServerDialog from "./components/AddServerDialog.vue";
import type { CurlImportDraft } from "./curlImport";
import { CUSTOM_OPERATION_ID, useOperationRequest } from "./composables/useOperationRequest";
import { useResizablePanels } from "./composables/useResizablePanels";
import { useWorkspaceServers } from "./composables/useWorkspaceServers";
import { getTapirBridge } from "./tapirBridge";
import { panelClass } from "./uiClasses";

const errorMessage = ref("");
const history = ref<CallHistoryEntry[]>([]);
const isLoadingHistory = ref(false);
let historyLoadVersion = 0;
const workspaceView = ref<"requests" | "serverConfiguration">("requests");
const isCurlImportOpen = ref(false);
const isAddServerOpen = ref(false);
const curlImportError = ref("");
const isCurlImporting = ref(false);
const isInitializing = ref(true);
const requestWorkspace = ref<InstanceType<typeof RequestWorkspace> | null>(null);

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
  reloadHistory: loadHistory,
  setErrorMessage: (message) => {
    errorMessage.value = message;
  }
});

onMounted(async () => {
  try {
    await workspaceServers.loadInitialState();
    await request.loadDrafts();
    await loadHistory();
  } finally {
    isInitializing.value = false;
  }
});

watch(workspaceServers.selectedServerId, () => {
  if (workspaceServers.selectedOperationId.value !== CUSTOM_OPERATION_ID) {
    workspaceServers.selectedOperationId.value = workspaceServers.operations.value[0]?.operationId ?? null;
  }
});

async function loadHistory(): Promise<void> {
  const tapir = getTapirBridge();
  const workspaceId = workspaceServers.workspace.value?.id;
  const draft = request.activeDraft.value;
  const version = ++historyLoadVersion;
  if (!tapir || !workspaceId || !draft) {
    history.value = [];
    isLoadingHistory.value = false;
    return;
  }
  isLoadingHistory.value = true;
  try {
    const scope = draft.sourceType === "openapi" && draft.serverInstanceId && draft.operationId
      ? { serverId: draft.serverInstanceId, operationId: draft.operationId }
      : { requestDraftId: draft.id };
    const page = await tapir.listHistory({ workspaceId, ...scope, limit: 10 });
    if (version === historyLoadVersion) {
      history.value = page.entries.filter((entry) => draft.sourceType === "openapi"
        ? entry.serverInstanceId === draft.serverInstanceId && entry.operationId === draft.operationId
        : entry.requestDraftId === draft.id);
    }
  } finally {
    if (version === historyLoadVersion) isLoadingHistory.value = false;
  }
}

watch(() => request.activeDraft.value?.id, () => { void loadHistory(); });

async function selectOperation(operation: NormalizedOperation, serverId?: string): Promise<void> {
  workspaceView.value = "requests";
  if (serverId && serverId !== workspaceServers.selectedServerId.value) {
    workspaceServers.selectedServerId.value = serverId;
    await nextTick();
  }
  workspaceServers.selectOperation(operation);
  await nextTick();
  await request.ensureActiveSpaceHasDraft();
}

async function addOperationRequest(operation: NormalizedOperation, serverId?: string): Promise<void> {
  workspaceView.value = "requests";
  if (serverId && serverId !== workspaceServers.selectedServerId.value) {
    workspaceServers.selectedServerId.value = serverId;
    await nextTick();
  }
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

function addServer(server: ServerWithDefinition): void {
  workspaceServers.addServer(server);
  isAddServerOpen.value = false;
  selectServer(server.server.id);
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

async function sendActiveRequest(): Promise<void> {
  const ready = await requestWorkspace.value?.savePendingAuthentication();
  if (ready === false) return;
  await request.callOperation();
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
  await loadHistory();
  workspaceServers.selectedOperationId.value = workspaceServers.operations.value[0]?.operationId ?? CUSTOM_OPERATION_ID;
  await nextTick();
  await request.ensureActiveSpaceHasDraft();
}

</script>

<template>
  <div class="flex h-screen min-w-0 flex-col overflow-hidden bg-[var(--tapir-bg)] text-[var(--tapir-text)]">
    <AppHeader
      :selected-server="workspaceServers.selectedServer.value"
      :workspace="workspaceServers.workspace.value"
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

    <AddServerDialog v-if="isAddServerOpen" @added="addServer" @cancel="isAddServerOpen = false" />

    <div v-if="isInitializing" class="empty-state min-h-0 flex-1" role="status">
      <LoaderCircle :size="28" class="animate-spin" />
      <p>Loading workspace…</p>
    </div>

    <main v-else :class="['app-shell grid min-h-0 flex-1 text-[var(--tapir-text)]', isResizingLayout ? 'is-dragging' : 'transition-[grid-template-columns] duration-300 ease-out']" :style="shellStyle">
      <aside :class="[panelClass, 'min-h-0 overflow-hidden']">
        <div class="h-full min-h-0 overflow-x-hidden overflow-y-auto">
      <ServersPanel
        :grouped-operations="workspaceServers.groupedOperations.value"
        :operations-count="workspaceServers.operations.value.length"
        :selected-operation-id="workspaceServers.selectedOperationId.value"
        :selected-server-id="workspaceServers.selectedServerId.value"
        :servers="workspaceServers.servers.value"
        @add-custom-request="addCustomRequest"
        @add-sandbox-request="addSandboxRequest"
        @add-server="isAddServerOpen = true"
        @add-operation-request="addOperationRequest"
        @server-refreshed="serverRefreshed"
        @configure-server="configureServer"
        @import-curl="curlImportError = ''; isCurlImportOpen = true"
        @select-server="selectServer"
        @select-custom="selectCustom"
        @select-sandbox="selectSandbox"
        @select-operation="selectOperation"
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
          ref="requestWorkspace"
          :active-draft="request.activeDraft.value"
          :authentication="workspaceServers.selectedServer.value?.authentication ?? []"
          :active-request-tab="request.activeRequestTab.value"
          :can-send="request.canSend.value"
          :draft-tabs="request.visibleDrafts.value"
          :headers="request.headers.value"
          :is-custom-space="request.isCustomSpace.value"
          :is-previewing="request.isPreviewing.value"
          :is-sending="request.isSending.value"
          :operation-url="request.operationUrl.value"
          :parameters="request.parameters.value"
          :required-body-fields="request.requiredBodyFields.value"
          :request-preview="request.requestPreview.value"
          :request-error="errorMessage"
          :request-tabs="request.requestTabs.value"
          :selected-content-types="request.selectedContentTypes.value"
          :selected-operation="workspaceServers.selectedOperation.value"
          :selected-server="workspaceServers.selectedServer.value"
          :validation-issues="request.validationIssues.value"
          :save-authentication-handler="saveAuthentication"
          @add-header="request.addHeader"
          @add-parameter="request.addParameter"
          @call-operation="sendActiveRequest"
          @close-draft="request.closeDraft"
          @close-drafts="request.closeDrafts"
          @copy-curl="request.copyCurl"
          @create-draft="request.isCustomSpace.value ? request.createCustomRequest() : workspaceServers.selectedOperation.value && request.createOpenApiRequest(workspaceServers.selectedOperation.value)"
          @duplicate-draft="request.duplicateDraft"
          @remove-header="request.removeHeader"
          @remove-parameter="request.removeParameter"
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
          :history="history"
          :is-loading-history="isLoadingHistory"
          :pretty-body="request.prettyBody.value"
          :response-view="request.responseView.value"
          @collapse="collapsedPanels.response = $event"
          @restore-history="request.restoreHistory"
        />
      </section>

    </main>
  </div>
</template>
