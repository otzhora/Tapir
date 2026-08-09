<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { AlertCircle, Beaker, ClipboardPaste, Server, ShieldAlert, X } from "lucide-vue-next";
import type { ServerWithDefinition } from "@tapir/core";
import { parseCurlCommand, redirectCurlUrl, type CurlImportDraft } from "../curlImport";
import { fieldClass, iconButtonClass, mutedTextClass, primaryActionClass, strongTextClass } from "../uiClasses";
import JsonCodeEditor from "./JsonCodeEditor.vue";

const props = defineProps<{
  currentServerId: string | null;
  externalError?: string;
  isImporting?: boolean;
  servers: ServerWithDefinition[];
}>();

const emit = defineEmits<{
  cancel: [];
  import: [draft: CurlImportDraft];
}>();

const command = ref("");
const destinationMode = ref<"original" | "replace">("replace");
const replacementOrigin = ref(readRememberedLocalTarget());
const organizationMode = ref<"sandbox" | "server" | "create">("sandbox");
const organizationServerId = ref(props.currentServerId ?? props.servers[0]?.server.id ?? "");
const includeBrowserHeaders = ref(false);
const includeSensitiveHeaders = ref(false);

watch(() => props.currentServerId, (serverId) => {
  if (serverId) organizationServerId.value = serverId;
});

const parseResult = computed(() => {
  if (!command.value.trim()) return { request: null, error: "" };
  try {
    return {
      request: parseCurlCommand(command.value, {
        includeBrowserHeaders: includeBrowserHeaders.value,
        includeSensitiveHeaders: includeSensitiveHeaders.value
      }),
      error: ""
    };
  } catch (error) {
    return { request: null, error: error instanceof Error ? error.message : "The cURL command could not be parsed." };
  }
});

const organizationServer = computed(() => props.servers.find((item) => item.server.id === organizationServerId.value) ?? null);
const finalUrl = computed(() => {
  const request = parseResult.value.request;
  if (!request) return "";
  if (destinationMode.value === "original") return request.url;
  try {
    return redirectCurlUrl(request.url, replacementOrigin.value);
  } catch {
    return "";
  }
});
const matchingServer = computed(() => {
  if (!finalUrl.value) return null;
  const origin = new URL(finalUrl.value).origin;
  return props.servers.find((item) => {
    try {
      return new URL(item.server.baseUrl).origin === origin;
    } catch {
      return false;
    }
  }) ?? null;
});
watch(() => matchingServer.value?.server.id ?? null, (serverId) => {
  if (serverId) {
    organizationServerId.value = serverId;
    organizationMode.value = "server";
  } else {
    organizationMode.value = "sandbox";
  }
});
const destinationError = computed(() => parseResult.value.request && !finalUrl.value ? "Enter a valid destination such as http://localhost:5051." : "");
const displayedError = computed(() => props.externalError || parseResult.value.error || destinationError.value);
const canImport = computed(() => Boolean(parseResult.value.request
  && finalUrl.value
  && (organizationMode.value !== "server" || organizationServer.value)));

function importRequest(): void {
  const request = parseResult.value.request;
  if (!request || !finalUrl.value) return;
  if (destinationMode.value === "replace") rememberLocalTarget(replacementOrigin.value.trim());
  const parsedFinalUrl = new URL(finalUrl.value);
  emit("import", {
    serverId: organizationMode.value === "server" ? organizationServer.value?.server.id ?? null : null,
    createServerBaseUrl: organizationMode.value === "create" ? parsedFinalUrl.origin : undefined,
    name: `${request.method} ${parsedFinalUrl.pathname}`,
    method: request.method,
    url: finalUrl.value,
    headers: request.headers,
    body: request.body,
    contentType: request.contentType
  });
}

function readRememberedLocalTarget(): string {
  try {
    return originValue(window.localStorage?.getItem("tapir.curlImport.localTarget") ?? "http://localhost:5051");
  } catch {
    return "http://localhost:5051";
  }
}

function rememberLocalTarget(value: string): void {
  try {
    window.localStorage?.setItem("tapir.curlImport.localTarget", originValue(value));
  } catch {
    // Import still works when renderer storage is unavailable.
  }
}

