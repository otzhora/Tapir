<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Beaker, ChevronRight, ClipboardPaste, MoreHorizontal, Plus, RefreshCw, Search, Server, Settings, X } from "lucide-vue-next";
import type { NormalizedOperation, ServerWithDefinition } from "@tapir/core";
import { CUSTOM_OPERATION_ID } from "../composables/useOperationRequest";
import { activeItemClass, eyebrowClass, fieldClass, iconButtonClass, itemClass, mutedTextClass, softTextClass, subtleTextClass } from "../uiClasses";
import { bridgeUnavailableMessage, getTapirBridge as getAvailableTapirBridge } from "../tapirBridge";
import MethodBadge from "./MethodBadge.vue";

const props = defineProps<{
  groupedOperations: Array<{ name: string; items: NormalizedOperation[] }>;
  operationsCount: number;
  selectedOperationId: string | null;
  selectedServerId: string | null;
  servers: ServerWithDefinition[];
}>();

const emit = defineEmits<{
  addCustomRequest: [];
  addSandboxRequest: [];
  addServer: [];
  addOperationRequest: [operation: NormalizedOperation, serverId?: string];
  serverRefreshed: [server: ServerWithDefinition, deprecatedDraftCount: number];
  configureServer: [serverId: string];
  importCurl: [];
  selectServer: [serverId: string];
  selectCustom: [];
  selectSandbox: [];
  selectOperation: [operation: NormalizedOperation, serverId?: string];
}>();

const errorMessage = ref("");
const schemaMessage = ref("");
const isMoreMenuOpen = ref(false);
const moreMenu = ref<HTMLElement | null>(null);
const refreshingServerIds = ref(new Set<string>());
const expandedServerId = ref<string | null>(props.selectedServerId);
const collapsedOperationGroups = ref(new Set<string>());
const operationSearch = ref("");
const globalSearchResults = computed(() => {
  const query = operationSearch.value.trim().toLocaleLowerCase();
  if (!query) return [];
  return props.servers
    .map((server) => ({
      server,
      operations: (server.definition?.operations ?? []).filter((operation) => [
        operation.method,
        operation.path,
        operation.summary,
        operation.operationId,
        ...operation.tags
      ].some((value) => value?.toLocaleLowerCase().includes(query)))
    }))
    .filter((result) => result.operations.length > 0);
});
const globalSearchResultCount = computed(() => globalSearchResults.value.reduce((count, result) => count + result.operations.length, 0));
const totalOperationsCount = computed(() => props.servers.reduce((count, server) => count + (server.definition?.operations.length ?? 0), 0));
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
  return !collapsedOperationGroups.value.has(operationGroupKey(groupName));
}

function focusOperationSearch(event: KeyboardEvent): void {
  if (event.key === "Escape" && isMoreMenuOpen.value) {
    isMoreMenuOpen.value = false;
    return;
  }
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (target instanceof Element && target.matches("input, textarea, select, [contenteditable='true']")) return;
  event.preventDefault();
  document.querySelector<HTMLInputElement>("input[aria-label='Search operations']")?.focus();
}

function closeMoreMenuOnOutsidePointer(event: MouseEvent): void {
  if (event.target instanceof Node && !moreMenu.value?.contains(event.target)) isMoreMenuOpen.value = false;
}

