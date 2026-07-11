<script setup lang="ts">
import { ChevronLeft, ListFilter, Plus, TerminalSquare } from "lucide-vue-next";
import type { NormalizedOperation, ServerWithDefinition } from "@tapir/core";
import { CUSTOM_OPERATION_ID } from "../composables/useOperationRequest";
import { activeItemClass, eyebrowClass, iconButtonClass, itemClass, mutedTextClass, panelClass, subtleTextClass, softTextClass } from "../uiClasses";
import MethodBadge from "./MethodBadge.vue";

defineProps<{
  collapsed: boolean;
  groupedOperations: Array<{ name: string; items: NormalizedOperation[] }>;
  operationsCount: number;
  selectedOperationId: string | null;
  selectedServer: ServerWithDefinition | null;
}>();

const emit = defineEmits<{
  addCustomRequest: [];
  addOperationRequest: [operation: NormalizedOperation];
  collapse: [value: boolean];
  selectCustom: [];
  selectOperation: [operation: NormalizedOperation];
}>();
</script>

<template>
  <section :class="[panelClass, collapsed ? 'overflow-hidden px-2' : 'overflow-x-hidden overflow-y-auto']">
    <button v-if="collapsed" :class="['grid h-full w-full place-items-start pt-3', mutedTextClass]" title="Expand operations" @click="emit('collapse', false)">
      <ListFilter :size="20" />
    </button>
    <template v-else>
      <div :class="[eyebrowClass, 'mb-3.5 flex items-center justify-between']">
        <span>Operations</span>
        <span class="inline-flex items-center gap-2">
          <strong>{{ operationsCount }}</strong>
          <button :class="iconButtonClass" title="Collapse operations" @click="emit('collapse', true)">
            <ChevronLeft :size="17" />
          </button>
        </span>
      </div>

      <div v-if="!selectedServer" class="empty-state min-h-[260px] px-3">
        <TerminalSquare :size="30" />
        <p class="m-0">Add a deployed API server to discover its OpenAPI surface.</p>
      </div>

      <template v-else>
        <div class="grid gap-2.5">
          <h2 :class="['mb-0.5 mt-1 text-xs font-bold uppercase', subtleTextClass]">Custom</h2>
          <button
            :class="[itemClass, 'grid-cols-[auto_minmax(0,1fr)_auto]', selectedOperationId === CUSTOM_OPERATION_ID && activeItemClass]"
            @click="emit('selectCustom')"
          >
            <span :class="['grid h-7 w-14 place-items-center rounded bg-[var(--tapir-bg-control-hover)] text-[11px] font-black', softTextClass]">HTTP</span>
            <span class="grid min-w-0 gap-[3px]">
              <strong class="truncate">Custom requests</strong>
              <small :class="['truncate', mutedTextClass]">Any method, URL, and headers</small>
            </span>
            <Plus :size="16" :class="['ml-auto shrink-0 hover:text-[var(--tapir-text-strong)]', mutedTextClass]" @click.stop="emit('addCustomRequest')" />
          </button>
        </div>

        <div v-for="group in groupedOperations" :key="group.name" class="grid gap-2.5">
          <h2 :class="['mb-0.5 mt-4 text-xs font-bold uppercase', subtleTextClass]">{{ group.name }}</h2>
          <button
            v-for="operation in group.items"
            :key="operation.operationId"
            :class="[itemClass, 'grid-cols-[auto_minmax(0,1fr)_auto]', operation.operationId === selectedOperationId && activeItemClass]"
            @click="emit('selectOperation', operation)"
          >
            <MethodBadge :method="operation.method" />
            <span class="grid min-w-0 gap-[3px]">
              <strong class="truncate">{{ operation.summary || operation.operationId }}</strong>
              <small :class="['truncate', mutedTextClass]">{{ operation.path }}</small>
            </span>
            <Plus :size="16" :class="['ml-auto shrink-0 hover:text-[var(--tapir-text-strong)]', mutedTextClass]" @click.stop="emit('addOperationRequest', operation)" />
          </button>
        </div>
      </template>
    </template>
  </section>
</template>
