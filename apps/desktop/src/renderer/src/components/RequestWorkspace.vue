<script setup lang="ts">
import { AlertCircle, Clipboard, Database, Eye, FileJson2, Plus, Send, TerminalSquare, X } from "lucide-vue-next";
import type { NormalizedOperation, PreparedOperationRequest, RequestDraft, RequestDraftHeader, RequestDraftParameter, ServerWithDefinition } from "@tapir/core";
import type { RequestTab, RequestTabItem } from "../types";
import { eyebrowClass, fieldClass } from "../uiClasses";
import MethodBadge from "./MethodBadge.vue";

defineProps<{
  activeDraft: RequestDraft | null;
  activeRequestTab: RequestTab;
  canSend: boolean;
  curlCommand: string;
  draftTabs: RequestDraft[];
  headers: RequestDraftHeader[];
  isCustomSpace: boolean;
  isPreviewing: boolean;
  isSending: boolean;
  operationUrl: string;
  parameters: RequestDraftParameter[];
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
  addHeader: [];
  addParameter: [location: RequestDraftParameter["in"]];
  callOperation: [];
  closeDraft: [draftId: string];
  copyCurl: [];
  createDraft: [];
  removeHeader: [id: string];
  removeParameter: [id: string];
  selectDraft: [draftId: string];
  setParameter: [id: string, value: string];
  toggleHeader: [id: string, enabled: boolean];
  toggleParameter: [id: string, enabled: boolean];
  updateActiveRequestTab: [tab: RequestTab];
  updateBodyValue: [value: string];
  updateContentType: [value: string];
  updateDraftName: [value: string];
  updateHeader: [id: string, field: "name" | "value", value: string];
  updateMethod: [value: string];
  updateParameterName: [id: string, value: string];
  updateUrl: [value: string];
}>();

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
}

function checkedValue(event: Event): boolean {
  return (event.target as HTMLInputElement).checked;
}
</script>

