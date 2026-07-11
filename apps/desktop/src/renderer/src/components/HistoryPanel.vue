<script setup lang="ts">
import { RotateCcw } from "lucide-vue-next";
import type { CallHistoryEntry } from "@tapir/core";
import { eyebrowClass, mutedTextClass } from "../uiClasses";

defineProps<{
  history: CallHistoryEntry[];
}>();

const emit = defineEmits<{
  restoreHistory: [entry: CallHistoryEntry];
}>();
</script>

<template>
  <div class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
    <div :class="[eyebrowClass, 'mb-3.5 flex items-center justify-between']">
      <span>History</span>
      <strong>{{ history.length }}</strong>
    </div>
    <div class="min-h-0 overflow-auto">
      <div v-if="history.length === 0" :class="['pt-2', mutedTextClass]">No calls yet.</div>
      <button v-for="entry in history" :key="entry.id" class="grid w-full grid-cols-[44px_1fr_auto] gap-x-2 gap-y-1 rounded-md border border-transparent px-2 py-2.5 text-left text-inherit transition hover:border-[var(--tapir-border-control)] hover:bg-[var(--tapir-bg-control)]" title="Restore request" @click="emit('restoreHistory', entry)">
        <strong :class="entry.responseStatus && entry.responseStatus < 400 ? 'text-[var(--tapir-success)]' : 'text-[var(--tapir-danger)]'">{{ entry.responseStatus ?? "ERR" }}</strong>
        <span class="truncate">{{ entry.operationId ?? "Scratch request" }}</span>
        <RotateCcw :size="14" :class="['mt-0.5', mutedTextClass]" />
        <small :class="['col-span-2 col-start-2', mutedTextClass]">{{ entry.durationMs ?? 0 }} ms · {{ new Date(entry.createdAt).toLocaleString() }}</small>
      </button>
    </div>
  </div>
</template>
