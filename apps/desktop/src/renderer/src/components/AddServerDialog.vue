<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { Plus, RefreshCw, Server, X } from "lucide-vue-next";
import type { ServerWithDefinition } from "@tapir/core";
import { fieldClass, iconButtonClass, mutedTextClass, primaryActionClass, strongTextClass } from "../uiClasses";
import { bridgeUnavailableMessage, getTapirBridge } from "../tapirBridge";

const emit = defineEmits<{
  added: [server: ServerWithDefinition];
  cancel: [];
}>();

const baseUrl = ref("");
const specUrl = ref("");
const errorMessage = ref("");
const isAdding = ref(false);
const baseUrlInput = ref<HTMLInputElement | null>(null);

onMounted(() => nextTick(() => baseUrlInput.value?.focus()));

async function addServer(): Promise<void> {
  const tapir = getTapirBridge();
  errorMessage.value = "";
  if (!tapir) {
    errorMessage.value = bridgeUnavailableMessage;
    return;
  }

  isAdding.value = true;
  try {
    const explicitSpecUrl = specUrl.value.trim();
    const result = explicitSpecUrl
      ? await tapir.addServer(baseUrl.value, explicitSpecUrl)
      : await tapir.addServer(baseUrl.value);
    emit("added", { server: result.server, definition: result.normalized, variables: [], authentication: [] });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isAdding.value = false;
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/80 p-5" role="presentation" @mousedown.self="emit('cancel')">
    <section class="w-full max-w-[520px] overflow-hidden rounded-xl border border-[var(--tapir-border-strong)] bg-[var(--tapir-bg-panel-opaque)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="add-server-title" @keydown.esc="emit('cancel')">
      <header class="flex items-start justify-between gap-4 border-b border-[var(--tapir-border)] px-5 py-4">
        <div>
          <div class="flex items-center gap-2">
            <Server :size="19" class="text-[var(--tapir-accent)]" />
            <h2 id="add-server-title" :class="['m-0 text-[17px]', strongTextClass]">Add server</h2>
          </div>
          <p :class="['mb-0 mt-1 text-[13px]', mutedTextClass]">Connect an API and discover its OpenAPI operations.</p>
        </div>
        <button :class="[iconButtonClass, 'grid size-9 place-items-center p-0']" title="Close" type="button" @click="emit('cancel')"><X :size="17" /></button>
      </header>

      <form class="grid gap-4 p-5" @submit.prevent="addServer">
        <label class="grid gap-1.5 text-[13px] font-bold" for="base-url">
          Server base URL
          <input id="base-url" ref="baseUrlInput" v-model="baseUrl" :class="fieldClass" placeholder="https://api.example.com" required />
          <small :class="['font-normal leading-4', mutedTextClass]">Tapir checks common OpenAPI document URLs automatically.</small>
        </label>
        <label class="grid gap-1.5 text-[13px] font-bold" for="spec-url">
          OpenAPI URL <span :class="['font-normal', mutedTextClass]">(optional)</span>
          <input id="spec-url" v-model="specUrl" :class="fieldClass" placeholder="https://docs.example.com/openapi.json" />
          <small :class="['font-normal leading-4', mutedTextClass]">Use this when the document lives at a custom URL.</small>
        </label>
        <p v-if="errorMessage" class="m-0 rounded-md border border-[var(--tapir-danger-border)] bg-[var(--tapir-danger-bg)] p-2.5 text-[13px] text-[var(--tapir-danger)]" role="alert">{{ errorMessage }}</p>
        <footer class="mt-1 flex justify-end gap-2">
          <button class="h-9 rounded-md px-3 text-[13px] font-bold text-[var(--tapir-text-muted)] hover:bg-[var(--tapir-bg-control-hover)] hover:text-[var(--tapir-text-strong)]" type="button" @click="emit('cancel')">Cancel</button>
          <button :class="[primaryActionClass, 'h-9 px-4']" type="submit" :disabled="isAdding || !baseUrl.trim()">
            <RefreshCw v-if="isAdding" :size="16" class="animate-spin" />
            <Plus v-else :size="17" />
            {{ isAdding ? "Discovering" : "Add server" }}
          </button>
        </footer>
      </form>
    </section>
  </div>
</template>
