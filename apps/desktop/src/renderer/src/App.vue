<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { AlertCircle, Clipboard, KeyRound, Plus, RefreshCw, RotateCcw, Send, Server, TerminalSquare } from "lucide-vue-next";
import type { CallHistoryEntry, CallOperationResponse, NormalizedOperation, PreparedOperationRequest, ServerWithDefinition, Workspace } from "@tapir/core";
import { parseHeaders, parseRequestSnapshot, restoreRequestInputs as restoreInputsFromHistory } from "./historyRestore";
import { plainOperation } from "./ipcPayloads";
import { buildCurlCommand, formatJsonBody, formatRequestPreview } from "./requestFormatting";
import { bridgeUnavailableMessage, getTapirBridge as getAvailableTapirBridge } from "./tapirBridge";

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

const parameterValues = reactive<Record<string, string>>({});
const bodyValue = ref("");
const contentType = ref("application/json");
const authHeaderName = ref("x-api-key");
const authSecret = ref("");
const panelClass = "min-w-0 overflow-auto border-r border-[#cad4cb] bg-[#fafcf7]/90 p-[18px]";
const fieldClass =
  "h-[38px] w-full min-w-0 rounded-md border border-[#b8c5bd] bg-[#fffef8] px-2.5 text-[#172321] outline-none focus:border-[#0a7a69] focus:shadow-[0_0_0_3px_rgba(10,122,105,0.14)]";
const eyebrowClass = "text-xs font-extrabold uppercase text-[#35433f]";
const itemClass =
  "grid w-full min-w-0 grid-cols-[auto_1fr] gap-2.5 rounded-[7px] border border-transparent p-2.5 text-left text-inherit hover:bg-[#eef3ec]";
const activeItemClass = "border-[#9db0a4] bg-[#e9eee7]";

const selectedServer = computed(() => servers.value.find((item) => item.server.id === selectedServerId.value) ?? null);
const operations = computed(() => selectedServer.value?.definition?.operations ?? []);
const selectedOperation = computed(() => operations.value.find((operation) => operation.operationId === selectedOperationId.value) ?? null);
const selectedContentTypes = computed(() => (selectedOperation.value?.requestBodyMediaTypes ?? []).map((item) => item.mediaType));
const apiKeyHeaderScheme = computed(() => (selectedOperation.value?.securitySchemes ?? []).find((scheme) => scheme.type === "apiKey" && scheme.in === "header") ?? null);
const validationIssues = computed(() => requestPreview.value?.validationIssues ?? []);
const canSend = computed(() => selectedOperation.value !== null && !isSending.value && validationIssues.value.length === 0);

const groupedOperations = computed(() => {
  const groups = new Map<string, NormalizedOperation[]>();
  for (const operation of operations.value) {
    const groupName = operation.tags[0] ?? operation.path.split("/").filter(Boolean)[0] ?? "General";
    groups.set(groupName, [...(groups.get(groupName) ?? []), operation]);
  }
  return Array.from(groups, ([name, items]) => ({ name, items }));
});

const prettyRequest = computed(() => {
  return formatRequestPreview(requestPreview.value?.redactedRequest ?? null);
});

const prettyBody = computed(() => {
  if (!responseView.value) return "";
  return formatJsonBody(responseView.value.response.body);
});

const curlCommand = computed(() => {
  return buildCurlCommand(requestPreview.value?.redactedRequest ?? null);
});

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
  const base = "inline-grid h-6 w-[58px] place-items-center rounded bg-[#dfe7df] text-[11px] font-black text-[#26413d]";
  const variants: Record<string, string> = {
    GET: "bg-[#d9f2ef] text-[#006f63]",
    POST: "bg-[#e8efcd] text-[#607100]",
    DELETE: "bg-[#ffe1d9] text-[#a03225]"
  };
  return `${base} ${variants[method] ?? ""}`;
}

function getTapirBridge() {
  const tapir = getAvailableTapirBridge();
  if (!tapir) errorMessage.value = bridgeUnavailableMessage;
  return tapir;
}
</script>

