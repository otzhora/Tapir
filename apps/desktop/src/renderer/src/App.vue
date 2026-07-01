<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, Clipboard, Database, Eye, FileJson2, KeyRound, ListFilter, Plus, RefreshCw, RotateCcw, Send, Server, TerminalSquare } from "lucide-vue-next";
import type { CallHistoryEntry, CallOperationResponse, NormalizedOperation, PreparedOperationRequest, ServerWithDefinition, Workspace } from "@tapir/core";
import { parseHeaders, parseRequestSnapshot, restoreRequestInputs as restoreInputsFromHistory } from "./historyRestore";
import { plainOperation } from "./ipcPayloads";
import { buildCurlCommand, formatJsonBody, formatRequestPreview } from "./requestFormatting";
import { bridgeUnavailableMessage, getTapirBridge as getAvailableTapirBridge } from "./tapirBridge";

type RequestTab = "params" | "auth" | "body" | "schema" | "preview";

const workspace = ref<Workspace | null>(null);
const servers = ref<ServerWithDefinition[]>([]);
const selectedServerId = ref<string | null>(null);
const selectedOperationId = ref<string | null>(null);
const baseUrl = ref("");
const isAddingServer = ref(false);
const isSending = ref(false);
const isPreviewing = ref(false);
const errorMessage = ref("");
const responseView = ref<CallOperationResponse | null>(null);
const requestPreview = ref<PreparedOperationRequest | null>(null);
const history = ref<CallHistoryEntry[]>([]);
const activeRequestTab = ref<RequestTab>("params");
const isResizingLayout = ref(false);

const parameterValues = reactive<Record<string, string>>({});
const bodyValue = ref("");
const contentType = ref("application/json");
const authHeaderName = ref("x-api-key");
const authSecret = ref("");

const leftWidth = ref(200);
const operationsWidth = ref(220);
const historyWidth = ref(180);
const responseHeight = ref(260);
const collapsedPanels = reactive({ servers: false, operations: false, history: false, response: false });

const panelClass = "min-w-0 overflow-auto border-r border-[#263039] bg-[#15191d] p-3 text-[#d9e1df]";
const fieldClass =
  "h-9 w-full min-w-0 rounded-md border border-[#303a44] bg-[#0f1317] px-2.5 text-[#edf4f1] outline-none transition placeholder:text-[#65717b] focus:border-[#12b886] focus:shadow-[0_0_0_3px_rgba(18,184,134,0.15)]";
const eyebrowClass = "text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#8f9ba5]";
const itemClass =
  "grid w-full min-w-0 grid-cols-[auto_1fr] gap-2.5 rounded-md border border-transparent p-2.5 text-left text-inherit transition hover:bg-[#1f252b]";
const activeItemClass = "border-[#2f8f7c] bg-[#1b2a28]";

const selectedServer = computed(() => servers.value.find((item) => item.server.id === selectedServerId.value) ?? null);
const operations = computed(() => selectedServer.value?.definition?.operations ?? []);
const selectedOperation = computed(() => operations.value.find((operation) => operation.operationId === selectedOperationId.value) ?? null);
const selectedContentTypes = computed(() => (selectedOperation.value?.requestBodyMediaTypes ?? []).map((item) => item.mediaType));
const apiKeyHeaderScheme = computed(() => (selectedOperation.value?.securitySchemes ?? []).find((scheme) => scheme.type === "apiKey" && scheme.in === "header") ?? null);
const validationIssues = computed(() => requestPreview.value?.validationIssues ?? []);
const canSend = computed(() => selectedOperation.value !== null && !isSending.value && validationIssues.value.length === 0);
const showBodyTab = computed(() => selectedOperation.value?.method !== "GET");

const requestTabs = computed<Array<{ id: RequestTab; label: string; count?: number }>>(() => [
  { id: "params", label: "Params", count: selectedOperation.value?.parameters.length ?? 0 },
  { id: "auth", label: "Auth", count: selectedOperation.value?.securitySchemes.length ?? 0 },
  ...(showBodyTab.value ? [{ id: "body" as const, label: "Body", count: selectedContentTypes.value.length }] : []),
  { id: "schema", label: "OpenAPI" },
  { id: "preview", label: "Preview" }
]);

