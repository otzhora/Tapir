<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Braces, ChevronDown, Clock3, FileText, SquarePlus } from "lucide-vue-next";
import type { CallHistoryEntry, CallOperationResponse } from "@tapir/core";
import JsonCodeEditor from "./JsonCodeEditor.vue";

const props = defineProps<{
  collapsed: boolean;
  history: CallHistoryEntry[];
  isLoadingHistory: boolean;
  prettyBody: string;
  responseView: CallOperationResponse | null;
}>();

const emit = defineEmits<{
  collapse: [value: boolean];
  restoreHistory: [entry: CallHistoryEntry, target: "current" | "new"];
}>();
const activeTab = ref<"body" | "headers">("body");
const historyOpen = ref(false);
const historyMenuRoot = ref<HTMLElement | null>(null);
const responseHeaders = computed(() => Object.entries(props.responseView?.response.headers ?? {}).sort(([left], [right]) => left.localeCompare(right)));
const responseSize = computed(() => formatBytes(new TextEncoder().encode(props.responseView?.response.body ?? "").byteLength));
const responseStatusLabel = computed(() => {
  const status = props.responseView?.response.status;
  if (!status) return "";
  if (status < 300) return "Success";
  if (status < 400) return "Redirect";
  if (status < 500) return "Client error";
  return "Server error";
});
watch(() => props.responseView, () => { activeTab.value = "body"; });
watch(() => props.collapsed, (collapsed) => { if (collapsed) historyOpen.value = false; });

const responseLanguage = computed(() => {
  const headers = props.responseView?.response.headers ?? {};
  const contentType = Object.entries(headers).find(([name]) => name.toLowerCase() === "content-type")?.[1] ?? "";
  return isJsonMediaType(contentType) || looksLikeJson(props.prettyBody) ? "json" : "text";
});

onMounted(() => document.addEventListener("pointerdown", closeHistoryOnOutsidePress));
onBeforeUnmount(() => document.removeEventListener("pointerdown", closeHistoryOnOutsidePress));

function closeHistoryOnOutsidePress(event: PointerEvent): void {
  if (!historyMenuRoot.value?.contains(event.target as Node)) historyOpen.value = false;
}

function restore(entry: CallHistoryEntry, target: "current" | "new"): void {
  historyOpen.value = false;
  emit("restoreHistory", entry, target);
}