<template>
  <main class="grid min-h-screen grid-cols-[280px_minmax(250px,330px)_minmax(460px,1fr)_230px] max-[1150px]:grid-cols-[260px_280px_minmax(420px,1fr)]">
    <aside :class="panelClass">
      <div class="mb-7 flex items-center gap-3">
        <div class="grid size-9 place-items-center border-2 border-[#203633] bg-[#d7fb56] font-black text-[#203633]">T</div>
        <div>
          <h1 class="m-0 text-[22px] font-bold">Tapir</h1>
          <p class="m-0 text-[#66736d]">{{ workspace?.name ?? "Local Workspace" }}</p>
        </div>
      </div>

      <form class="mb-3.5 grid gap-2" @submit.prevent="addServer">
        <label for="base-url" :class="eyebrowClass">Add Server</label>
        <div class="grid grid-cols-[1fr_40px] gap-2">
          <input id="base-url" v-model="baseUrl" :class="fieldClass" placeholder="https://api.example.com" required />
          <button class="inline-flex items-center justify-center gap-2 rounded-md bg-[#203633] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60" type="submit" :disabled="isAddingServer || !baseUrl.trim()" title="Discover spec">
            <RefreshCw v-if="isAddingServer" :size="17" class="animate-spin" />
            <Plus v-else :size="18" />
          </button>
        </div>
      </form>

      <p v-if="errorMessage" class="my-2.5 border-l-[3px] border-[#bc3d2c] bg-[#fff0eb] p-2.5 text-[13px] text-[#8f2f22]">{{ errorMessage }}</p>

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
            <small class="truncate text-[#66736d]">{{ item.server.baseUrl }}</small>
          </span>
        </button>
      </div>
    </aside>

    <section :class="panelClass">
      <div :class="[eyebrowClass, 'mb-3.5 flex justify-between']">
        <span>Operations</span>
        <strong>{{ operations.length }}</strong>
      </div>

      <div v-if="!selectedServer" class="grid min-h-[220px] place-items-center gap-2.5 text-center text-[#6f7d77]">
        <TerminalSquare :size="30" />
        <p class="m-0">Add a deployed API server to discover its OpenAPI surface.</p>
      </div>

      <template v-else>
        <div v-for="group in groupedOperations" :key="group.name" class="grid gap-2.5">
          <h2 class="mb-0.5 mt-4 text-xs font-bold uppercase text-[#57645f]">{{ group.name }}</h2>
          <button
            v-for="operation in group.items"
            :key="operation.operationId"
            :class="[itemClass, operation.operationId === selectedOperationId && activeItemClass]"
            @click="selectOperation(operation)"
          >
            <span :class="methodClass(operation.method)">{{ operation.method }}</span>
            <span class="grid min-w-0 gap-[3px]">
              <strong class="truncate">{{ operation.summary || operation.operationId }}</strong>
              <small class="truncate text-[#66736d]">{{ operation.path }}</small>
            </span>
          </button>
        </div>
      </template>
    </section>

    <section class="min-w-0 overflow-auto border-r border-[#cad4cb] bg-[#fffffb]/80 p-[22px]">
      <div v-if="selectedOperation && selectedServer" class="grid gap-2.5">
        <header class="flex items-start justify-between gap-[18px] border-b border-[#cad4cb] pb-[18px]">
          <div class="min-w-0">
            <div class="flex min-w-0 items-center gap-2.5">
              <span :class="methodClass(selectedOperation.method)">{{ selectedOperation.method }}</span>
              <h2 class="m-0 text-[22px] font-bold [overflow-wrap:anywhere]">{{ selectedOperation.path }}</h2>
            </div>
            <p class="mt-2 text-[#61716a]">{{ selectedOperation.summary || selectedOperation.description || selectedOperation.operationId }}</p>
          </div>
          <button class="inline-flex h-10 min-w-[104px] shrink-0 items-center justify-center gap-2 rounded-md bg-[#0a7a69] px-3.5 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60" :disabled="!canSend" @click="callOperation">
            <Send :size="17" />
            {{ isSending ? "Sending" : "Send" }}
          </button>
        </header>

        <section v-if="validationIssues.length > 0" class="grid gap-2 rounded-lg border border-[#e0a18f] bg-[#fff2ec] p-3.5 text-[#7d2b21]">
          <div v-for="issue in validationIssues" :key="`${issue.field}:${issue.message}`" class="flex items-start gap-2 text-[13px] font-bold">
            <AlertCircle :size="16" class="mt-0.5 shrink-0" />
            <span>{{ issue.message }}</span>
          </div>
        </section>

        <div class="grid grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)] gap-3.5">
          <section class="rounded-lg border border-[#cbd6ce] bg-[#fbfcf8] p-3.5">
            <h3 :class="[eyebrowClass, 'mb-3 flex items-center gap-1.5']">Parameters</h3>
            <div v-if="selectedOperation.parameters.length === 0" class="text-[#66736d]">No parameters declared by the spec.</div>
            <label v-for="parameter in selectedOperation.parameters" :key="`${parameter.in}:${parameter.name}`" class="mb-3 grid gap-[7px]">
              <span class="text-[13px] font-bold text-[#31413d]">{{ parameter.name }} <small class="ml-1 font-medium text-[#66736d]">{{ parameter.in }}{{ parameter.required ? " required" : "" }}</small></span>
              <input v-model="parameterValues[parameter.name]" :class="fieldClass" :placeholder="parameter.description || parameter.name" />
            </label>
          </section>

          <section class="rounded-lg border border-[#cbd6ce] bg-[#fbfcf8] p-3.5">
            <h3 :class="[eyebrowClass, 'mb-3 flex items-center gap-1.5']"><KeyRound :size="16" /> API Key Header</h3>
            <label class="mb-3 grid gap-[7px]">
              <span class="text-[13px] font-bold text-[#31413d]">Header name</span>
              <input v-model="authHeaderName" :class="fieldClass" placeholder="x-api-key" />
            </label>
            <label class="mb-3 grid gap-[7px]">
              <span class="text-[13px] font-bold text-[#31413d]">Secret value</span>
              <input v-model="authSecret" :class="fieldClass" type="password" placeholder="Stored locally for this server" />
            </label>
          </section>

          <section v-if="selectedOperation.method !== 'GET'" class="col-span-full rounded-lg border border-[#cbd6ce] bg-[#fbfcf8] p-3.5">
            <div class="mb-3 flex items-center justify-between gap-3">
              <h3 :class="[eyebrowClass, 'flex items-center gap-1.5']">Body</h3>
              <select v-model="contentType" class="h-[34px] min-w-[170px] rounded-md border border-[#b8c5bd] bg-[#fffef8] px-2 text-[13px] font-bold text-[#172321] outline-none">
                <option v-if="selectedContentTypes.length === 0" value="application/json">application/json</option>
                <option v-for="type in selectedContentTypes" :key="type" :value="type">{{ type }}</option>
              </select>
            </div>
            <textarea v-model="bodyValue" class="min-h-40 w-full min-w-0 resize-y rounded-md border border-[#b8c5bd] bg-[#fffef8] p-3 font-mono text-[13px] text-[#172321] outline-none focus:border-[#0a7a69] focus:shadow-[0_0_0_3px_rgba(10,122,105,0.14)]" spellcheck="false" placeholder="{ }"></textarea>
          </section>
        </div>

        <section class="rounded-lg border border-[#cbd6ce] bg-[#fbfcf8] p-3.5">
          <div class="mb-2.5 flex items-center justify-between gap-3">
            <h3 class="m-0 text-[15px] font-bold">Request</h3>
            <button class="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#b8c5bd] bg-[#fffef8] px-2.5 text-[13px] font-extrabold text-[#203633] disabled:cursor-not-allowed disabled:opacity-60" :disabled="!curlCommand" title="Copy cURL" @click="copyCurl">
              <Clipboard :size="15" />
              cURL
            </button>
          </div>
          <pre v-if="requestPreview" class="m-0 max-h-[260px] overflow-auto whitespace-pre-wrap rounded-md bg-[#182321] p-3.5 font-mono text-[13px] leading-6 text-[#e8f3ec] [overflow-wrap:anywhere]">{{ prettyRequest }}</pre>
          <div v-else class="grid min-h-[120px] place-items-center text-center text-[#6f7d77]">{{ isPreviewing ? "Preparing request..." : "Complete the request fields to preview it." }}</div>
        </section>

        <section class="rounded-lg border border-[#cbd6ce] bg-[#fbfcf8] p-3.5">
          <div class="mb-2.5 flex justify-between gap-3">
            <h3 class="m-0 text-[15px] font-bold">Response</h3>
            <span v-if="responseView" class="font-extrabold text-[#0a7a69]">{{ responseView.response.status }} · {{ responseView.response.durationMs }} ms</span>
          </div>
          <pre v-if="responseView" class="m-0 max-h-[390px] overflow-auto whitespace-pre-wrap rounded-md bg-[#182321] p-3.5 font-mono text-[13px] leading-6 text-[#e8f3ec] [overflow-wrap:anywhere]">{{ prettyBody }}</pre>
          <div v-else class="grid min-h-[220px] place-items-center gap-2.5 text-center text-[#6f7d77]">Send an operation to see the response body.</div>
        </section>
      </div>

      <div v-else class="grid min-h-[calc(100vh-44px)] place-items-center gap-2.5 text-center text-[#6f7d77]">
        <TerminalSquare :size="34" />
        <p class="m-0">Select an operation to prepare and call it.</p>
      </div>
    </section>

    <aside :class="[panelClass, 'max-[1150px]:hidden']">
      <div :class="[eyebrowClass, 'mb-3.5 flex justify-between']">
        <span>History</span>
        <strong>{{ history.length }}</strong>
      </div>
      <div v-if="history.length === 0" class="pt-2 text-[#66736d]">No calls yet.</div>
      <button v-for="entry in history" :key="entry.id" class="grid w-full grid-cols-[44px_1fr_auto] gap-x-2 gap-y-1 border-b border-[#d7dfd8] py-2.5 text-left text-inherit hover:bg-[#eef3ec]" title="Restore request" @click="restoreHistory(entry)">
        <strong :class="entry.responseStatus && entry.responseStatus < 400 ? 'text-[#0a7a69]' : 'text-[#a03225]'">{{ entry.responseStatus ?? "ERR" }}</strong>
        <span class="truncate">{{ entry.operationId ?? "Scratch request" }}</span>
        <RotateCcw :size="14" class="mt-0.5 text-[#66736d]" />
        <small class="col-start-2 col-span-2 text-[#66736d]">{{ entry.durationMs ?? 0 }} ms · {{ new Date(entry.createdAt).toLocaleString() }}</small>
      </button>
    </aside>
  </main>
</template>
