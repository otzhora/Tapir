<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { KeyRound, Plus, RefreshCw, Send, Server, TerminalSquare } from "lucide-vue-next";
import type { CallHistoryEntry, CallOperationResponse, NormalizedOperation, ServerWithDefinition, Workspace } from "@tapir/core";

const workspace = ref<Workspace | null>(null);
const servers = ref<ServerWithDefinition[]>([]);
const selectedServerId = ref<string | null>(null);
const selectedOperationId = ref<string | null>(null);
const baseUrl = ref("");
const isAddingServer = ref(false);
const isSending = ref(false);
const errorMessage = ref("");
const responseView = ref<CallOperationResponse | null>(null);
const history = ref<CallHistoryEntry[]>([]);

const parameterValues = reactive<Record<string, string>>({});
const bodyValue = ref("");
const authHeaderName = ref("x-api-key");
const authSecret = ref("");

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

const prettyBody = computed(() => {
  if (!responseView.value) return "";
  const body = responseView.value.response.body;
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
});

onMounted(async () => {
  await loadInitialState();
});

watch(selectedServerId, async (serverId) => {
  selectedOperationId.value = operations.value[0]?.operationId ?? null;
  responseView.value = null;
  clearParameterValues();
  history.value = serverId ? await window.tapir.listHistory(serverId) : [];
});

watch(selectedOperation, () => {
  clearParameterValues();
  bodyValue.value = "";
});

async function loadInitialState(): Promise<void> {
  const state = await window.tapir.getInitialState();
  workspace.value = state.workspace;
  servers.value = state.servers;
  selectedServerId.value = servers.value[0]?.server.id ?? null;
}

async function addServer(): Promise<void> {
  errorMessage.value = "";
  isAddingServer.value = true;
  try {
    const result = await window.tapir.addServer(baseUrl.value);
    servers.value = [{ server: result.server, definition: result.normalized }, ...servers.value];
    selectedServerId.value = result.server.id;
    baseUrl.value = "";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isAddingServer.value = false;
  }
}