const shellStyle = computed(() => ({
  gridTemplateColumns: `${collapsedPanels.servers ? 44 : leftWidth.value}px 6px ${collapsedPanels.operations ? 44 : operationsWidth.value}px 6px minmax(260px, 1fr) 6px ${collapsedPanels.history ? 44 : historyWidth.value}px`
}));

const responseStyle = computed(() => ({
  gridTemplateRows: `minmax(280px, 1fr) 6px ${collapsedPanels.response ? 44 : responseHeight.value}px`
}));

const groupedOperations = computed(() => {
  const groups = new Map<string, NormalizedOperation[]>();
  for (const operation of operations.value) {
    const groupName = operation.tags[0] ?? operation.path.split("/").filter(Boolean)[0] ?? "General";
    groups.set(groupName, [...(groups.get(groupName) ?? []), operation]);
  }
  return Array.from(groups, ([name, items]) => ({ name, items }));
});

const prettyRequest = computed(() => formatRequestPreview(requestPreview.value?.redactedRequest ?? null));
const prettyBody = computed(() => responseView.value ? formatJsonBody(responseView.value.response.body) : "");
const curlCommand = computed(() => buildCurlCommand(requestPreview.value?.redactedRequest ?? null));
const operationUrl = computed(() => requestPreview.value?.redactedRequest.url ?? `${selectedServer.value?.server.baseUrl ?? ""}${selectedOperation.value?.path ?? ""}`);
const requestBodySchema = computed(() => stringifySchema(selectedOperation.value?.requestBodySchema ?? null));
const responsesSchema = computed(() => stringifySchema(selectedOperation.value?.responses ?? null));

onMounted(async () => {
  await loadInitialState();
});

watch(selectedServerId, async (serverId) => {
  selectedOperationId.value = operations.value[0]?.operationId ?? null;
  responseView.value = null;
  clearParameterValues();
  if (!serverId) {
    history.value = [];
    return;
  }
  const tapir = getTapirBridge();
  if (!tapir) return;
  history.value = await tapir.listHistory(serverId);
});

watch(selectedOperation, () => {
  clearParameterValues();
  bodyValue.value = "";
  contentType.value = selectedContentTypes.value[0] ?? "application/json";
  authHeaderName.value = apiKeyHeaderScheme.value?.name ?? authHeaderName.value;
  activeRequestTab.value = "params";
  void refreshPreview();
});

watch([bodyValue, authHeaderName, authSecret, contentType], () => {
  void refreshPreview();
});

watch(parameterValues, () => {
  void refreshPreview();
}, { deep: true });

async function loadInitialState(): Promise<void> {
  const tapir = getTapirBridge();
  if (!tapir) return;
  const state = await tapir.getInitialState();
  workspace.value = state.workspace;
  servers.value = state.servers;
  selectedServerId.value = servers.value[0]?.server.id ?? null;
}

async function addServer(): Promise<void> {
  errorMessage.value = "";
  const tapir = getTapirBridge();
  if (!tapir) return;
  isAddingServer.value = true;
  try {
    const result = await tapir.addServer(baseUrl.value);
    servers.value = [{ server: result.server, definition: result.normalized }, ...servers.value];
    selectedServerId.value = result.server.id;
    baseUrl.value = "";
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isAddingServer.value = false;
  }
}

