<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Beaker, ChevronRight, Plus, RefreshCw, Search, Server, Settings, X } from "lucide-vue-next";
import type { NormalizedOperation, ServerWithDefinition, Workspace } from "@tapir/core";
import { CUSTOM_OPERATION_ID } from "../composables/useOperationRequest";
import { activeItemClass, eyebrowClass, fieldClass, iconButtonClass, itemClass, mutedTextClass, primaryActionClass, softTextClass, strongTextClass, subtleTextClass } from "../uiClasses";
import { bridgeUnavailableMessage, getTapirBridge as getAvailableTapirBridge } from "../tapirBridge";
import MethodBadge from "./MethodBadge.vue";

const props = defineProps<{
  groupedOperations: Array<{ name: string; items: NormalizedOperation[] }>;
  operationsCount: number;
  selectedOperationId: string | null;
  selectedServerId: string | null;
  servers: ServerWithDefinition[];
  workspace: Workspace | null;
}>();

const emit = defineEmits<{
  addCustomRequest: [];
  addSandboxRequest: [];
  addOperationRequest: [operation: NormalizedOperation];
  serverAdded: [server: ServerWithDefinition];
  serverRefreshed: [server: ServerWithDefinition, deprecatedDraftCount: number];
  configureServer: [serverId: string];
  selectServer: [serverId: string];
  selectCustom: [];
  selectSandbox: [];
  selectOperation: [operation: NormalizedOperation];
}>();

const baseUrl = ref("");
const specUrl = ref("");
const errorMessage = ref("");
const schemaMessage = ref("");
const isAddingServer = ref(false);
const refreshingServerIds = ref(new Set<string>());
const expandedServerId = ref<string | null>(props.selectedServerId);
const collapsedOperationGroups = ref(new Set<string>());
const operationSearch = ref("");
const filteredOperationGroups = computed(() => {
  const query = operationSearch.value.trim().toLocaleLowerCase();
  if (!query) return props.groupedOperations;
  return props.groupedOperations
    .map((group) => ({
      ...group,
      items: group.items.filter((operation) => [
        operation.method,
        operation.path,
        operation.summary,
        operation.operationId,
        ...operation.tags
      ].some((value) => value?.toLocaleLowerCase().includes(query)))
    }))
    .filter((group) => group.items.length > 0);
});
const filteredOperationsCount = computed(() => filteredOperationGroups.value.reduce((count, group) => count + group.items.length, 0));
const areAllOperationGroupsCollapsed = computed(() => props.groupedOperations.length > 0
  && props.groupedOperations.every((group) => !isOperationGroupExpanded(group.name)));

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

function operationGroupKey(groupName: string): string {
  return `${props.selectedServerId ?? ""}:${groupName}`;
}

function isOperationGroupExpanded(groupName: string): boolean {
  return Boolean(operationSearch.value.trim()) || !collapsedOperationGroups.value.has(operationGroupKey(groupName));
}

function focusOperationSearch(event: KeyboardEvent): void {
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (target instanceof Element && target.matches("input, textarea, select, [contenteditable='true']")) return;
  event.preventDefault();
  document.querySelector<HTMLInputElement>("input[aria-label='Search operations']")?.focus();
}

onMounted(() => window.addEventListener("keydown", focusOperationSearch));
onUnmounted(() => window.removeEventListener("keydown", focusOperationSearch));