async function callOperation(): Promise<void> {
  if (!selectedServer.value || !selectedOperation.value) return;
  errorMessage.value = "";
  isSending.value = true;
  try {
    if (authSecret.value.trim()) {
      await window.tapir.saveApiKeyHeader({
        serverId: selectedServer.value.server.id,
        headerName: authHeaderName.value,
        secretValue: authSecret.value
      });
    }
    responseView.value = await window.tapir.callOperation({
      serverId: selectedServer.value.server.id,
      operation: selectedOperation.value,
      values: { ...parameterValues },
      body: bodyValue.value,
      apiKeyHeaderName: authHeaderName.value,
      apiKeyValue: authSecret.value
    });
    history.value = await window.tapir.listHistory(selectedServer.value.server.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isSending.value = false;
  }
}

function selectOperation(operation: NormalizedOperation): void {
  selectedOperationId.value = operation.operationId;
}

function clearParameterValues(): void {
  for (const key of Object.keys(parameterValues)) {
    delete parameterValues[key];
  }
}
</script>

<template>
  <main class="shell">
    <aside class="servers-panel">
      <div class="brand-row">
        <div class="brand-mark">T</div>
        <div>
          <h1>Tapir</h1>
          <p>{{ workspace?.name ?? "Local Workspace" }}</p>
        </div>
      </div>

      <form class="add-server" @submit.prevent="addServer">
        <label for="base-url">Add Server</label>
        <div class="url-row">
          <input id="base-url" v-model="baseUrl" placeholder="https://api.example.com" required />
          <button type="submit" :disabled="isAddingServer || !baseUrl.trim()" title="Discover spec">
            <RefreshCw v-if="isAddingServer" :size="17" class="spin" />
            <Plus v-else :size="18" />
          </button>
        </div>
      </form>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

      <div class="server-list">
        <button
          v-for="item in servers"
          :key="item.server.id"
          class="server-item"
          :class="{ active: item.server.id === selectedServerId }"
          @click="selectedServerId = item.server.id"
        >
          <Server :size="17" />
          <span>
            <strong>{{ item.server.name }}</strong>
            <small>{{ item.server.baseUrl }}</small>
          </span>
        </button>
      </div>
    </aside>

    <section class="operations-panel">
      <div class="panel-title">
        <span>Operations</span>
        <strong>{{ operations.length }}</strong>
      </div>

      <div v-if="!selectedServer" class="empty">
        <TerminalSquare :size="30" />
        <p>Add a deployed API server to discover its OpenAPI surface.</p>
      </div>

      <template v-else>
        <div v-for="group in groupedOperations" :key="group.name" class="operation-group">
          <h2>{{ group.name }}</h2>
          <button
            v-for="operation in group.items"
            :key="operation.operationId"
            class="operation-item"
            :class="{ active: operation.operationId === selectedOperationId }"
            @click="selectOperation(operation)"
          >
            <span class="method" :data-method="operation.method">{{ operation.method }}</span>
            <span>
              <strong>{{ operation.summary || operation.operationId }}</strong>
              <small>{{ operation.path }}</small>
            </span>
          </button>
        </div>
      </template>
    </section>

    <section class="request-panel">
      <div v-if="selectedOperation && selectedServer" class="request-layout">
        <header class="request-header">
          <div>
            <div class="route-line">
              <span class="method" :data-method="selectedOperation.method">{{ selectedOperation.method }}</span>
              <h2>{{ selectedOperation.path }}</h2>
            </div>
            <p>{{ selectedOperation.summary || selectedOperation.description || selectedOperation.operationId }}</p>
          </div>
          <button class="send-button" :disabled="isSending" @click="callOperation">
            <Send :size="17" />
            {{ isSending ? "Sending" : "Send" }}
          </button>
        </header>

        <div class="request-grid">
          <section class="tool-section">
            <h3>Parameters</h3>
            <div v-if="selectedOperation.parameters.length === 0" class="quiet">No parameters declared by the spec.</div>
            <label v-for="parameter in selectedOperation.parameters" :key="`${parameter.in}:${parameter.name}`" class="field-row">
              <span>{{ parameter.name }} <small>{{ parameter.in }}{{ parameter.required ? " required" : "" }}</small></span>
              <input v-model="parameterValues[parameter.name]" :placeholder="parameter.description || parameter.name" />
            </label>
          </section>

          <section class="tool-section">
            <h3><KeyRound :size="16" /> API Key Header</h3>
            <label class="field-row">
              <span>Header name</span>
              <input v-model="authHeaderName" placeholder="x-api-key" />
            </label>
            <label class="field-row">
              <span>Secret value</span>
              <input v-model="authSecret" type="password" placeholder="Stored locally for this server" />
            </label>
          </section>

          <section v-if="selectedOperation.method !== 'GET'" class="tool-section span-two">
            <h3>Body</h3>
            <textarea v-model="bodyValue" spellcheck="false" placeholder="{ }"></textarea>
          </section>
        </div>

        <section class="response-section">
          <div class="response-title">
            <h3>Response</h3>
            <span v-if="responseView">{{ responseView.response.status }} · {{ responseView.response.durationMs }} ms</span>
          </div>
          <pre v-if="responseView">{{ prettyBody }}</pre>
          <div v-else class="empty-response">Send an operation to see the response body.</div>
        </section>
      </div>

      <div v-else class="empty large">
        <TerminalSquare :size="34" />
        <p>Select an operation to prepare and call it.</p>
      </div>
    </section>

    <aside class="history-panel">
      <div class="panel-title">
        <span>History</span>
        <strong>{{ history.length }}</strong>
      </div>
      <div v-if="history.length === 0" class="quiet history-empty">No calls yet.</div>
      <div v-for="entry in history" :key="entry.id" class="history-item">
        <strong>{{ entry.responseStatus ?? "ERR" }}</strong>
        <span>{{ entry.operationId ?? "Scratch request" }}</span>
        <small>{{ entry.durationMs ?? 0 }} ms</small>
      </div>
    </aside>
  </main>
</template>
