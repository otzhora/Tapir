<script setup lang="ts">
import { AlertCircle, Clipboard, Database, Eye, FileJson2, KeyRound, Send, TerminalSquare } from "lucide-vue-next";
import type { CallOperationResponse, NormalizedOperation, PreparedOperationRequest, ServerWithDefinition } from "@tapir/core";
import type { RequestTab, RequestTabItem } from "../types";
import { eyebrowClass, fieldClass } from "../uiClasses";
import MethodBadge from "./MethodBadge.vue";

defineProps<{
  activeRequestTab: RequestTab;
  authHeaderName: string;
  authSecret: string;
  bodyValue: string;
  canSend: boolean;
  contentType: string;
  curlCommand: string;
  isPreviewing: boolean;
  isSending: boolean;
  operationUrl: string;
  parameterValues: Record<string, string>;
  prettyRequest: string;
  requestBodySchema: string;
  requestPreview: PreparedOperationRequest | null;
  requestTabs: RequestTabItem[];
  responsesSchema: string;
  selectedContentTypes: string[];
  selectedOperation: NormalizedOperation | null;
  selectedServer: ServerWithDefinition | null;
  validationIssues: Array<{ field: string; message: string }>;
}>();

const emit = defineEmits<{
  callOperation: [];
  copyCurl: [];
  setParameter: [name: string, value: string];
  updateActiveRequestTab: [tab: RequestTab];
  updateAuthHeaderName: [value: string];
  updateAuthSecret: [value: string];
  updateBodyValue: [value: string];
  updateContentType: [value: string];
}>();

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
}
</script>

