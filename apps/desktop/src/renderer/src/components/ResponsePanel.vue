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
  <section class="min-h-0 overflow-hidden border-t border-[#263039] bg-[#15191d]">
    <header class="flex h-11 items-center justify-between border-b border-[#263039] px-4">
      <button class="flex items-center gap-2 font-bold text-[#cfd8d5]" @click="emit('collapse', !collapsed)">
        <ChevronDown :class="['transition-transform', collapsed && '-rotate-90']" :size="17" />
        Response
      </button>
      <span v-if="responseView" class="font-extrabold text-[#43e2b2]">{{ responseView.response.status }} · {{ responseView.response.durationMs }} ms</span>
    </header>
    <div v-if="!collapsed" class="h-[calc(100%-44px)] overflow-auto p-4">
      <pre v-if="responseView" class="code-block min-h-full">{{ prettyBody }}</pre>
      <div v-else class="grid h-full min-h-[180px] place-items-center gap-2.5 text-center text-[#8f9ba5]">Enter request details and click Send to get a response.</div>
    </div>
  </section>
</template>