onMounted(() => {
  window.addEventListener("keydown", focusOperationSearch);
  document.addEventListener("mousedown", closeMoreMenuOnOutsidePointer);
});
onUnmounted(() => {
  window.removeEventListener("keydown", focusOperationSearch);
  document.removeEventListener("mousedown", closeMoreMenuOnOutsidePointer);
});

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
  <div class="grid content-start gap-2">
    <div class="sticky top-0 z-20 -mx-1 -mt-1 flex items-center gap-1 border-b border-[var(--tapir-border)] bg-[var(--tapir-bg-panel-opaque)] px-1 pb-2 pt-1 shadow-[0_8px_14px_var(--tapir-bg-panel-opaque)]">
      <div class="relative min-w-0 flex-1">
        <Search :size="15" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--tapir-text-subtle)]" />
        <input v-model="operationSearch" :class="[fieldClass, 'h-8 pl-8 pr-8 text-[13px]']" aria-label="Search operations" placeholder="Search all operations" title="Search every server by method, path, name, ID, or tag (/)" />
        <button v-if="operationSearch" class="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-[var(--tapir-text-muted)] hover:bg-[var(--tapir-bg-control-hover)] hover:text-[var(--tapir-text-strong)]" type="button" aria-label="Clear operation search" @click="operationSearch = ''"><X :size="14" /></button>
      </div>
      <button :class="[iconButtonClass, 'grid size-8 shrink-0 place-items-center p-0']" type="button" title="Add server" aria-label="Add server" @click="emit('addServer')"><Plus :size="19" /></button>
      <button :class="[iconButtonClass, 'grid size-8 shrink-0 place-items-center p-0']" type="button" title="Import cURL" aria-label="Import cURL" @click="emit('importCurl')"><ClipboardPaste :size="17" /></button>
      <div ref="moreMenu" class="relative">
        <button :class="[iconButtonClass, 'grid size-8 shrink-0 place-items-center p-0']" type="button" title="More sidebar actions" aria-label="More sidebar actions" :aria-expanded="isMoreMenuOpen" aria-haspopup="menu" @click="isMoreMenuOpen = !isMoreMenuOpen"><MoreHorizontal :size="19" /></button>
        <div v-if="isMoreMenuOpen" class="absolute right-0 top-9 z-30 w-52 rounded-lg border border-[var(--tapir-border-strong)] bg-[var(--tapir-bg-panel-opaque)] p-1.5 shadow-2xl" role="menu">
          <button class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] font-bold text-[var(--tapir-text-soft)] hover:bg-[var(--tapir-bg-control-hover)] disabled:opacity-50" type="button" role="menuitem" :disabled="groupedOperations.length === 0" @click="toggleAllOperationGroups(); isMoreMenuOpen = false">
            <ChevronRight :size="15" :class="['transition-transform', !areAllOperationGroupsCollapsed && 'rotate-90']" />
            {{ areAllOperationGroupsCollapsed ? "Expand operation groups" : "Collapse operation groups" }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="errorMessage" class="my-1 rounded-md border border-[var(--tapir-danger-border)] bg-[var(--tapir-danger-bg)] p-2.5 text-[13px] text-[var(--tapir-danger)]">{{ errorMessage }}</p>
    <p v-if="schemaMessage" class="my-1 rounded-md border border-[var(--tapir-method-get-border)] bg-[var(--tapir-method-get-bg)] p-2.5 text-[13px] text-[var(--tapir-success)]">{{ schemaMessage }}</p>

    <div v-if="operationSearch.trim()" class="grid gap-2 pt-1">
      <p :class="['m-0 px-2 text-[11px]', mutedTextClass]">{{ globalSearchResultCount }} of {{ totalOperationsCount }} operations across {{ servers.length }} servers</p>
      <div v-if="globalSearchResultCount === 0" :class="['grid min-h-28 place-items-center px-3 text-center text-[12px]', mutedTextClass]">No operations match “{{ operationSearch }}”.</div>
      <section v-for="result in globalSearchResults" :key="result.server.server.id" class="grid gap-0.5">
        <div :class="[eyebrowClass, 'flex items-center gap-2 px-2 py-1.5']">
          <Server :size="13" />
          <span class="min-w-0 flex-1 truncate">{{ result.server.server.name }}</span>
          <strong>{{ result.operations.length }}</strong>
        </div>
        <button v-for="operation in result.operations" :key="operation.operationId" :class="[itemClass, 'grid-cols-[auto_minmax(0,1fr)_auto] items-center px-2 py-1.5', result.server.server.id === selectedServerId && operation.operationId === selectedOperationId && activeItemClass]" :title="`${operation.method} ${operation.path} — ${operation.summary || operation.operationId}`" @click="emit('selectOperation', operation, result.server.server.id)">
          <MethodBadge :method="operation.method" />
          <span class="flex min-w-0 items-baseline gap-2 overflow-hidden">
            <strong class="truncate">{{ operation.summary || operation.operationId }}</strong>
            <small :class="['shrink truncate', mutedTextClass]">{{ operation.path }}</small>
          </span>
          <Plus :size="16" :class="['ml-auto shrink-0 hover:text-[var(--tapir-text-strong)]', mutedTextClass]" @click.stop="emit('addOperationRequest', operation, result.server.server.id)" />
        </button>
      </section>
    </div>

    <div v-else class="grid gap-2">
        <button :class="[itemClass, 'grid-cols-[28px_minmax(0,1fr)_auto] items-center px-2 py-2', selectedServerId === null && selectedOperationId === CUSTOM_OPERATION_ID && activeItemClass]" title="Standalone requests that are not attached to an OpenAPI server" @click="emit('selectSandbox')">
          <span class="grid size-7 place-items-center rounded-md bg-[var(--tapir-bg-control-hover)] text-[var(--tapir-accent)]"><Beaker :size="16" /></span>
          <span class="grid min-w-0 text-left">
            <strong class="truncate">Request Sandbox</strong>
            <small :class="['truncate', mutedTextClass]">Any URL, no server required</small>
          </span>
          <Plus :size="16" :class="['shrink-0 hover:text-[var(--tapir-text-strong)]', mutedTextClass]" @click.stop="emit('addSandboxRequest')" />
        </button>

        <div v-for="item in servers" :key="item.server.id" class="grid gap-1">
          <div :class="[itemClass, 'grid-cols-[17px_minmax(0,1fr)_24px_28px_28px] items-center px-2 py-1.5', item.server.id === selectedServerId && activeItemClass]">
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
              <strong class="ml-auto">{{ operationsCount }}</strong>
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
