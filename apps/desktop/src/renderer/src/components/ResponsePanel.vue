<script setup lang="ts">
import { computed } from "vue";
import { ChevronDown } from "lucide-vue-next";
import type { CallOperationResponse } from "@tapir/core";
import JsonCodeEditor from "./JsonCodeEditor.vue";

const props = defineProps<{
  collapsed: boolean;
  prettyBody: string;
  responseView: CallOperationResponse | null;
}>();

const emit = defineEmits<{
  collapse: [value: boolean];
}>();

const responseLanguage = computed(() => {
  const headers = props.responseView?.response.headers ?? {};
  const contentType = Object.entries(headers).find(([name]) => name.toLowerCase() === "content-type")?.[1] ?? "";
  return isJsonMediaType(contentType) || looksLikeJson(props.prettyBody) ? "json" : "text";
});

function isJsonMediaType(value: string): boolean {
  const mediaType = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}
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
      <JsonCodeEditor
        v-if="responseView"
        :model-value="prettyBody"
        :editable="false"
        :language="responseLanguage"
        min-height="180px"
        :title="responseLanguage === 'json' ? 'Response JSON' : 'Response body'"
      />
      <div v-else class="empty-state h-full min-h-[180px]">Enter request details and click Send to get a response.</div>
    </div>
  </section>
</template>