function isJsonMediaType(value: string): boolean {
  const mediaType = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function formatRunDate(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  return sameDay ? `Today, ${time}` : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
  <section class="response-panel min-h-0 overflow-hidden border-t border-[var(--tapir-border)] bg-[var(--tapir-bg-panel-soft)] backdrop-blur-xl">
    <header class="response-header">
      <div class="flex h-full min-w-0 items-center gap-3">
        <button class="response-title" type="button" @click="emit('collapse', !collapsed)">
          Response
        </button>
        <template v-if="!collapsed">
          <template v-if="responseView">
            <button class="response-tab" :class="activeTab === 'body' && 'is-active'" type="button" @click="activeTab = 'body'">Body</button>
            <button class="response-tab" :class="activeTab === 'headers' && 'is-active'" type="button" @click="activeTab = 'headers'">Headers <span>{{ responseHeaders.length }}</span></button>
          </template>
          <div ref="historyMenuRoot" class="relative flex h-full items-center" @keydown.esc.stop="historyOpen = false">
            <button
              class="response-history-button"
              :class="historyOpen && 'border-[var(--tapir-border-strong)] bg-[var(--tapir-bg-control-active)] text-[var(--tapir-text-strong)]'"
              type="button"
              aria-label="Request history"
              aria-haspopup="menu"
              :aria-expanded="historyOpen"
              title="Request history"
              @click="historyOpen = !historyOpen"
            >
              History <ChevronDown :class="['transition-transform', historyOpen && 'rotate-180']" :size="14" />
            </button>

            <div v-if="historyOpen" class="absolute left-0 top-[38px] z-30 w-[390px] overflow-hidden rounded-xl border border-[var(--tapir-border-strong)] bg-[var(--tapir-bg-panel-opaque)] p-2 shadow-2xl" role="menu" aria-label="Request history runs">
              <button class="flex h-11 w-full items-center justify-between rounded-lg px-3 text-left text-[13px] font-extrabold text-[var(--tapir-text-strong)] hover:bg-[var(--tapir-bg-control-hover)]" type="button" role="menuitem" @click="historyOpen = false">
                <span>Current</span>
                <span v-if="responseView" class="flex items-center gap-3">
                  <small class="font-bold text-[var(--tapir-text-muted)]">{{ responseView.response.durationMs }} ms</small>
                  <strong :class="responseView.response.status < 400 ? 'text-[var(--tapir-success)]' : 'text-[var(--tapir-danger)]'">{{ responseView.response.status }}</strong>
                </span>
              </button>
              <div class="mx-2 border-t border-[var(--tapir-border)]"></div>

              <div class="max-h-[280px] overflow-y-auto py-1">
                <div v-if="isLoadingHistory" class="px-3 py-6 text-center text-[12px] text-[var(--tapir-text-muted)]">Loading history…</div>
                <div v-else-if="history.length === 0" class="px-3 py-6 text-center text-[12px] text-[var(--tapir-text-muted)]">No previous runs for this request.</div>
                <div v-for="entry in history" v-else :key="entry.id" class="group grid grid-cols-[minmax(0,1fr)_32px] items-center gap-1 rounded-lg hover:bg-[var(--tapir-bg-control-hover)]">
                  <button class="grid min-w-0 grid-cols-[minmax(0,1fr)_54px_64px] items-center gap-3 px-3 py-2.5 text-left" type="button" role="menuitem" title="Restore this run in the current tab" @click="restore(entry, 'current')">
                    <time :datetime="entry.createdAt" class="truncate text-[13px] font-bold text-[var(--tapir-text)]">{{ formatRunDate(entry.createdAt) }}</time>
                    <strong :class="['text-right text-[13px]', entry.responseStatus !== null && entry.responseStatus < 400 ? 'text-[var(--tapir-success)]' : 'text-[var(--tapir-danger)]']">{{ entry.responseStatus ?? "ERR" }}</strong>
                    <small class="text-right font-bold text-[var(--tapir-text-muted)]">{{ entry.durationMs === null ? "—" : `${entry.durationMs} ms` }}</small>
                  </button>
                  <button class="flex h-8 w-8 items-center justify-center rounded-md text-[var(--tapir-text-muted)] opacity-0 transition hover:bg-[var(--tapir-bg-control-active)] hover:text-[var(--tapir-text-strong)] group-hover:opacity-100 focus:opacity-100" type="button" role="menuitem" title="Restore this run in a new request tab" @click="restore(entry, 'new')">
                    <SquarePlus :size="15" />
                  </button>
                </div>
              </div>
              <p v-if="history.length" class="m-0 border-t border-[var(--tapir-border)] px-3 pt-2 text-[10px] text-[var(--tapir-text-subtle)]">Select a run to restore it here. Use <SquarePlus :size="11" class="inline" /> to open it in a new tab.</p>
            </div>
          </div>
        </template>
      </div>
      <div v-if="responseView" class="response-summary">
        <span :class="['response-status', responseView.response.status < 400 ? 'is-success' : 'is-error']">
          {{ responseView.response.status }} <span>{{ responseStatusLabel }}</span>
        </span>
        <span class="response-stat"><Clock3 :size="13" /> {{ responseView.response.durationMs }} ms</span>
        <span class="response-stat"><FileText :size="13" /> {{ responseSize }}</span>
      </div>
    </header>
    <div v-if="!collapsed" class="response-content">
      <JsonCodeEditor
        v-if="responseView && activeTab === 'body'"
        class="h-full"
        :model-value="prettyBody"
        :editable="false"
        :language="responseLanguage"
        min-height="100%"
        :title="responseLanguage === 'json' ? 'Response JSON' : 'Response body'"
      />
      <div v-else-if="responseView" class="overflow-hidden rounded-md border border-[var(--tapir-border-control)] bg-[var(--tapir-bg-field)]">
        <div v-for="([name, value]) in responseHeaders" :key="name" class="grid grid-cols-[minmax(140px,0.4fr)_minmax(0,1fr)] border-b border-[var(--tapir-border)] last:border-b-0">
          <strong class="break-all border-r border-[var(--tapir-border)] px-3 py-2.5 text-[12px] text-[var(--tapir-text-soft)]">{{ name }}</strong>
          <code class="break-all px-3 py-2.5 text-[12px] text-[var(--tapir-text)]">{{ value }}</code>
        </div>
        <div v-if="responseHeaders.length === 0" class="empty-state min-h-[140px]">No response headers.</div>
      </div>
      <div v-else class="response-empty">
        <span><Braces :size="22" /></span>
        <strong>Your response will appear here</strong>
        <p>Configure the request above, then click Send.</p>
      </div>
    </div>
  </section>
</template>
