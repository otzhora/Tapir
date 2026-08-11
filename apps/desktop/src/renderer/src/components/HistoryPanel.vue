<script setup lang="ts">
import { ref } from "vue";
import { RotateCcw, Search, Trash2 } from "lucide-vue-next";
import type { CallHistoryEntry, HistoryFilter, HttpMethod, ServerWithDefinition } from "@tapir/core";
import { eyebrowClass, fieldClass, mutedTextClass } from "../uiClasses";

defineProps<{
  history: CallHistoryEntry[];
  servers: ServerWithDefinition[];
  hasMore: boolean;
  isLoading: boolean;
}>();

const emit = defineEmits<{
  restoreHistory: [entry: CallHistoryEntry];
  filterHistory: [filter: Omit<HistoryFilter, "workspaceId">];
  loadMore: [];
  deleteHistory: [id: string];
  clearHistory: [];
}>();

const serverId = ref("");
const method = ref("");
const status = ref("");
const search = ref("");
const operationId = ref("");
const createdAfter = ref("");
const createdBefore = ref("");

function applyFilters(): void {
  emit("filterHistory", {
    serverId: serverId.value === "standalone" ? null : serverId.value || undefined,
    method: method.value ? method.value as HttpMethod : undefined,
    status: status.value && Number.isInteger(Number(status.value)) ? Number(status.value) : undefined,
    operationId: operationId.value.trim() || undefined,
    search: search.value.trim() || undefined,
    createdAfter: createdAfter.value ? new Date(createdAfter.value).toISOString() : undefined,
    createdBefore: createdBefore.value ? new Date(createdBefore.value).toISOString() : undefined
  });
}

function clearAllHistory(): void {
  if (window.confirm("Clear every history entry matching the current filters? This cannot be undone.")) emit("clearHistory");
}

function deleteEntry(id: string): void {
  if (window.confirm("Delete this history entry?")) emit("deleteHistory", id);
}
</script>

<template>
  <div class="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
    <div :class="[eyebrowClass, 'mb-3 flex items-center justify-between']">
      <span>Workspace history</span>
      <strong>{{ history.length }}</strong>
    </div>
    <div class="mb-3 grid gap-2">
      <input v-model="search" :class="fieldClass" placeholder="Search URL or draft" @keyup.enter="applyFilters" />
      <div class="grid grid-cols-2 gap-2">
        <select v-model="serverId" :class="fieldClass">
          <option value="">All servers</option>
          <option value="standalone">Standalone</option>
          <option v-for="server in servers" :key="server.server.id" :value="server.server.id">{{ server.server.name }}</option>
        </select>
        <select v-model="method" :class="fieldClass">
          <option value="">Any method</option>
          <option v-for="value in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']" :key="value" :value="value">{{ value }}</option>
        </select>
      </div>
      <input v-model="operationId" :class="fieldClass" placeholder="Operation ID" @keyup.enter="applyFilters" />
      <div class="grid grid-cols-2 gap-2">
        <input v-model="createdAfter" :class="fieldClass" aria-label="History from" type="datetime-local" />
        <input v-model="createdBefore" :class="fieldClass" aria-label="History to" type="datetime-local" />
      </div>
      <div class="grid grid-cols-[1fr_auto_auto] gap-2">
        <input v-model="status" :class="fieldClass" inputmode="numeric" placeholder="Status" @keyup.enter="applyFilters" />
        <button class="mini-button" type="button" @click="applyFilters"><Search :size="14" /> Apply</button>
        <button class="mini-button text-[var(--tapir-danger)]" type="button" :disabled="history.length === 0" @click="clearAllHistory"><Trash2 :size="14" /> Clear</button>
      </div>
    </div>
    <div class="min-h-0 overflow-auto">
      <div v-if="history.length === 0" :class="['pt-2', mutedTextClass]">{{ isLoading ? "Loading history…" : "No matching calls." }}</div>
      <div v-for="entry in history" :key="entry.id" class="group grid w-full cursor-pointer grid-cols-[44px_1fr_auto] gap-x-2 gap-y-1 rounded-md border border-transparent px-2 py-2.5 text-left text-inherit transition hover:border-[var(--tapir-border-control)] hover:bg-[var(--tapir-bg-control)]" role="button" tabindex="0" title="Restore request" @click="emit('restoreHistory', entry)" @keyup.enter="emit('restoreHistory', entry)">
        <strong :class="entry.responseStatus && entry.responseStatus < 400 ? 'text-[var(--tapir-success)]' : 'text-[var(--tapir-danger)]'">{{ entry.responseStatus ?? "ERR" }}</strong>
        <span class="truncate"><strong>{{ entry.requestMethod }}</strong> {{ entry.draftName ?? entry.operationId ?? "Standalone request" }}</span>
        <span class="flex gap-1">
          <button class="icon-button opacity-40 group-hover:opacity-100 focus:opacity-100" :aria-label="`Delete ${entry.draftName ?? entry.requestUrl} from history`" title="Delete history entry" type="button" @click.stop="deleteEntry(entry.id)"><Trash2 :size="13" /></button>
          <RotateCcw :size="14" :class="['mt-1', mutedTextClass]" />
        </span>
        <small :class="['col-span-2 col-start-2 truncate', mutedTextClass]">{{ entry.requestUrl }}</small>
        <small :class="['col-span-2 col-start-2', mutedTextClass]">{{ entry.durationMs ?? 0 }} ms · {{ new Date(entry.createdAt).toLocaleString() }}</small>
      </div>
      <button v-if="hasMore" class="mini-button mt-2 w-full justify-center" type="button" :disabled="isLoading" @click="emit('loadMore')">{{ isLoading ? "Loading…" : "Load more" }}</button>
    </div>
  </div>
</template>
