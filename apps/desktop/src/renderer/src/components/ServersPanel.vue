<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronRight, Plus, RefreshCw, Save, Server, Trash2, Variable } from "lucide-vue-next";
import type { NormalizedOperation, ServerVariable, ServerWithDefinition, Workspace } from "@tapir/core";
import { CUSTOM_OPERATION_ID } from "../composables/useOperationRequest";
import { activeItemClass, eyebrowClass, fieldClass, iconButtonClass, itemClass, mutedTextClass, primaryActionClass, softTextClass, strongTextClass, subtleTextClass } from "../uiClasses";
import { bridgeUnavailableMessage, getTapirBridge as getAvailableTapirBridge } from "../tapirBridge";
import MethodBadge from "./MethodBadge.vue";

const props = defineProps<{
  groupedOperations: Array<{ name: string; items: NormalizedOperation[] }>;
  operationsCount: number;
  selectedOperationId: string | null;
  selectedServerId: string | null;
  selectedServer: ServerWithDefinition | null;
  servers: ServerWithDefinition[];
  workspace: Workspace | null;
}>();

const emit = defineEmits<{
  addCustomRequest: [];
  addOperationRequest: [operation: NormalizedOperation];
  serverAdded: [server: ServerWithDefinition];
  serverRefreshed: [server: ServerWithDefinition, deprecatedDraftCount: number];
  serverVariablesSaved: [serverId: string, variables: ServerVariable[]];
  selectServer: [serverId: string];
  selectCustom: [];
  selectOperation: [operation: NormalizedOperation];
}>();

const baseUrl = ref("");
const errorMessage = ref("");
const schemaMessage = ref("");
const isAddingServer = ref(false);
const isSavingVariables = ref(false);
const refreshingServerIds = ref(new Set<string>());
const variableDrafts = ref<Array<{ id?: string; key: string; value: string }>>([]);
const expandedServerId = ref<string | null>(props.selectedServerId);
const selectedServer = computed(() => props.servers.find((item) => item.server.id === props.selectedServerId) ?? null);

watch(selectedServer, (server) => {
  variableDrafts.value = (server?.variables ?? []).map((variable) => ({ id: variable.id, key: variable.key, value: variable.value }));
}, { immediate: true });

watch(() => props.selectedServerId, (serverId, previousServerId) => {
  if (serverId !== previousServerId) expandedServerId.value = serverId;
});

function activateServer(serverId: string): void {
  if (serverId === props.selectedServerId) {
    expandedServerId.value = expandedServerId.value === serverId ? null : serverId;
    return;
  }
  expandedServerId.value = serverId;
  emit("selectServer", serverId);
}

async function addServer(): Promise<void> {
  errorMessage.value = "";
  const tapir = getTapirBridge();
  if (!tapir) return;
  isAddingServer.value = true;
  try {
    const result = await tapir.addServer(baseUrl.value);
    const server = { server: result.server, definition: result.normalized, variables: [] };
    emit("serverAdded", server);
    emit("selectServer", result.server.id);
    baseUrl.value = "";
  } catch (error) {
    errorMessage.value = toErrorMessage(error);
  } finally {
    isAddingServer.value = false;
  }
}

function addVariable(): void {
  variableDrafts.value = [...variableDrafts.value, { key: "", value: "" }];
}

function removeVariable(index: number): void {
  variableDrafts.value = variableDrafts.value.filter((_variable, candidateIndex) => candidateIndex !== index);
}

async function saveVariables(): Promise<void> {
  if (!props.selectedServerId) return;
  errorMessage.value = "";
  schemaMessage.value = "";
  const tapir = getTapirBridge();
  if (!tapir) return;
  isSavingVariables.value = true;
  try {
    const result = await tapir.saveServerVariables({
      serverId: props.selectedServerId,
      variables: variableDrafts.value.map((variable) => ({
        id: variable.id,
        key: variable.key,
        value: variable.value
      }))
    });
    emit("serverVariablesSaved", props.selectedServerId, result.variables);
    schemaMessage.value = "Variables saved.";
  } catch (error) {
    errorMessage.value = toErrorMessage(error);
  } finally {
    isSavingVariables.value = false;
  }
}