<template>
  <div class="min-h-0 overflow-auto p-4">
    <div v-if="selectedOperation && selectedServer" class="mx-auto grid max-w-[1280px] gap-4">
      <header class="rounded-lg border border-[#27323b] bg-[#171c21]">
        <div class="grid gap-3 border-b border-[#27323b] p-4">
          <div class="flex min-w-0 items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex min-w-0 items-center gap-2.5">
                <MethodBadge :method="selectedOperation.method" />
                <h2 class="m-0 text-[21px] font-bold [overflow-wrap:anywhere]">{{ selectedOperation.summary || selectedOperation.operationId }}</h2>
              </div>
              <p class="mt-2 max-w-[900px] text-[#9aa6ae]">{{ selectedOperation.description || selectedOperation.path }}</p>
            </div>
            <button class="inline-flex h-10 min-w-[104px] shrink-0 items-center justify-center gap-2 rounded-md bg-[#1684fc] px-3.5 font-extrabold text-white shadow-[0_10px_30px_rgba(22,132,252,0.18)] transition hover:bg-[#2d91ff] disabled:cursor-not-allowed disabled:opacity-60" :disabled="!canSend" @click="emit('callOperation')">
              <Send :size="17" />
              {{ isSending ? "Sending" : "Send" }}
            </button>
          </div>
          <div class="grid grid-cols-[minmax(112px,140px)_1fr] overflow-hidden rounded-md border border-[#303a44] bg-[#0f1317]">
            <div class="grid place-items-center border-r border-[#303a44] px-3 font-black text-[#43e2b2]">{{ selectedOperation.method }}</div>
            <input class="h-11 min-w-0 bg-transparent px-3 text-[#edf4f1] outline-none" :value="operationUrl" readonly />
          </div>
          <div class="grid gap-2 text-[13px] text-[#8f9ba5] md:grid-cols-3">
            <span class="truncate">Name: <strong class="text-[#cfd8d5]">{{ selectedOperation.operationId }}</strong></span>
            <span class="truncate">Path: <strong class="text-[#cfd8d5]">{{ selectedOperation.path }}</strong></span>
            <span class="truncate">Server: <strong class="text-[#cfd8d5]">{{ selectedServer.server.name }}</strong></span>
          </div>
        </div>

        <nav class="flex min-w-0 gap-1 overflow-x-auto px-3 pt-2">
          <button
            v-for="tab in requestTabs"
            :key="tab.id"
            class="tab-button"
            :class="tab.id === activeRequestTab && 'is-active'"
            @click="emit('updateActiveRequestTab', tab.id)"
          >
            {{ tab.label }}
            <span v-if="tab.count !== undefined" class="rounded bg-[#26313a] px-1.5 py-0.5 text-[11px] text-[#aeb8be]">{{ tab.count }}</span>
          </button>
        </nav>

        <section v-if="validationIssues.length > 0" class="m-4 grid gap-2 rounded-md border border-[#7a352f] bg-[#2b1717] p-3 text-[#ffb7aa]">
          <div v-for="issue in validationIssues" :key="`${issue.field}:${issue.message}`" class="flex items-start gap-2 text-[13px] font-bold">
            <AlertCircle :size="16" class="mt-0.5 shrink-0" />
            <span>{{ issue.message }}</span>
          </div>
        </section>

        <div class="min-h-[260px] p-4">
          <section v-if="activeRequestTab === 'params'" class="request-grid">
            <div class="table-head">Key</div>
            <div class="table-head">Location</div>
            <div class="table-head">Value</div>
            <template v-if="selectedOperation.parameters.length > 0">
              <template v-for="parameter in selectedOperation.parameters" :key="`${parameter.in}:${parameter.name}`">
                <div class="table-cell">
                  <strong>{{ parameter.name }}</strong>
                  <small v-if="parameter.required" class="ml-2 text-[#ffd166]">required</small>
                  <p v-if="parameter.description" class="mt-1 text-[#8f9ba5]">{{ parameter.description }}</p>
                </div>
                <div class="table-cell text-[#9aa6ae]">{{ parameter.in }}</div>
                <div class="table-cell">
                  <input :value="parameterValues[parameter.name]" :class="fieldClass" :placeholder="parameter.name" @input="emit('setParameter', parameter.name, inputValue($event))" />
                </div>
              </template>
            </template>
            <div v-else class="col-span-3 grid min-h-[130px] place-items-center text-[#8f9ba5]">No parameters declared by the spec.</div>
          </section>

          <section v-else-if="activeRequestTab === 'auth'" class="grid max-w-[720px] gap-4">
            <div class="flex items-center gap-2 text-[#cfd8d5]"><KeyRound :size="18" /> API key header</div>
            <label class="grid gap-2">
              <span :class="eyebrowClass">Header name</span>
              <input :value="authHeaderName" :class="fieldClass" placeholder="x-api-key" @input="emit('updateAuthHeaderName', inputValue($event))" />
            </label>
            <label class="grid gap-2">
              <span :class="eyebrowClass">Secret value</span>
              <input :value="authSecret" :class="fieldClass" type="password" placeholder="Stored locally for this server" @input="emit('updateAuthSecret', inputValue($event))" />
            </label>
          </section>

          <section v-else-if="activeRequestTab === 'body'" class="grid gap-3">
            <div class="flex items-center justify-between gap-3">
              <span :class="eyebrowClass">Body</span>
              <select :value="contentType" class="h-9 min-w-[190px] rounded-md border border-[#303a44] bg-[#0f1317] px-2 text-[13px] font-bold text-[#edf4f1] outline-none" @change="emit('updateContentType', inputValue($event))">
                <option v-if="selectedContentTypes.length === 0" value="application/json">application/json</option>
                <option v-for="type in selectedContentTypes" :key="type" :value="type">{{ type }}</option>
              </select>
            </div>
            <textarea :value="bodyValue" class="min-h-[190px] w-full min-w-0 resize-y rounded-md border border-[#303a44] bg-[#0f1317] p-3 font-mono text-[13px] leading-6 text-[#edf4f1] outline-none transition placeholder:text-[#65717b] focus:border-[#12b886] focus:shadow-[0_0_0_3px_rgba(18,184,134,0.15)]" spellcheck="false" placeholder="{ }" @input="emit('updateBodyValue', inputValue($event))"></textarea>
          </section>

          <section v-else-if="activeRequestTab === 'schema'" class="grid gap-3 lg:grid-cols-2">
            <div class="min-w-0">
              <div class="mb-2 flex items-center gap-2 text-sm font-bold text-[#cfd8d5]"><FileJson2 :size="17" /> Request schema</div>
              <pre class="code-block">{{ requestBodySchema }}</pre>
            </div>
            <div class="min-w-0">
              <div class="mb-2 flex items-center gap-2 text-sm font-bold text-[#cfd8d5]"><Database :size="17" /> Responses</div>
              <pre class="code-block">{{ responsesSchema }}</pre>
            </div>
          </section>

          <section v-else class="grid gap-3">
            <div class="mb-1 flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 text-sm font-bold text-[#cfd8d5]"><Eye :size="17" /> Prepared request</div>
              <button class="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#303a44] bg-[#0f1317] px-2.5 text-[13px] font-extrabold text-[#d9e1df] transition hover:bg-[#20262d] disabled:cursor-not-allowed disabled:opacity-60" :disabled="!curlCommand" title="Copy cURL" @click="emit('copyCurl')">
                <Clipboard :size="15" />
                cURL
              </button>
            </div>
            <pre v-if="requestPreview" class="code-block min-h-[190px]">{{ prettyRequest }}</pre>
            <div v-else class="grid min-h-[190px] place-items-center rounded-md border border-[#303a44] text-center text-[#8f9ba5]">{{ isPreviewing ? "Preparing request..." : "Complete the request fields to preview it." }}</div>
          </section>
        </div>
      </header>
    </div>

    <div v-else class="grid min-h-full place-items-center gap-2.5 text-center text-[#8f9ba5]">
      <TerminalSquare :size="34" />
      <p class="m-0">Select an operation to prepare and call it.</p>
    </div>
  </div>
</template>
