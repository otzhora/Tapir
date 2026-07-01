<script setup lang="ts">
import { ChevronLeft, ListFilter, TerminalSquare } from "lucide-vue-next";
import type { NormalizedOperation, ServerWithDefinition } from "@tapir/core";
import { activeItemClass, eyebrowClass, itemClass, panelClass } from "../uiClasses";
import MethodBadge from "./MethodBadge.vue";

defineProps<{
  collapsed: boolean;
  groupedOperations: Array<{ name: string; items: NormalizedOperation[] }>;
  operationsCount: number;
  selectedOperationId: string | null;
  selectedServer: ServerWithDefinition | null;
}>();

const emit = defineEmits<{
  collapse: [value: boolean];
  selectOperation: [operation: NormalizedOperation];
}>();
</script>

<template>
  <section :class="[panelClass, collapsed && 'overflow-hidden px-2']">
    <button v-if="collapsed" class="grid h-full w-full place-items-start pt-3 text-[#8f9ba5]" title="Expand operations" @click="emit('collapse', false)">
      <ListFilter :size="20" />
    </button>
    <template v-else>
      <div :class="[eyebrowClass, 'mb-3.5 flex items-center justify-between']">
        <span>Operations</span>
        <span class="inline-flex items-center gap-2">
          <strong>{{ operationsCount }}</strong>
          <button class="rounded-md p-1.5 text-[#8f9ba5] transition hover:bg-[#20262d] hover:text-white" title="Collapse operations" @click="emit('collapse', true)">
            <ChevronLeft :size="17" />
          </button>
        </span>
      </div>

      <div v-if="!selectedServer" class="grid min-h-[220px] place-items-center gap-2.5 text-center text-[#8f9ba5]">
        <TerminalSquare :size="30" />
        <p class="m-0">Add a deployed API server to discover its OpenAPI surface.</p>
      </div>

      <template v-else>
        <div v-for="group in groupedOperations" :key="group.name" class="grid gap-2.5">
          <h2 class="mb-0.5 mt-4 text-xs font-bold uppercase text-[#77838d]">{{ group.name }}</h2>
          <button
            v-for="operation in group.items"
            :key="operation.operationId"
            :class="[itemClass, operation.operationId === selectedOperationId && activeItemClass]"
            @click="emit('selectOperation', operation)"
          >
            <MethodBadge :method="operation.method" />
            <span class="grid min-w-0 gap-[3px]">
              <strong class="truncate">{{ operation.summary || operation.operationId }}</strong>
              <small class="truncate text-[#8f9ba5]">{{ operation.path }}</small>
            </span>
          </button>
        </div>
      </template>
    </template>
  </section>
</template>