async function callOperation(): Promise<void> {
  if (!selectedServer.value || !selectedOperation.value) return;
  errorMessage.value = "";
  const tapir = getTapirBridge();
  if (!tapir) return;
  isSending.value = true;
  try {
    if (authSecret.value.trim()) {
      await tapir.saveApiKeyHeader({
        serverId: selectedServer.value.server.id,
        headerName: authHeaderName.value,
        secretValue: authSecret.value
      });
    }
    responseView.value = await tapir.callOperation({
      serverId: selectedServer.value.server.id,
      operation: plainOperation(selectedOperation.value),
      values: { ...parameterValues },
      body: bodyValue.value,
      contentType: contentType.value,
      apiKeyHeaderName: authHeaderName.value,
      apiKeyValue: authSecret.value
    });
    collapsedPanels.response = false;
    history.value = await tapir.listHistory(selectedServer.value.server.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isSending.value = false;
  }
}

async function refreshPreview(): Promise<void> {
  if (!selectedServer.value || !selectedOperation.value) {
    requestPreview.value = null;
    return;
  }
  const tapir = getTapirBridge();
  if (!tapir) return;
  isPreviewing.value = true;
  try {
    requestPreview.value = await tapir.previewOperation({
      serverId: selectedServer.value.server.id,
      operation: plainOperation(selectedOperation.value),
      values: { ...parameterValues },
      body: bodyValue.value,
      contentType: contentType.value,
      apiKeyHeaderName: authHeaderName.value,
      apiKeyValue: authSecret.value
    });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isPreviewing.value = false;
  }
}

function startColumnResize(target: "servers" | "operations" | "history", event: MouseEvent): void {
  const startX = event.clientX;
  const startWidths = { left: leftWidth.value, operations: operationsWidth.value, history: historyWidth.value };
  collapsedPanels[target] = false;
  const onMove = (moveEvent: MouseEvent) => {
    const delta = moveEvent.clientX - startX;
    if (target === "servers") leftWidth.value = clamp(startWidths.left + delta, 44, 340);
    if (target === "operations") operationsWidth.value = clamp(startWidths.operations + delta, 44, 400);
    if (target === "history") historyWidth.value = clamp(startWidths.history - delta, 44, 340);
  };
  const onUp = () => {
    if (target === "servers" && leftWidth.value <= 92) collapsedPanels.servers = true;
    if (target === "operations" && operationsWidth.value <= 92) collapsedPanels.operations = true;
    if (target === "history" && historyWidth.value <= 92) collapsedPanels.history = true;
    if (target === "servers" && !collapsedPanels.servers) leftWidth.value = Math.max(leftWidth.value, 160);
    if (target === "operations" && !collapsedPanels.operations) operationsWidth.value = Math.max(operationsWidth.value, 180);
    if (target === "history" && !collapsedPanels.history) historyWidth.value = Math.max(historyWidth.value, 160);
    document.body.classList.remove("is-resizing");
    isResizingLayout.value = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  isResizingLayout.value = true;
  document.body.classList.add("is-resizing");
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function startResponseResize(event: MouseEvent): void {
  const startY = event.clientY;
  const startHeight = responseHeight.value;
  collapsedPanels.response = false;
  const onMove = (moveEvent: MouseEvent) => {
    responseHeight.value = clamp(startHeight - (moveEvent.clientY - startY), 44, window.innerHeight - 220);
  };
  const onUp = () => {
    if (responseHeight.value <= 92) collapsedPanels.response = true;
    if (!collapsedPanels.response) responseHeight.value = Math.max(responseHeight.value, 150);
    document.body.classList.remove("is-resizing");
    isResizingLayout.value = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  isResizingLayout.value = true;
  document.body.classList.add("is-resizing");
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function selectOperation(operation: NormalizedOperation): void {
  selectedOperationId.value = operation.operationId;
}

async function restoreHistory(entry: CallHistoryEntry): Promise<void> {
  if (!entry.operationId) return;
  const operation = operations.value.find((candidate) => candidate.operationId === entry.operationId);
  if (!operation) return;
  selectedOperationId.value = operation.operationId;
  await nextTick();
  responseView.value = entry.responseBody && entry.responseStatus
    ? {
      request: parseRequestSnapshot(entry.requestSnapshotJson),
      response: {
        status: entry.responseStatus,
        headers: parseHeaders(entry.responseHeadersJson),
        body: entry.responseBody,
        durationMs: entry.durationMs ?? 0
      }
    }
    : null;
  restoreRequestInputs(operation, parseRequestSnapshot(entry.requestSnapshotJson));
}

function clearParameterValues(): void {
  for (const key of Object.keys(parameterValues)) {
    delete parameterValues[key];
  }
}

function restoreRequestInputs(operation: NormalizedOperation, request: CallOperationResponse["request"]): void {
  clearParameterValues();
  const restored = restoreInputsFromHistory(operation, request, selectedContentTypes.value[0] ?? "application/json");
  bodyValue.value = restored.bodyValue;
  contentType.value = restored.contentType;
  for (const [name, value] of Object.entries(restored.parameterValues)) {
    parameterValues[name] = value;
  }
  void refreshPreview();
}

async function copyCurl(): Promise<void> {
  if (!curlCommand.value) return;
  await navigator.clipboard.writeText(curlCommand.value);
}

function methodClass(method: string): string {
  const base = "inline-grid h-6 w-[58px] place-items-center rounded bg-[#2a323b] text-[11px] font-black text-[#d4dcda]";
  const variants: Record<string, string> = {
    GET: "bg-[#123a33] text-[#43e2b2]",
    POST: "bg-[#3a3215] text-[#ffd166]",
    PUT: "bg-[#16344a] text-[#65c7ff]",
    PATCH: "bg-[#2f2844] text-[#c4a7ff]",
    DELETE: "bg-[#411f1f] text-[#ff8b7c]"
  };
  return `${base} ${variants[method] ?? ""}`;
}

function stringifySchema(value: unknown): string {
  if (!value) return "No schema declared by the OpenAPI definition.";
  return JSON.stringify(value, null, 2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getTapirBridge() {
  const tapir = getAvailableTapirBridge();
  if (!tapir) errorMessage.value = bridgeUnavailableMessage;
  return tapir;
}
</script>

<template>
  <main :class="['app-shell grid h-screen bg-[#101316] text-[#d9e1df]', isResizingLayout ? 'is-dragging' : 'transition-[grid-template-columns] duration-300 ease-out']" :style="shellStyle">
    <aside :class="[panelClass, collapsedPanels.servers && 'overflow-hidden px-2']">
      <button v-if="collapsedPanels.servers" class="grid h-full w-full place-items-start pt-3 text-[#8f9ba5]" title="Expand servers" @click="collapsedPanels.servers = false">
        <Server :size="20" />
      </button>
      <template v-else>
        <div class="mb-5 flex items-center gap-3">
          <div class="grid size-9 place-items-center rounded-md border border-[#34424a] bg-[#12b886] font-black text-[#07100e]">T</div>
          <div>
            <h1 class="m-0 text-[22px] font-bold">Tapir</h1>
            <p class="m-0 text-[#8f9ba5]">{{ workspace?.name ?? "Local Workspace" }}</p>
          </div>
          <button class="ml-auto rounded-md p-1.5 text-[#8f9ba5] transition hover:bg-[#20262d] hover:text-white" title="Collapse servers" @click="collapsedPanels.servers = true">
            <ChevronLeft :size="17" />
          </button>
        </div>

        <form class="mb-3.5 grid gap-2" @submit.prevent="addServer">
          <label for="base-url" :class="eyebrowClass">Add Server</label>
          <div class="grid grid-cols-[1fr_40px] gap-2">
            <input id="base-url" v-model="baseUrl" :class="fieldClass" placeholder="https://api.example.com" required />
            <button class="inline-flex items-center justify-center gap-2 rounded-md bg-[#12b886] font-extrabold text-[#06110f] transition hover:bg-[#20c997] disabled:cursor-not-allowed disabled:opacity-60" type="submit" :disabled="isAddingServer || !baseUrl.trim()" title="Discover spec">
              <RefreshCw v-if="isAddingServer" :size="17" class="animate-spin" />
              <Plus v-else :size="18" />
            </button>
          </div>
        </form>

        <p v-if="errorMessage" class="my-2.5 rounded-md border border-[#7a352f] bg-[#2b1717] p-2.5 text-[13px] text-[#ffb7aa]">{{ errorMessage }}</p>

        <div class="grid gap-2.5">
          <button
            v-for="item in servers"
            :key="item.server.id"
            :class="[itemClass, item.server.id === selectedServerId && activeItemClass]"
            @click="selectedServerId = item.server.id"
          >
            <Server :size="17" />
            <span class="grid min-w-0 gap-[3px]">
              <strong class="truncate">{{ item.server.name }}</strong>
              <small class="truncate text-[#8f9ba5]">{{ item.server.baseUrl }}</small>
            </span>
          </button>
        </div>
      </template>
    </aside>

    <div class="resize-handle" title="Drag to resize servers" @mousedown="startColumnResize('servers', $event)"></div>

    <section :class="[panelClass, collapsedPanels.operations && 'overflow-hidden px-2']">
      <button v-if="collapsedPanels.operations" class="grid h-full w-full place-items-start pt-3 text-[#8f9ba5]" title="Expand operations" @click="collapsedPanels.operations = false">
        <ListFilter :size="20" />
      </button>
      <template v-else>
        <div :class="[eyebrowClass, 'mb-3.5 flex items-center justify-between']">
          <span>Operations</span>
          <span class="inline-flex items-center gap-2">
            <strong>{{ operations.length }}</strong>
            <button class="rounded-md p-1.5 text-[#8f9ba5] transition hover:bg-[#20262d] hover:text-white" title="Collapse operations" @click="collapsedPanels.operations = true">
              <ChevronLeft :size="17" />
            </button>
          </span>
        </div>

        <div v-if="!selectedServer" class="grid min-h-[220px] place-items-center gap-2.5 text-center text-[#8f9ba5]">
          <TerminalSquare :size="30" />
          <p class="m-0">Add a deployed API server to discover its OpenAPI surface.</p>
        </div>

        <template v-else>
          <div v-for="group in groupedOperations" :key="group.name" class="grid gap-2.5">
            <h2 class="mb-0.5 mt-4 text-xs font-bold uppercase text-[#77838d]">{{ group.name }}</h2>
            <button
              v-for="operation in group.items"
              :key="operation.operationId"
              :class="[itemClass, operation.operationId === selectedOperationId && activeItemClass]"
              @click="selectOperation(operation)"
            >
              <span :class="methodClass(operation.method)">{{ operation.method }}</span>
              <span class="grid min-w-0 gap-[3px]">
                <strong class="truncate">{{ operation.summary || operation.operationId }}</strong>
                <small class="truncate text-[#8f9ba5]">{{ operation.path }}</small>
              </span>
            </button>
          </div>
        </template>
      </template>
    </section>

    <div class="resize-handle" title="Drag to resize operations" @mousedown="startColumnResize('operations', $event)"></div>

    <section :class="['grid min-w-0 overflow-hidden bg-[#0f1317]', isResizingLayout ? 'is-dragging' : 'transition-[grid-template-rows] duration-300 ease-out']" :style="responseStyle">
      <div class="min-h-0 overflow-auto p-4">
        <div v-if="selectedOperation && selectedServer" class="mx-auto grid max-w-[1280px] gap-4">
          <header class="rounded-lg border border-[#27323b] bg-[#171c21]">
            <div class="grid gap-3 border-b border-[#27323b] p-4">
              <div class="flex min-w-0 items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="flex min-w-0 items-center gap-2.5">
                    <span :class="methodClass(selectedOperation.method)">{{ selectedOperation.method }}</span>
                    <h2 class="m-0 text-[21px] font-bold [overflow-wrap:anywhere]">{{ selectedOperation.summary || selectedOperation.operationId }}</h2>
                  </div>
                  <p class="mt-2 max-w-[900px] text-[#9aa6ae]">{{ selectedOperation.description || selectedOperation.path }}</p>
                </div>
                <button class="inline-flex h-10 min-w-[104px] shrink-0 items-center justify-center gap-2 rounded-md bg-[#1684fc] px-3.5 font-extrabold text-white shadow-[0_10px_30px_rgba(22,132,252,0.18)] transition hover:bg-[#2d91ff] disabled:cursor-not-allowed disabled:opacity-60" :disabled="!canSend" @click="callOperation">
                  <Send :size="17" />
                  {{ isSending ? "Sending" : "Send" }}
                </button>
              </div>
              <div class="grid grid-cols-[minmax(112px,140px)_1fr] overflow-hidden rounded-md border border-[#303a44] bg-[#0f1317]">
                <div class="grid place-items-center border-r border-[#303a44] px-3 font-black text-[#43e2b2]">{{ selectedOperation.method }}</div>
                <input class="h-11 min-w-0 bg-transparent px-3 text-[#edf4f1] outline-none" :value="operationUrl" readonly />
              </div>
              <div class="grid gap-2 text-[13px] text-[#8f9ba5] md:grid-cols-3">
                <span class="truncate">Name: <strong class="text-[#cfd8d5]">{{ selectedOperation.operationId }}</strong></span>
                <span class="truncate">Path: <strong class="text-[#cfd8d5]">{{ selectedOperation.path }}</strong></span>
                <span class="truncate">Server: <strong class="text-[#cfd8d5]">{{ selectedServer.server.name }}</strong></span>
              </div>
            </div>

            <nav class="flex min-w-0 gap-1 overflow-x-auto px-3 pt-2">
              <button
                v-for="tab in requestTabs"
                :key="tab.id"
                class="tab-button"
                :class="tab.id === activeRequestTab && 'is-active'"
                @click="activeRequestTab = tab.id"
              >
                {{ tab.label }}
                <span v-if="tab.count !== undefined" class="rounded bg-[#26313a] px-1.5 py-0.5 text-[11px] text-[#aeb8be]">{{ tab.count }}</span>
              </button>
            </nav>

            <section v-if="validationIssues.length > 0" class="m-4 grid gap-2 rounded-md border border-[#7a352f] bg-[#2b1717] p-3 text-[#ffb7aa]">
              <div v-for="issue in validationIssues" :key="`${issue.field}:${issue.message}`" class="flex items-start gap-2 text-[13px] font-bold">
                <AlertCircle :size="16" class="mt-0.5 shrink-0" />
                <span>{{ issue.message }}</span>
              </div>
            </section>

            <div class="min-h-[260px] p-4">
              <section v-if="activeRequestTab === 'params'" class="request-grid">
                <div class="table-head">Key</div>
                <div class="table-head">Location</div>
                <div class="table-head">Value</div>
                <template v-if="selectedOperation.parameters.length > 0">
                  <template v-for="parameter in selectedOperation.parameters" :key="`${parameter.in}:${parameter.name}`">
                    <div class="table-cell">
                      <strong>{{ parameter.name }}</strong>
                      <small v-if="parameter.required" class="ml-2 text-[#ffd166]">required</small>
                      <p v-if="parameter.description" class="mt-1 text-[#8f9ba5]">{{ parameter.description }}</p>
                    </div>
                    <div class="table-cell text-[#9aa6ae]">{{ parameter.in }}</div>
                    <div class="table-cell"><input v-model="parameterValues[parameter.name]" :class="fieldClass" :placeholder="parameter.name" /></div>
                  </template>
                </template>
                <div v-else class="col-span-3 grid min-h-[130px] place-items-center text-[#8f9ba5]">No parameters declared by the spec.</div>
              </section>

              <section v-else-if="activeRequestTab === 'auth'" class="grid max-w-[720px] gap-4">
                <div class="flex items-center gap-2 text-[#cfd8d5]"><KeyRound :size="18" /> API key header</div>
                <label class="grid gap-2">
                  <span :class="eyebrowClass">Header name</span>
                  <input v-model="authHeaderName" :class="fieldClass" placeholder="x-api-key" />
                </label>
                <label class="grid gap-2">
                  <span :class="eyebrowClass">Secret value</span>
                  <input v-model="authSecret" :class="fieldClass" type="password" placeholder="Stored locally for this server" />
                </label>
              </section>

              <section v-else-if="activeRequestTab === 'body'" class="grid gap-3">
                <div class="flex items-center justify-between gap-3">
                  <span :class="eyebrowClass">Body</span>
                  <select v-model="contentType" class="h-9 min-w-[190px] rounded-md border border-[#303a44] bg-[#0f1317] px-2 text-[13px] font-bold text-[#edf4f1] outline-none">
                    <option v-if="selectedContentTypes.length === 0" value="application/json">application/json</option>
                    <option v-for="type in selectedContentTypes" :key="type" :value="type">{{ type }}</option>
                  </select>
                </div>
                <textarea v-model="bodyValue" class="min-h-[190px] w-full min-w-0 resize-y rounded-md border border-[#303a44] bg-[#0f1317] p-3 font-mono text-[13px] leading-6 text-[#edf4f1] outline-none transition placeholder:text-[#65717b] focus:border-[#12b886] focus:shadow-[0_0_0_3px_rgba(18,184,134,0.15)]" spellcheck="false" placeholder="{ }"></textarea>
              </section>

              <section v-else-if="activeRequestTab === 'schema'" class="grid gap-3 lg:grid-cols-2">
                <div class="min-w-0">
                  <div class="mb-2 flex items-center gap-2 text-sm font-bold text-[#cfd8d5]"><FileJson2 :size="17" /> Request schema</div>
                  <pre class="code-block">{{ requestBodySchema }}</pre>
                </div>
                <div class="min-w-0">
                  <div class="mb-2 flex items-center gap-2 text-sm font-bold text-[#cfd8d5]"><Database :size="17" /> Responses</div>
                  <pre class="code-block">{{ responsesSchema }}</pre>
                </div>
              </section>

              <section v-else class="grid gap-3">
                <div class="mb-1 flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2 text-sm font-bold text-[#cfd8d5]"><Eye :size="17" /> Prepared request</div>
                  <button class="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#303a44] bg-[#0f1317] px-2.5 text-[13px] font-extrabold text-[#d9e1df] transition hover:bg-[#20262d] disabled:cursor-not-allowed disabled:opacity-60" :disabled="!curlCommand" title="Copy cURL" @click="copyCurl">
                    <Clipboard :size="15" />
                    cURL
                  </button>
                </div>
                <pre v-if="requestPreview" class="code-block min-h-[190px]">{{ prettyRequest }}</pre>
                <div v-else class="grid min-h-[190px] place-items-center rounded-md border border-[#303a44] text-center text-[#8f9ba5]">{{ isPreviewing ? "Preparing request..." : "Complete the request fields to preview it." }}</div>
              </section>
            </div>
          </header>
        </div>

        <div v-else class="grid min-h-full place-items-center gap-2.5 text-center text-[#8f9ba5]">
          <TerminalSquare :size="34" />
          <p class="m-0">Select an operation to prepare and call it.</p>
        </div>
      </div>

      <div class="resize-handle horizontal" title="Drag to resize response" @mousedown="startResponseResize"></div>

      <section class="min-h-0 overflow-hidden border-t border-[#263039] bg-[#15191d]">
        <header class="flex h-11 items-center justify-between border-b border-[#263039] px-4">
          <button class="flex items-center gap-2 font-bold text-[#cfd8d5]" @click="collapsedPanels.response = !collapsedPanels.response">
            <ChevronDown :class="['transition-transform', collapsedPanels.response && '-rotate-90']" :size="17" />
            Response
          </button>
          <span v-if="responseView" class="font-extrabold text-[#43e2b2]">{{ responseView.response.status }} · {{ responseView.response.durationMs }} ms</span>
        </header>
        <div v-if="!collapsedPanels.response" class="h-[calc(100%-44px)] overflow-auto p-4">
          <pre v-if="responseView" class="code-block min-h-full">{{ prettyBody }}</pre>
          <div v-else class="grid h-full min-h-[180px] place-items-center gap-2.5 text-center text-[#8f9ba5]">Enter request details and click Send to get a response.</div>
        </div>
      </section>
    </section>

    <div class="resize-handle" :class="collapsedPanels.history && 'is-hidden-edge'" title="Drag to resize history" @mousedown="startColumnResize('history', $event)"></div>

    <aside v-if="!collapsedPanels.history" :class="[panelClass, 'grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden']">
      <div :class="[eyebrowClass, 'mb-3.5 flex items-center justify-between']">
        <span>History</span>
        <span class="inline-flex items-center gap-2">
          <strong>{{ history.length }}</strong>
          <button class="rounded-md p-1.5 text-[#8f9ba5] transition hover:bg-[#20262d] hover:text-white" title="Collapse history" @click="collapsedPanels.history = true">
            <ChevronRight :size="17" />
          </button>
        </span>
      </div>
      <div class="min-h-0 overflow-auto">
        <div v-if="history.length === 0" class="pt-2 text-[#8f9ba5]">No calls yet.</div>
        <button v-for="entry in history" :key="entry.id" class="grid w-full grid-cols-[44px_1fr_auto] gap-x-2 gap-y-1 border-b border-[#263039] py-2.5 text-left text-inherit transition hover:bg-[#1f252b]" title="Restore request" @click="restoreHistory(entry)">
          <strong :class="entry.responseStatus && entry.responseStatus < 400 ? 'text-[#43e2b2]' : 'text-[#ff8b7c]'">{{ entry.responseStatus ?? "ERR" }}</strong>
          <span class="truncate">{{ entry.operationId ?? "Scratch request" }}</span>
          <RotateCcw :size="14" class="mt-0.5 text-[#8f9ba5]" />
          <small class="col-span-2 col-start-2 text-[#8f9ba5]">{{ entry.durationMs ?? 0 }} ms · {{ new Date(entry.createdAt).toLocaleString() }}</small>
        </button>
      </div>
    </aside>
    <button v-else class="grid min-w-0 place-items-start border-l border-[#263039] bg-[#15191d] px-2 pt-7 text-[#8f9ba5]" title="Expand history" @click="collapsedPanels.history = false">
      <RotateCcw :size="20" />
    </button>
  </main>
</template>
