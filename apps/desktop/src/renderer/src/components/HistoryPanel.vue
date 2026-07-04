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
        <button class="rounded-md p-1.5 text-[#97a3ac] transition hover:bg-[#232a31] hover:text-white" title="Collapse history" @click="emit('collapse', true)">
          <ChevronRight :size="17" />
        </button>
      </span>
    </div>
    <div class="min-h-0 overflow-auto">
      <div v-if="history.length === 0" class="pt-2 text-[#97a3ac]">No calls yet.</div>
      <button v-for="entry in history" :key="entry.id" class="grid w-full grid-cols-[44px_1fr_auto] gap-x-2 gap-y-1 rounded-md border border-transparent px-2 py-2.5 text-left text-inherit transition hover:border-[#303943] hover:bg-[#1b2229]" title="Restore request" @click="emit('restoreHistory', entry)">
        <strong :class="entry.responseStatus && entry.responseStatus < 400 ? 'text-[#49d9ae]' : 'text-[#ff8b7c]'">{{ entry.responseStatus ?? "ERR" }}</strong>
        <span class="truncate">{{ entry.operationId ?? "Scratch request" }}</span>
        <RotateCcw :size="14" class="mt-0.5 text-[#97a3ac]" />
        <small class="col-span-2 col-start-2 text-[#97a3ac]">{{ entry.durationMs ?? 0 }} ms · {{ new Date(entry.createdAt).toLocaleString() }}</small>
      </button>
    </div>
  </aside>
  <button v-else class="grid min-w-0 place-items-start border-l border-[#252d35] bg-[#12171d] px-2 pt-7 text-[#97a3ac]" title="Expand history" @click="emit('collapse', false)">
    <RotateCcw :size="20" />
  </button>
</template>
