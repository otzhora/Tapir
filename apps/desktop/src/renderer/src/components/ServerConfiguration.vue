<script setup lang="ts">
import { ref, watch } from "vue";
import { Plus, RefreshCw, Save, Server, Trash2, Variable } from "lucide-vue-next";
import type { ServerVariable, ServerWithDefinition } from "@tapir/core";
import { fieldClass, iconButtonClass, mutedTextClass, primaryActionClass, strongTextClass } from "../uiClasses";
import { bridgeUnavailableMessage, getTapirBridge as getAvailableTapirBridge } from "../tapirBridge";

const props = defineProps<{
  server: ServerWithDefinition;
}>();

const emit = defineEmits<{
  variablesSaved: [serverId: string, variables: ServerVariable[]];
}>();

const activeTab = ref<"variables">("variables");
const errorMessage = ref("");
const successMessage = ref("");
const isSaving = ref(false);
const variableDrafts = ref<Array<{ id?: string; key: string; value: string }>>([]);

watch(() => props.server.server.id, () => {
  variableDrafts.value = props.server.variables.map((variable) => ({
    id: variable.id,
    key: variable.key,
    value: variable.value
  }));
  errorMessage.value = "";
  successMessage.value = "";
}, { immediate: true });

function addVariable(): void {
  variableDrafts.value = [...variableDrafts.value, { key: "", value: "" }];
}

function removeVariable(index: number): void {
  variableDrafts.value = variableDrafts.value.filter((_variable, candidateIndex) => candidateIndex !== index);
}

async function saveVariables(): Promise<void> {
  errorMessage.value = "";
  successMessage.value = "";
  const tapir = getAvailableTapirBridge();
  if (!tapir) {
    errorMessage.value = bridgeUnavailableMessage;
    return;
  }
  isSaving.value = true;
  try {
    const result = await tapir.saveServerVariables({
      serverId: props.server.server.id,
      variables: variableDrafts.value.map((variable) => ({ ...variable }))
    });
    variableDrafts.value = result.variables.map((variable) => ({
      id: variable.id,
      key: variable.key,
      value: variable.value
    }));
    emit("variablesSaved", props.server.server.id, result.variables);
    successMessage.value = "Variables saved.";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="grid min-h-0 grid-rows-[auto_auto_1fr] overflow-auto bg-[var(--tapir-bg-panel-soft)]">
    <header class="flex items-center gap-3 border-b border-[var(--tapir-border)] bg-[var(--tapir-bg-panel-strong)] px-5 py-4 shadow-[var(--tapir-inset-header-shadow)]">
      <div class="grid size-10 shrink-0 place-items-center rounded-md border border-[var(--tapir-border-control)] bg-[var(--tapir-bg-control)] text-[var(--tapir-accent)]">
        <Server :size="20" />
      </div>
      <div class="min-w-0">
        <h1 :class="['m-0 truncate text-[18px] font-bold', strongTextClass]">{{ server.server.name }}</h1>
        <p :class="['m-0 truncate text-[13px]', mutedTextClass]">Server configuration · {{ server.server.baseUrl }}</p>
      </div>
    </header>

    <nav class="flex min-w-0 gap-1 border-b border-[var(--tapir-border)] bg-[var(--tapir-bg-panel-muted)] px-4">
      <button class="tab-button is-active" type="button" @click="activeTab = 'variables'">
        Variables
        <span class="rounded bg-[var(--tapir-bg-control-hover)] px-1.5 py-0.5 text-[11px] text-[var(--tapir-text-soft)]">{{ variableDrafts.length }}</span>
      </button>
    </nav>

    <main v-if="activeTab === 'variables'" class="p-5">
      <section class="mx-auto grid max-w-5xl gap-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <Variable :size="17" :class="mutedTextClass" />
              <h2 :class="['m-0 text-[15px] font-black', strongTextClass]">Variables</h2>
            </div>
            <p :class="['mb-0 mt-1 text-[13px]', mutedTextClass]">Reusable values available to requests for this server.</p>
          </div>
          <button class="mini-button shrink-0" type="button" @click="addVariable"><Plus :size="14" /> Add variable</button>
        </div>

        <p v-if="errorMessage" class="m-0 rounded-md border border-[var(--tapir-danger-border)] bg-[var(--tapir-danger-bg)] p-3 text-[13px] text-[var(--tapir-danger)]">{{ errorMessage }}</p>
        <p v-if="successMessage" class="m-0 rounded-md border border-[var(--tapir-method-get-border)] bg-[var(--tapir-method-get-bg)] p-3 text-[13px] text-[var(--tapir-success)]">{{ successMessage }}</p>

        <div class="overflow-hidden rounded-md border border-[var(--tapir-border-control)] bg-[var(--tapir-bg-field)]">
          <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_48px] border-b border-[var(--tapir-border)] bg-[var(--tapir-bg-panel-muted)]">
            <div class="table-head">Variable</div>
            <div class="table-head">Value</div>
            <div class="table-head"></div>
          </div>
          <div v-for="(variable, index) in variableDrafts" :key="variable.id ?? index" class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_48px] border-b border-[var(--tapir-border)] last:border-b-0">
            <div class="table-cell"><input v-model="variable.key" :class="fieldClass" placeholder="baseUrl" /></div>
            <div class="table-cell"><input v-model="variable.value" :class="fieldClass" placeholder="https://api.example.com" /></div>
            <div class="table-cell grid place-items-center">
              <button :class="['grid size-8 place-items-center', iconButtonClass]" title="Remove variable" type="button" @click="removeVariable(index)"><Trash2 :size="15" /></button>
            </div>
          </div>
          <div v-if="variableDrafts.length === 0" :class="['grid min-h-[140px] place-items-center p-4 text-[13px]', mutedTextClass]">No variables yet.</div>
        </div>

        <div class="flex justify-end">
          <button :class="[primaryActionClass, 'h-9 min-w-[150px] px-4']" type="button" :disabled="isSaving" @click="saveVariables">
            <RefreshCw v-if="isSaving" :size="16" class="animate-spin" />
            <Save v-else :size="16" />
            Save variables
          </button>
        </div>
      </section>
    </main>
  </div>
</template>
