<script setup lang="ts">
import { ref } from "vue";
import { ChevronLeft, Plus, RefreshCw, Server } from "lucide-vue-next";
import type { ServerWithDefinition, Workspace } from "@tapir/core";
import { activeItemClass, eyebrowClass, fieldClass, iconButtonClass, itemClass, mutedTextClass, panelClass, primaryActionClass, strongTextClass } from "../uiClasses";
import { bridgeUnavailableMessage, getTapirBridge as getAvailableTapirBridge } from "../tapirBridge";

defineProps<{
  collapsed: boolean;
  selectedServerId: string | null;
  servers: ServerWithDefinition[];
  workspace: Workspace | null;
}>();

const emit = defineEmits<{
  collapse: [value: boolean];
  serverAdded: [server: ServerWithDefinition];
  serverRefreshed: [server: ServerWithDefinition, deprecatedDraftCount: number];
  selectServer: [serverId: string];
}>();

const baseUrl = ref("");
const errorMessage = ref("");
const schemaMessage = ref("");
const isAddingServer = ref(false);
const refreshingServerIds = ref(new Set<string>());

async function addServer(): Promise<void> {
  errorMessage.value = "";
  const tapir = getTapirBridge();
  if (!tapir) return;
  isAddingServer.value = true;
  try {
    const result = await tapir.addServer(baseUrl.value);
    const server = { server: result.server, definition: result.normalized };
    emit("serverAdded", server);
    emit("selectServer", result.server.id);
    baseUrl.value = "";
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
    const server = { server: result.server, definition: result.normalized };
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
  <aside :class="[panelClass, collapsed && 'overflow-hidden px-2']">
    <button v-if="collapsed" :class="['grid h-full w-full place-items-start pt-3', mutedTextClass]" title="Expand servers" @click="emit('collapse', false)">
      <Server :size="20" />
    </button>
    <template v-else>
      <div class="mb-5 flex items-center gap-3">
        <div class="grid size-9 place-items-center rounded-md border border-[var(--tapir-border-control)] bg-[var(--tapir-accent)] font-black text-[var(--tapir-accent-contrast)] shadow-[var(--tapir-brand-shadow)]">T</div>
        <div>
          <h1 :class="['m-0 text-[20px] font-bold', strongTextClass]">Tapir</h1>
          <p :class="['m-0 text-[13px]', mutedTextClass]">{{ workspace?.name ?? "Local Workspace" }}</p>
        </div>
        <button :class="['ml-auto', iconButtonClass]" title="Collapse servers" @click="emit('collapse', true)">
          <ChevronLeft :size="17" />
        </button>
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

      <div class="grid gap-2.5">
        <div
          v-for="item in servers"
          :key="item.server.id"
          :class="[itemClass, 'grid-cols-[17px_minmax(0,1fr)_28px]', item.server.id === selectedServerId && activeItemClass]"
        >
          <Server :size="17" />
          <button class="grid min-w-0 gap-[3px] text-left" @click="emit('selectServer', item.server.id)">
            <strong class="truncate">{{ item.server.name }}</strong>
            <small :class="['truncate', mutedTextClass]">{{ item.server.baseUrl }}</small>
          </button>
          <button :class="['grid size-7 place-items-center disabled:cursor-not-allowed disabled:opacity-60', iconButtonClass]" title="Refresh OpenAPI schema" :disabled="refreshingServerIds.has(item.server.id)" @click="refreshServer(item.server.id)">
            <RefreshCw :size="15" :class="refreshingServerIds.has(item.server.id) && 'animate-spin'" />
          </button>
        </div>
      </div>
    </template>
  </aside>
</template>