function toggleOperationGroup(groupName: string): void {
  const key = operationGroupKey(groupName);
  const next = new Set(collapsedOperationGroups.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsedOperationGroups.value = next;
}

function toggleAllOperationGroups(): void {
  const next = new Set(collapsedOperationGroups.value);
  for (const group of props.groupedOperations) {
    const key = operationGroupKey(group.name);
    if (areAllOperationGroupsCollapsed.value) next.delete(key);
    else next.add(key);
  }
  collapsedOperationGroups.value = next;
}

async function addServer(): Promise<void> {
  errorMessage.value = "";
  const tapir = getTapirBridge();
  if (!tapir) return;
  isAddingServer.value = true;
  try {
    const explicitSpecUrl = specUrl.value.trim();
    const result = explicitSpecUrl
      ? await tapir.addServer(baseUrl.value, explicitSpecUrl)
      : await tapir.addServer(baseUrl.value);
    const server = { server: result.server, definition: result.normalized, variables: [], authentication: [] };
    emit("serverAdded", server);
    emit("selectServer", result.server.id);
    baseUrl.value = "";
    specUrl.value = "";
  } catch (error) {
    errorMessage.value = toErrorMessage(error);
  } finally {
    isAddingServer.value = false;
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
    const server = { server: result.server, definition: result.normalized, variables: existing?.variables ?? [], authentication: existing?.authentication ?? [] };
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

      <form class="mb-4 grid gap-2" @submit.prevent="addServer">
        <label for="base-url" :class="eyebrowClass">Server base URL</label>
        <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input id="base-url" v-model="baseUrl" :class="fieldClass" placeholder="https://api.example.com" required />
          <button :class="[primaryActionClass, 'h-9 px-3']" type="submit" :disabled="isAddingServer || !baseUrl.trim()">
            <RefreshCw v-if="isAddingServer" :size="17" class="animate-spin" />
            <Plus v-else :size="18" />
            {{ isAddingServer ? "Discovering" : "Add" }}
          </button>
        </div>
        <p :class="['m-0 text-[11px] leading-4', mutedTextClass]">Tapir discovers common OpenAPI URLs automatically.</p>
        <label for="spec-url" :class="eyebrowClass">OpenAPI URL <span class="normal-case font-medium">(optional)</span></label>
        <input id="spec-url" v-model="specUrl" :class="fieldClass" placeholder="https://docs.example.com/openapi.json" />
        <p :class="['m-0 text-[11px] leading-4', mutedTextClass]">Use this when the document lives at a custom URL.</p>
      </form>

      <p v-if="errorMessage" class="my-2.5 rounded-md border border-[var(--tapir-danger-border)] bg-[var(--tapir-danger-bg)] p-2.5 text-[13px] text-[var(--tapir-danger)]">{{ errorMessage }}</p>
      <p v-if="schemaMessage" class="my-2.5 rounded-md border border-[var(--tapir-method-get-border)] bg-[var(--tapir-method-get-bg)] p-2.5 text-[13px] text-[var(--tapir-success)]">{{ schemaMessage }}</p>

      <div class="grid gap-2">
        <button :class="[itemClass, 'grid-cols-[28px_minmax(0,1fr)_auto] items-center px-2 py-2', selectedServerId === null && selectedOperationId === CUSTOM_OPERATION_ID && activeItemClass]" title="Standalone requests that are not attached to an OpenAPI server" @click="emit('selectSandbox')">
          <span class="grid size-7 place-items-center rounded-md bg-[var(--tapir-bg-control-hover)] text-[var(--tapir-accent)]"><Beaker :size="16" /></span>
          <span class="grid min-w-0 text-left">
            <strong class="truncate">Request Sandbox</strong>
            <small :class="['truncate', mutedTextClass]">Any URL, no server required</small>
          </span>
          <Plus :size="16" :class="['shrink-0 hover:text-[var(--tapir-text-strong)]', mutedTextClass]" @click.stop="emit('addSandboxRequest')" />
        </button>

        <div v-for="item in servers" :key="item.server.id" class="grid gap-1">
          <div :class="[itemClass, 'grid-cols-[17px_minmax(0,1fr)_24px_28px_28px] items-center px-2 py-1.5', item.server.id === selectedServerId && activeItemClass, item.server.id === selectedServerId && 'sticky-server-header sticky top-0 z-10']">
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
            <button :class="['grid size-7 place-items-center', iconButtonClass]" title="Configure server" @click="emit('configureServer', item.server.id)">
              <Settings :size="15" />
            </button>
          </div>

          <div v-if="item.server.id === selectedServerId && expandedServerId === item.server.id" class="ml-3 grid gap-0.5 border-l border-[var(--tapir-border)] pl-2">
            <div :class="[eyebrowClass, 'mb-0.5 flex items-center gap-2 px-2 py-1']">
              <span>Operations</span>
              <button
                class="ml-auto rounded px-1.5 py-0.5 normal-case transition hover:bg-[var(--tapir-bg-control)] hover:text-[var(--tapir-text-strong)] disabled:cursor-default disabled:opacity-50"
                :disabled="groupedOperations.length === 0"
                :title="areAllOperationGroupsCollapsed ? 'Expand all schema sections' : 'Collapse all schema sections'"
                type="button"
                @click="toggleAllOperationGroups"
              >
                {{ areAllOperationGroupsCollapsed ? "Expand all" : "Collapse all" }}
              </button>
              <strong>{{ operationsCount }}</strong>
            </div>
            <div class="relative mb-1 px-1">
              <Search :size="14" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tapir-text-subtle)]" />
              <input v-model="operationSearch" :class="[fieldClass, 'pl-8 pr-8']" aria-label="Search operations" placeholder="Search operations…" title="Search by method, path, name, ID, or tag (/)" />
              <button v-if="operationSearch" class="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-[var(--tapir-text-muted)] hover:bg-[var(--tapir-bg-control-hover)] hover:text-[var(--tapir-text-strong)]" type="button" aria-label="Clear operation search" @click="operationSearch = ''"><X :size="14" /></button>
            </div>
            <p v-if="operationSearch" :class="['m-0 px-2 text-[11px]', mutedTextClass]">{{ filteredOperationsCount }} of {{ operationsCount }} operations</p>
            <button :class="[itemClass, 'grid-cols-[auto_minmax(0,1fr)_auto] items-center px-2 py-1.5', selectedOperationId === CUSTOM_OPERATION_ID && activeItemClass]" @click="emit('selectCustom')">
              <span :class="['grid h-6 w-[58px] place-items-center rounded bg-[var(--tapir-bg-control-hover)] text-[11px] font-black', softTextClass]">HTTP</span>
              <span class="flex min-w-0 items-baseline gap-2 overflow-hidden">
                <strong class="shrink-0 truncate">Custom requests</strong>
                <small :class="['truncate', mutedTextClass]">Any method and URL</small>
              </span>
              <Plus :size="16" :class="['ml-auto shrink-0 hover:text-[var(--tapir-text-strong)]', mutedTextClass]" @click.stop="emit('addCustomRequest')" />
            </button>

            <div v-if="operationSearch && filteredOperationsCount === 0" :class="['grid min-h-24 place-items-center px-3 text-center text-[12px]', mutedTextClass]">No operations match “{{ operationSearch }}”.</div>
            <div v-for="group in filteredOperationGroups" :key="group.name" class="grid gap-0.5">
              <button
                :aria-expanded="isOperationGroupExpanded(group.name)"
                :class="['mt-1.5 flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[11px] font-bold uppercase transition hover:bg-[var(--tapir-bg-control)] hover:text-[var(--tapir-text-strong)]', subtleTextClass]"
                type="button"
                @click="toggleOperationGroup(group.name)"
              >
                <ChevronRight :size="13" :class="['shrink-0 transition-transform', isOperationGroupExpanded(group.name) && 'rotate-90']" />
                <span class="min-w-0 flex-1 truncate">{{ group.name }}</span>
                <span>{{ group.items.length }}</span>
              </button>
              <template v-if="isOperationGroupExpanded(group.name)">
                <button v-for="operation in group.items" :key="operation.operationId" :class="[itemClass, 'grid-cols-[auto_minmax(0,1fr)_auto] items-center px-2 py-1.5', operation.operationId === selectedOperationId && activeItemClass]" :title="`${operation.method} ${operation.path} — ${operation.summary || operation.operationId}`" @click="emit('selectOperation', operation)">
                  <MethodBadge :method="operation.method" />
                  <span class="flex min-w-0 items-baseline gap-2 overflow-hidden">
                    <strong class="truncate">{{ operation.summary || operation.operationId }}</strong>
                    <small :class="['shrink truncate', mutedTextClass]">{{ operation.path }}</small>
                  </span>
                  <Plus :size="16" :class="['ml-auto shrink-0 hover:text-[var(--tapir-text-strong)]', mutedTextClass]" @click.stop="emit('addOperationRequest', operation)" />
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>

  </div>
</template>