<template>
  <div class="min-h-0 overflow-auto bg-[#10151b]">
    <div v-if="selectedServer && (selectedOperation || isCustomSpace)" class="grid min-h-full grid-rows-[auto_1fr]">
      <nav class="flex min-w-0 items-center gap-1 overflow-x-auto border-b border-[#252d35] bg-[#0d1116] px-3 pt-2">
        <button
          v-for="draft in draftTabs"
          :key="draft.id"
          class="request-tab"
          :class="draft.id === activeDraft?.id && 'is-active'"
          @click="emit('selectDraft', draft.id)"
        >
          <span class="truncate">{{ draft.name }}</span>
          <span v-if="draft.deprecatedAt" class="rounded bg-[#4a2a19] px-1.5 py-0.5 text-[10px] font-black uppercase text-[#ffc48a]">Deprecated</span>
          <X :size="14" class="shrink-0 text-[#7f8b94] hover:text-white" @click.stop="emit('closeDraft', draft.id)" />
        </button>
        <button class="mb-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#9faab2] transition hover:bg-[#232a31] hover:text-white" title="New request tab" @click="emit('createDraft')">
          <Plus :size="17" />
        </button>
      </nav>

      <section v-if="activeDraft" class="grid min-h-full grid-rows-[auto_auto_1fr] bg-[#10151b]">
        <header class="grid gap-3 border-b border-[#252d35] bg-[#141a20] px-4 py-3 shadow-[inset_0_-1px_0_rgba(255,255,255,0.02)]">
          <div class="flex min-w-0 items-center justify-between gap-4">
            <div class="grid min-w-0 gap-2">
              <div class="flex min-w-0 items-center gap-2.5">
                <MethodBadge v-if="!isCustomSpace && selectedOperation" :method="selectedOperation.method" />
                <select v-else :value="activeDraft.method" class="h-9 rounded-md border border-[#303943] bg-[#0d1116] px-2 text-[13px] font-black text-[#f3f7f5] outline-none" @change="emit('updateMethod', inputValue($event))">
                  <option v-for="method in methods" :key="method" :value="method">{{ method }}</option>
                </select>
                <input class="min-w-0 bg-transparent text-[18px] font-bold text-[#f3f7f5] outline-none [overflow-wrap:anywhere]" :value="activeDraft.name" @input="emit('updateDraftName', inputValue($event))" />
              </div>
              <p v-if="selectedOperation && !isCustomSpace" class="m-0 max-w-[900px] text-[13px] text-[#9faab2]">{{ selectedOperation.description || selectedOperation.path }}</p>
              <p v-else class="m-0 max-w-[900px] text-[13px] text-[#9faab2]">Custom request</p>
            </div>
            <button class="inline-flex h-10 min-w-[104px] shrink-0 items-center justify-center gap-2 rounded-md bg-[#267fe6] px-3.5 font-extrabold text-white shadow-[0_10px_22px_rgba(38,127,230,0.14)] transition hover:bg-[#388df0] disabled:cursor-not-allowed disabled:opacity-60" :disabled="!canSend" @click="emit('callOperation')">
              <Send :size="17" />
              {{ isSending ? "Sending" : "Send" }}
            </button>
          </div>

          <div class="grid grid-cols-[minmax(96px,128px)_1fr] overflow-hidden rounded-md border border-[#303943] bg-[#0d1116]">
            <div class="grid place-items-center border-r border-[#303943] px-3 font-black text-[#49d9ae]">{{ activeDraft.method }}</div>
            <input v-if="isCustomSpace" class="h-11 min-w-0 bg-transparent px-3 text-[#f3f7f5] outline-none" :value="activeDraft.url" placeholder="https://api.example.com/resource" @input="emit('updateUrl', inputValue($event))" />
            <input v-else class="h-11 min-w-0 bg-transparent px-3 text-[#f3f7f5] outline-none" :value="operationUrl" readonly />
          </div>

          <div class="grid gap-2 text-[13px] text-[#97a3ac] md:grid-cols-3">
            <span class="truncate">Name: <strong class="text-[#d4ddd9]">{{ activeDraft.name }}</strong></span>
            <span class="truncate">Source: <strong class="text-[#d4ddd9]">{{ activeDraft.deprecatedAt ? "Deprecated custom" : isCustomSpace ? "Custom" : "OpenAPI" }}</strong></span>
            <span class="truncate">Server: <strong class="text-[#d4ddd9]">{{ selectedServer.server.name }}</strong></span>
          </div>
          <div v-if="activeDraft.deprecatedAt" class="flex items-start gap-2 rounded-md border border-[#7a5523] bg-[#2b2115] p-3 text-[13px] font-bold text-[#ffd69a]">
            <AlertCircle :size="16" class="mt-0.5 shrink-0" />
            <span>{{ activeDraft.deprecationReason || "This request was moved to Custom because its OpenAPI operation changed." }}</span>
          </div>
        </header>

        <nav class="flex min-w-0 gap-1 overflow-x-auto border-b border-[#252d35] bg-[#10151b] px-3">
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

        <section v-if="validationIssues.length > 0" class="mx-4 mt-4 grid gap-2 rounded-md border border-[#7a352f] bg-[#2b1717] p-3 text-[#ffb7aa]">
          <div v-for="issue in validationIssues" :key="`${issue.field}:${issue.message}`" class="flex items-start gap-2 text-[13px] font-bold">
            <AlertCircle :size="16" class="mt-0.5 shrink-0" />
            <span>{{ issue.message }}</span>
          </div>
        </section>

        <div class="min-h-[260px] p-4">
          <section v-if="activeRequestTab === 'params'" class="grid gap-3">
            <div class="flex justify-end gap-2">
              <button class="mini-button" @click="emit('addParameter', 'query')"><Plus :size="15" /> Query</button>
              <button class="mini-button" @click="emit('addParameter', 'header')"><Plus :size="15" /> Header</button>
            </div>
            <div class="request-param-grid">
              <div class="table-head">On</div>
              <div class="table-head">Key</div>
              <div class="table-head">Location</div>
              <div class="table-head">Value</div>
              <div class="table-head"></div>
              <template v-if="parameters.length > 0">
                <template v-for="parameter in parameters" :key="parameter.id">
                  <div class="table-cell"><input type="checkbox" :checked="parameter.enabled" @change="emit('toggleParameter', parameter.id, checkedValue($event))" /></div>
                  <div class="table-cell">
                    <input v-if="parameter.source === 'custom'" :value="parameter.name" :class="fieldClass" placeholder="name" @input="emit('updateParameterName', parameter.id, inputValue($event))" />
                    <template v-else>
                      <strong>{{ parameter.name }}</strong>
                      <small v-if="parameter.required" class="ml-2 text-[#ffd166]">required</small>
                      <p v-if="parameter.description" class="mt-1 text-[#97a3ac]">{{ parameter.description }}</p>
                    </template>
                  </div>
                  <div class="table-cell text-[#9faab2]">{{ parameter.in }}</div>
                  <div class="table-cell"><input :value="parameter.value" :class="fieldClass" :placeholder="parameter.name" @input="emit('setParameter', parameter.id, inputValue($event))" /></div>
                  <div class="table-cell">
                    <button v-if="parameter.source === 'custom'" class="icon-button" title="Remove parameter" @click="emit('removeParameter', parameter.id)"><X :size="15" /></button>
                  </div>
                </template>
              </template>
              <div v-else class="col-span-5 grid min-h-[130px] place-items-center text-[#97a3ac]">No parameters yet.</div>
            </div>
          </section>

          <section v-else-if="activeRequestTab === 'auth'" class="grid gap-3">
            <div class="flex justify-end">
              <button class="mini-button" @click="emit('addHeader')"><Plus :size="15" /> Header</button>
            </div>
            <div class="request-header-grid">
              <div class="table-head">On</div>
              <div class="table-head">Header</div>
              <div class="table-head">Value</div>
              <div class="table-head"></div>
              <template v-if="headers.length > 0">
                <template v-for="header in headers" :key="header.id">
                  <div class="table-cell"><input type="checkbox" :checked="header.enabled" @change="emit('toggleHeader', header.id, checkedValue($event))" /></div>
                  <div class="table-cell"><input :value="header.name" :class="fieldClass" placeholder="x-api-key" @input="emit('updateHeader', header.id, 'name', inputValue($event))" /></div>
                  <div class="table-cell"><input :value="header.value" :class="fieldClass" placeholder="value" @input="emit('updateHeader', header.id, 'value', inputValue($event))" /></div>
                  <div class="table-cell"><button class="icon-button" title="Remove header" @click="emit('removeHeader', header.id)"><X :size="15" /></button></div>
                </template>
              </template>
              <div v-else class="col-span-4 grid min-h-[130px] place-items-center text-[#97a3ac]">No custom headers yet.</div>
            </div>
          </section>

          <section v-else-if="activeRequestTab === 'body'" class="grid gap-3">
            <div class="flex items-center justify-between gap-3">
              <span :class="eyebrowClass">Body</span>
              <select :value="activeDraft.contentType" class="h-9 min-w-[190px] rounded-md border border-[#303943] bg-[#0d1116] px-2 text-[13px] font-bold text-[#f3f7f5] outline-none" @change="emit('updateContentType', inputValue($event))">
                <option v-if="selectedContentTypes.length === 0" value="application/json">application/json</option>
                <option v-for="type in selectedContentTypes" :key="type" :value="type">{{ type }}</option>
              </select>
            </div>
            <textarea :value="activeDraft.body" class="min-h-[190px] w-full min-w-0 resize-y rounded-md border border-[#303943] bg-[#0d1116] p-3 font-mono text-[13px] leading-6 text-[#f3f7f5] outline-none transition placeholder:text-[#65717b] focus:border-[#1fc294] focus:shadow-[0_0_0_2px_rgba(31,194,148,0.14)]" spellcheck="false" placeholder="{ }" @input="emit('updateBodyValue', inputValue($event))"></textarea>
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
              <button class="mini-button" :disabled="!curlCommand" title="Copy cURL" @click="emit('copyCurl')">
                <Clipboard :size="15" />
                cURL
              </button>
            </div>
            <pre v-if="requestPreview" class="code-block min-h-[190px]">{{ prettyRequest }}</pre>
            <div v-else class="empty-state min-h-[190px] rounded-md border border-[#303943]">{{ isPreviewing ? "Preparing request..." : "Complete the request fields to preview it." }}</div>
          </section>
        </div>
      </section>

      <div v-else class="empty-state min-h-full px-6">
        <TerminalSquare :size="34" />
        <p class="m-0">Create a request tab to start.</p>
      </div>
    </div>

    <div v-else class="empty-state min-h-full px-6">
      <TerminalSquare :size="34" />
      <p class="m-0">Select an operation or custom request space.</p>
    </div>
  </div>
</template>
