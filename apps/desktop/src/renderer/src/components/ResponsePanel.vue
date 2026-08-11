<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
const activeTab = ref<"body" | "headers">("body");
const responseHeaders = computed(() => Object.entries(props.responseView?.response.headers ?? {}).sort(([left], [right]) => left.localeCompare(right)));
watch(() => props.responseView, () => { activeTab.value = "body"; });

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
      <div class="flex h-full items-center gap-3">
        <button class="flex items-center gap-2 font-bold text-[var(--tapir-text-soft)]" @click="emit('collapse', !collapsed)">
          <ChevronDown :class="['transition-transform', collapsed && '-rotate-90']" :size="17" />
          Response
        </button>
        <template v-if="responseView && !collapsed">
          <button class="response-tab" :class="activeTab === 'body' && 'is-active'" type="button" @click="activeTab = 'body'">Body</button>
          <button class="response-tab" :class="activeTab === 'headers' && 'is-active'" type="button" @click="activeTab = 'headers'">Headers <span>{{ responseHeaders.length }}</span></button>
        </template>
      </div>
      <span v-if="responseView" :class="['font-extrabold', responseView.response.status < 400 ? 'text-[var(--tapir-success)]' : 'text-[var(--tapir-danger)]']">{{ responseView.response.status }} · {{ responseView.response.durationMs }} ms</span>
    </header>
    <div v-if="!collapsed" class="h-[calc(100%-44px)] overflow-auto p-4">
      <JsonCodeEditor
        v-if="responseView && activeTab === 'body'"
        :model-value="prettyBody"
        :editable="false"
        :language="responseLanguage"
        min-height="180px"
        :title="responseLanguage === 'json' ? 'Response JSON' : 'Response body'"
      />
      <div v-else-if="responseView" class="overflow-hidden rounded-md border border-[var(--tapir-border-control)] bg-[var(--tapir-bg-field)]">
        <div v-for="([name, value]) in responseHeaders" :key="name" class="grid grid-cols-[minmax(140px,0.4fr)_minmax(0,1fr)] border-b border-[var(--tapir-border)] last:border-b-0">
          <strong class="break-all border-r border-[var(--tapir-border)] px-3 py-2.5 text-[12px] text-[var(--tapir-text-soft)]">{{ name }}</strong>
          <code class="break-all px-3 py-2.5 text-[12px] text-[var(--tapir-text)]">{{ value }}</code>
        </div>
        <div v-if="responseHeaders.length === 0" class="empty-state min-h-[140px]">No response headers.</div>
      </div>
      <div v-else class="empty-state h-full min-h-[180px]">Enter request details and click Send to get a response.</div>
    </div>
  </section>
</template>
