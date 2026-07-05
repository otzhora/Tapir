<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";
import type { CallOperationResponse } from "@tapir/core";

defineProps<{
  collapsed: boolean;
  prettyBody: string;
  responseView: CallOperationResponse | null;
}>();

const emit = defineEmits<{
  collapse: [value: boolean];
}>();
</script>

<template>
  <section class="min-h-0 overflow-hidden border-t border-[var(--tapir-border)] bg-[var(--tapir-bg-panel-soft)] backdrop-blur-xl">
    <header class="flex h-11 items-center justify-between border-b border-[var(--tapir-border)] bg-[var(--tapir-bg-panel-strong)] px-4 backdrop-blur-xl">
      <button class="flex items-center gap-2 font-bold text-[var(--tapir-text-soft)]" @click="emit('collapse', !collapsed)">
        <ChevronDown :class="['transition-transform', collapsed && '-rotate-90']" :size="17" />
        Response
      </button>
      <span v-if="responseView" class="font-extrabold text-[var(--tapir-success)]">{{ responseView.response.status }} · {{ responseView.response.durationMs }} ms</span>
    </header>
    <div v-if="!collapsed" class="h-[calc(100%-44px)] overflow-auto p-4">
      <pre v-if="responseView" class="code-block min-h-full">{{ prettyBody }}</pre>
      <div v-else class="empty-state h-full min-h-[180px]">Enter request details and click Send to get a response.</div>
    </div>
  </section>
</template>
