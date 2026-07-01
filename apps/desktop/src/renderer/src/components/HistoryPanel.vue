<script setup lang="ts">
import { ChevronRight, RotateCcw } from "lucide-vue-next";
import type { CallHistoryEntry } from "@tapir/core";
import { eyebrowClass, panelClass } from "../uiClasses";

defineProps<{
  collapsed: boolean;
  history: CallHistoryEntry[];
}>();

const emit = defineEmits<{
  collapse: [value: boolean];
  restoreHistory: [entry: CallHistoryEntry];
}>();
</script>

<template>
  <aside v-if="!collapsed" :class="[panelClass, 'grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden']">
    <div :class="[eyebrowClass, 'mb-3.5 flex items-center justify-between']">
      <span>History</span>
      <span class="inline-flex items-center gap-2">
        <strong>{{ history.length }}</strong>
        <button class="rounded-md p-1.5 text-[#8f9ba5] transition hover:bg-[#20262d] hover:text-white" title="Collapse history" @click="emit('collapse', true)">
          <ChevronRight :size="17" />
        </button>
      </span>
    </div>
    <div class="min-h-0 overflow-auto">
      <div v-if="history.length === 0" class="pt-2 text-[#8f9ba5]">No calls yet.</div>
      <button v-for="entry in history" :key="entry.id" class="grid w-full grid-cols-[44px_1fr_auto] gap-x-2 gap-y-1 border-b border-[#263039] py-2.5 text-left text-inherit transition hover:bg-[#1f252b]" title="Restore request" @click="emit('restoreHistory', entry)">
        <strong :class="entry.responseStatus && entry.responseStatus < 400 ? 'text-[#43e2b2]' : 'text-[#ff8b7c]'">{{ entry.responseStatus ?? "ERR" }}</strong>
        <span class="truncate">{{ entry.operationId ?? "Scratch request" }}</span>
        <RotateCcw :size="14" class="mt-0.5 text-[#8f9ba5]" />
        <small class="col-span-2 col-start-2 text-[#8f9ba5]">{{ entry.durationMs ?? 0 }} ms · {{ new Date(entry.createdAt).toLocaleString() }}</small>
      </button>
    </div>
  </aside>
  <button v-else class="grid min-w-0 place-items-start border-l border-[#263039] bg-[#15191d] px-2 pt-7 text-[#8f9ba5]" title="Expand history" @click="emit('collapse', false)">
    <RotateCcw :size="20" />
  </button>
</template>