async function refreshServer(serverId: string): Promise<void> {
  errorMessage.value = "";
  schemaMessage.value = "";
  const tapir = getTapirBridge();
  if (!tapir) return;
  refreshingServerIds.value = new Set([...refreshingServerIds.value, serverId]);
  try {
    const result = await tapir.refreshServerSchema(serverId);
    const existing = props.servers.find((item) => item.server.id === serverId);
    const server = { server: result.server, definition: result.normalized, variables: existing?.variables ?? [] };
    emit("serverRefreshed", server, result.deprecatedDrafts.length);
    schemaMessage.value = result.deprecatedDrafts.length > 0
      ? `Schema refreshed. ${result.deprecatedDrafts.length} saved request${result.deprecatedDrafts.length === 1 ? "" : "s"} moved to Custom.`
      : "Schema refreshed.";
  } catch (error) {
    errorMessage.value = toErrorMessage(error);
  } finally {
    const next = new Set(refreshingServerIds.value);
    next.delete(serverId);
    refreshingServerIds.value = next;
  }
}

function getTapirBridge() {
  const tapir = getAvailableTapirBridge();
  if (!tapir) errorMessage.value = bridgeUnavailableMessage;
  return tapir;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
</script>

<template>
  <div class="grid content-start gap-5">
      <div class="mb-5 flex items-center gap-3">
        <div class="grid size-9 place-items-center rounded-md border border-[var(--tapir-border-control)] bg-[var(--tapir-accent)] font-black text-[var(--tapir-accent-contrast)] shadow-[var(--tapir-brand-shadow)]">T</div>
        <div>
          <h1 :class="['m-0 text-[20px] font-bold', strongTextClass]">Tapir</h1>
          <p :class="['m-0 text-[13px]', mutedTextClass]">{{ workspace?.name ?? "Local Workspace" }}</p>
        </div>
      </div>

      <form class="mb-4 grid gap-2.5" @submit.prevent="addServer">
        <label for="base-url" :class="eyebrowClass">Add Server</label>
        <div class="grid grid-cols-[minmax(0,1fr)_44px] gap-2.5">
          <input id="base-url" v-model="baseUrl" :class="fieldClass" placeholder="https://api.example.com" required />
          <button :class="[primaryActionClass, 'h-9']" type="submit" :disabled="isAddingServer || !baseUrl.trim()" title="Discover spec">
            <RefreshCw v-if="isAddingServer" :size="17" class="animate-spin" />
            <Plus v-else :size="18" />
          </button>
        </div>
      </form>

      <p v-if="errorMessage" class="my-2.5 rounded-md border border-[var(--tapir-danger-border)] bg-[var(--tapir-danger-bg)] p-2.5 text-[13px] text-[var(--tapir-danger)]">{{ errorMessage }}</p>
      <p v-if="schemaMessage" class="my-2.5 rounded-md border border-[var(--tapir-method-get-border)] bg-[var(--tapir-method-get-bg)] p-2.5 text-[13px] text-[var(--tapir-success)]">{{ schemaMessage }}</p>

      <div class="grid gap-2">
        <div v-for="item in servers" :key="item.server.id" class="grid gap-1">
          <div :class="[itemClass, 'grid-cols-[17px_minmax(0,1fr)_24px_28px] items-center px-2 py-1.5', item.server.id === selectedServerId && activeItemClass, item.server.id === selectedServerId && 'sticky-server-header sticky top-0 z-10']">
            <Server :size="17" />
            <button class="flex min-w-0 items-baseline gap-2 overflow-hidden text-left" :title="`${item.server.name} — ${item.server.baseUrl}`" @click="activateServer(item.server.id)">
              <strong class="truncate">{{ item.server.name }}</strong>
              <small :class="['shrink truncate', mutedTextClass]">{{ item.server.baseUrl }}</small>
            </button>
            <button v-if="item.server.id === selectedServerId" :class="['grid size-6 place-items-center', iconButtonClass]" title="Toggle server operations" @click="activateServer(item.server.id)">
              <ChevronRight :size="15" :class="['transition-transform', expandedServerId === item.server.id && 'rotate-90']" />
            </button>
            <span v-else></span>
            <button :class="['grid size-7 place-items-center disabled:cursor-not-allowed disabled:opacity-60', iconButtonClass]" title="Refresh OpenAPI schema" :disabled="refreshingServerIds.has(item.server.id)" @click="refreshServer(item.server.id)">
              <RefreshCw :size="15" :class="refreshingServerIds.has(item.server.id) && 'animate-spin'" />
            </button>
          </div>

          <div v-if="item.server.id === selectedServerId && expandedServerId === item.server.id" class="ml-3 grid gap-0.5 border-l border-[var(--tapir-border)] pl-2">
            <div :class="[eyebrowClass, 'mb-0.5 flex items-center justify-between px-2 py-1']">
              <span>Operations</span>
              <strong>{{ operationsCount }}</strong>
            </div>
            <button :class="[itemClass, 'grid-cols-[auto_minmax(0,1fr)_auto] items-center px-2 py-1.5', selectedOperationId === CUSTOM_OPERATION_ID && activeItemClass]" @click="emit('selectCustom')">
              <span :class="['grid h-6 w-[58px] place-items-center rounded bg-[var(--tapir-bg-control-hover)] text-[11px] font-black', softTextClass]">HTTP</span>
              <span class="flex min-w-0 items-baseline gap-2 overflow-hidden">
                <strong class="shrink-0 truncate">Custom requests</strong>
                <small :class="['truncate', mutedTextClass]">Any method and URL</small>
              </span>
              <Plus :size="16" :class="['ml-auto shrink-0 hover:text-[var(--tapir-text-strong)]', mutedTextClass]" @click.stop="emit('addCustomRequest')" />
            </button>

            <div v-for="group in groupedOperations" :key="group.name" class="grid gap-0.5">
              <h2 :class="['mb-0 mt-1.5 px-2 py-1 text-[11px] font-bold uppercase', subtleTextClass]">{{ group.name }}</h2>
              <button v-for="operation in group.items" :key="operation.operationId" :class="[itemClass, 'grid-cols-[auto_minmax(0,1fr)_auto] items-center px-2 py-1.5', operation.operationId === selectedOperationId && activeItemClass]" :title="`${operation.method} ${operation.path} — ${operation.summary || operation.operationId}`" @click="emit('selectOperation', operation)">
                <MethodBadge :method="operation.method" />
                <span class="flex min-w-0 items-baseline gap-2 overflow-hidden">
                  <strong class="truncate">{{ operation.summary || operation.operationId }}</strong>
                  <small :class="['shrink truncate', mutedTextClass]">{{ operation.path }}</small>
                </span>
                <Plus :size="16" :class="['ml-auto shrink-0 hover:text-[var(--tapir-text-strong)]', mutedTextClass]" @click.stop="emit('addOperationRequest', operation)" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <section v-if="selectedServer" class="mt-4 grid gap-2.5 border-t border-[var(--tapir-border)] pt-4">
        <div class="flex items-center gap-2">
          <Variable :size="15" :class="mutedTextClass" />
          <h2 :class="['m-0 text-[13px] font-black', strongTextClass]">Variables</h2>
          <button class="mini-button ml-auto" type="button" @click="addVariable"><Plus :size="14" /> Add</button>
        </div>
        <div class="grid gap-2">
          <div v-for="(variable, index) in variableDrafts" :key="variable.id ?? index" class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] gap-2">
            <input v-model="variable.key" :class="fieldClass" placeholder="baseUrl" />
            <input v-model="variable.value" :class="fieldClass" placeholder="https://api.example.com" />
            <button :class="['grid size-9 place-items-center', iconButtonClass]" title="Remove variable" type="button" @click="removeVariable(index)">
              <Trash2 :size="15" />
            </button>
          </div>
          <div v-if="variableDrafts.length === 0" :class="['rounded-md border border-[var(--tapir-border-control)] bg-[var(--tapir-bg-panel-muted)] p-3 text-[13px]', mutedTextClass]">No variables yet.</div>
        </div>
        <button :class="[primaryActionClass, 'h-9 w-full']" type="button" :disabled="isSavingVariables || !selectedServer" @click="saveVariables">
          <RefreshCw v-if="isSavingVariables" :size="16" class="animate-spin" />
          <Save v-else :size="16" />
          Save variables
        </button>
      </section>

  </div>
</template>