function originValue(value: string): string {
  const trimmed = value.trim();
  return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`).origin;
}
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/80 p-5" role="presentation" @mousedown.self="emit('cancel')">
    <section class="grid h-[min(780px,calc(100vh-40px))] w-full max-w-[1080px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-[var(--tapir-border-strong)] bg-[var(--tapir-bg-panel-opaque)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="curl-import-title" @keydown.esc="emit('cancel')">
      <header class="flex items-start justify-between gap-4 border-b border-[var(--tapir-border)] bg-[var(--tapir-bg-panel-opaque)] px-5 py-4">
        <div>
          <div class="flex items-center gap-2">
            <ClipboardPaste :size="19" class="text-[var(--tapir-accent)]" />
            <h2 id="curl-import-title" :class="['m-0 text-[17px]', strongTextClass]">Import cURL</h2>
          </div>
          <p :class="['mb-0 mt-1 text-[13px]', mutedTextClass]">Paste a browser request, choose where to send it, and decide where Tapir should keep it.</p>
        </div>
        <button :class="[iconButtonClass, 'grid size-9 place-items-center p-0']" title="Close" type="button" @click="emit('cancel')"><X :size="17" /></button>
      </header>

      <main class="grid min-h-0 gap-5 overflow-hidden p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <div class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
          <span class="text-[12px] font-black uppercase tracking-[0.08em] text-[var(--tapir-text-muted)]">cURL command</span>
          <JsonCodeEditor
            v-model="command"
            class="h-full min-h-0"
            language="curl"
            min-height="0"
            placeholder="curl 'https://dev.example.com/api/orders' ..."
            title="Browser cURL"
          />
        </div>

        <div class="grid min-h-0 content-start gap-3 overflow-y-auto pr-1">
          <section class="grid content-start gap-3 rounded-lg border border-[var(--tapir-border-control)] bg-[#181818] p-4">
            <div>
              <h3 class="m-0 text-[13px] font-black">Request destination</h3>
              <p :class="['mb-0 mt-1 text-[11px]', mutedTextClass]">Choose whether Tapir should preserve or rewrite the copied URL.</p>
            </div>
            <div class="grid grid-cols-2 gap-1 rounded-md bg-[var(--tapir-bg)] p-1">
              <button class="h-9 rounded px-2 text-[12px] font-bold" :class="destinationMode === 'original' ? 'bg-[var(--tapir-bg-control-active)] text-[var(--tapir-text-strong)]' : mutedTextClass" type="button" @click="destinationMode = 'original'">Keep original URL</button>
              <button class="h-9 rounded px-2 text-[12px] font-bold" :class="destinationMode === 'replace' ? 'bg-[var(--tapir-bg-control-active)] text-[var(--tapir-text-strong)]' : mutedTextClass" type="button" @click="destinationMode = 'replace'">Replace origin</button>
            </div>

            <div class="h-9">
              <input v-if="destinationMode === 'replace'" v-model="replacementOrigin" :class="fieldClass" placeholder="http://localhost:5051" />
              <div v-else :class="['flex h-9 items-center rounded-md border border-[var(--tapir-border-control)] bg-[var(--tapir-bg)] px-3 text-[12px]', mutedTextClass]">Scheme, host, port, path, and query remain unchanged</div>
            </div>

            <div v-if="destinationMode === 'replace'" class="flex min-h-7 flex-wrap items-center gap-1.5 text-[11px]">
              <span :class="mutedTextClass">Origin presets:</span>
              <button class="mini-button h-7 px-2 text-[11px]" type="button" @click="replacementOrigin = readRememberedLocalTarget()">Localhost</button>
              <button v-for="server in servers" :key="server.server.id" class="mini-button h-7 max-w-[150px] px-2 text-[11px]" type="button" :title="originValue(server.server.baseUrl)" @click="replacementOrigin = originValue(server.server.baseUrl)">
                <span class="truncate">{{ server.server.name }}</span>
              </button>
            </div>
            <div v-else class="min-h-7"></div>
            <p v-if="destinationMode === 'replace'" :class="['m-0 text-[11px]', mutedTextClass]">Only the scheme, host, and port are replaced. Path and query remain unchanged.</p>
            <div class="grid gap-1.5 border-t border-[var(--tapir-border)] pt-3 text-[11px]">
              <strong class="uppercase tracking-[0.08em] text-[var(--tapir-text-muted)]">Final URL</strong>
              <span v-if="finalUrl" class="break-all font-bold text-[var(--tapir-text-strong)]">{{ finalUrl }}</span>
              <span v-else :class="mutedTextClass">Paste a valid cURL command to preview the destination.</span>
            </div>
          </section>

          <section class="grid content-start gap-3 rounded-lg border border-[var(--tapir-border-control)] bg-[#181818] p-4">
            <div>
              <h3 class="m-0 text-[13px] font-black">Save request in</h3>
              <p :class="['mb-0 mt-1 text-[11px]', mutedTextClass]">This controls organization, variables, authentication, and OpenAPI context.</p>
            </div>
            <label class="grid grid-cols-[18px_18px_minmax(0,1fr)] items-start gap-2 text-[12px]">
              <input v-model="organizationMode" class="mt-0.5" value="sandbox" type="radio" />
              <Beaker :size="15" class="mt-0.5 text-[var(--tapir-accent)]" />
              <span><strong>Request Sandbox</strong><small :class="['block', mutedTextClass]">Standalone request with no server configuration.</small></span>
            </label>
            <label class="grid grid-cols-[18px_18px_minmax(0,1fr)] items-start gap-2 text-[12px]" :class="servers.length === 0 && 'opacity-45'">
              <input v-model="organizationMode" class="mt-0.5" value="server" type="radio" :disabled="servers.length === 0" />
              <Server :size="15" class="mt-0.5 text-[var(--tapir-accent)]" />
              <span><strong>Existing server</strong><small v-if="matchingServer" class="ml-1 text-[var(--tapir-success)]">Recommended match</small></span>
            </label>
            <select v-if="organizationMode === 'server'" v-model="organizationServerId" :class="fieldClass">
              <option v-for="server in servers" :key="server.server.id" :value="server.server.id">{{ server.server.name }} — {{ server.server.baseUrl }}</option>
            </select>
            <label class="grid grid-cols-[18px_18px_minmax(0,1fr)] items-start gap-2 text-[12px]">
              <input v-model="organizationMode" class="mt-0.5" value="create" type="radio" />
              <Server :size="15" class="mt-0.5 text-[var(--tapir-accent)]" />
              <span><strong>Create server from destination</strong><small :class="['block', mutedTextClass]">Run OpenAPI discovery for the final origin.</small></span>
            </label>
          </section>

          <section class="grid gap-2.5 rounded-lg border border-[var(--tapir-border-control)] bg-[#181818] p-4">
            <h3 class="m-0 text-[13px] font-black">Import options</h3>
            <label class="flex items-start gap-2 text-[13px]"><input v-model="includeBrowserHeaders" class="mt-0.5" type="checkbox" /><span>Keep browser-only headers <small :class="mutedTextClass">({{ parseResult.request?.browserHeaderCount ?? 0 }} detected)</small></span></label>
            <label class="flex items-start gap-2 text-[13px]"><input v-model="includeSensitiveHeaders" class="mt-0.5" type="checkbox" /><span>Keep credentials and cookies <small :class="mutedTextClass">({{ parseResult.request?.sensitiveHeaderCount ?? 0 }} detected)</small></span></label>
            <div v-if="parseResult.request?.sensitiveHeaderCount" class="flex items-start gap-2 rounded-md border border-[var(--tapir-warning-border)] bg-[var(--tapir-warning-bg)] p-2.5 text-[12px] text-[var(--tapir-warning)]">
              <ShieldAlert :size="15" class="mt-0.5 shrink-0" />
              <span>Sensitive headers are excluded by default. If kept, they become part of this local draft.</span>
            </div>
          </section>

          <div v-if="displayedError" class="flex items-start gap-2 rounded-md border border-[var(--tapir-danger-border)] bg-[var(--tapir-danger-bg)] p-3 text-[13px] font-bold text-[var(--tapir-danger)]">
            <AlertCircle :size="16" class="mt-0.5 shrink-0" />
            <span>{{ displayedError }}</span>
          </div>
        </div>
      </main>

      <footer class="flex items-center justify-between gap-3 border-t border-[var(--tapir-border)] bg-[var(--tapir-bg-panel-opaque)] px-5 py-4">
        <span :class="['text-[12px]', mutedTextClass]">The raw pasted command is parsed locally and is not added to history.</span>
        <div class="flex shrink-0 gap-2">
          <button class="mini-button h-9 px-4" type="button" @click="emit('cancel')">Cancel</button>
          <button :class="[primaryActionClass, 'h-9 min-w-[142px] px-4']" type="button" :disabled="!canImport || isImporting" @click="importRequest">{{ isImporting ? "Importing…" : "Import request" }}</button>
        </div>
      </footer>
    </section>
  </div>
</template>
