<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { AlertCircle, Download, LoaderCircle, Minus, RotateCcw, Square, X } from "lucide-vue-next";
import type { ServerWithDefinition, Workspace } from "@tapir/core";
import type { AppUpdateState } from "@tapir/core";

defineProps<{
  selectedServer: ServerWithDefinition | null;
  workspace: Workspace | null;
}>();

function minimizeWindow(): void { window.tapir?.minimizeWindow(); }
function toggleMaximizeWindow(): void { window.tapir?.toggleMaximizeWindow(); }
function closeWindow(): void { window.tapir?.closeWindow(); }

const isUpdateMenuOpen = ref(false);
const updateState = ref<AppUpdateState>({ currentVersion: "", status: "disabled" });
let removeUpdateListener: (() => void) | undefined;

const isUpdateBusy = computed(() => updateState.value.status === "checking" || updateState.value.status === "downloading");
const showUpdateButton = computed(() => Boolean(updateState.value.availableVersion) && ["available", "downloading", "downloaded", "error"].includes(updateState.value.status));
const updateStatusLabel = computed(() => {
  switch (updateState.value.status) {
    case "downloading": return `Downloading update ${Math.round(updateState.value.downloadPercent ?? 0)}%`;
    case "downloaded": return "Update ready to install";
    case "error": return "Update failed";
    default: return "Update available";
  }
});

function applyUpdateState(state: AppUpdateState): void {
  updateState.value = state;
  if (["downloading", "downloaded", "error"].includes(state.status) && state.availableVersion) {
    isUpdateMenuOpen.value = true;
  }
}

onMounted(async () => {
  const tapir = window.tapir;
  if (!tapir?.getUpdateState) return;
  applyUpdateState(await tapir.getUpdateState());
  removeUpdateListener = tapir.onUpdateState(applyUpdateState);
});

onBeforeUnmount(() => removeUpdateListener?.());

async function downloadUpdate(): Promise<void> {
  const state = await window.tapir?.downloadUpdate();
  if (state) applyUpdateState(state);
}

function installUpdate(): void {
  void window.tapir?.installUpdate();
}
</script>

<template>
  <header class="app-titlebar relative z-50 grid h-11 shrink-0 grid-cols-[184px_1fr_184px] items-center border-b border-[var(--tapir-border)] bg-[var(--tapir-bg-panel-strong)] text-[13px] text-[var(--tapir-text-soft)] shadow-[var(--tapir-header-shadow)]">
    <strong class="truncate px-3 text-[14px] text-[var(--tapir-text-strong)]">Tapir</strong>

    <div class="mx-auto flex max-w-[720px] min-w-0 items-center justify-center gap-2 px-3">
      <strong class="truncate text-[var(--tapir-text-soft)]">{{ selectedServer?.server.name ?? workspace?.name ?? "Local Workspace" }}</strong>
      <span class="hidden truncate text-[var(--tapir-text-subtle)] lg:inline">{{ selectedServer?.server.baseUrl ?? "Add an OpenAPI server to begin" }}</span>
    </div>
    <div class="flex h-11 items-center justify-end">
      <div v-if="showUpdateButton" class="relative grid h-11 w-[46px] place-items-center">
        <button
          class="update-titlebar-button relative grid size-9 place-items-center rounded-md text-[var(--tapir-accent)] transition hover:bg-[var(--tapir-bg-control-active)] hover:text-[var(--tapir-text-strong)]"
          :class="{ 'bg-[var(--tapir-bg-control-active)]': updateState.status === 'downloading' || updateState.status === 'downloaded' }"
          type="button"
          :aria-label="updateStatusLabel"
          :title="updateStatusLabel"
          @click="isUpdateMenuOpen = !isUpdateMenuOpen"
        >
          <LoaderCircle v-if="isUpdateBusy" :size="17" class="animate-spin" />
          <RotateCcw v-else-if="updateState.status === 'downloaded'" :size="17" />
          <AlertCircle v-else-if="updateState.status === 'error'" :size="17" class="text-[var(--tapir-danger)]" />
          <Download v-else :size="17" />
          <span
            class="absolute right-1.5 top-1.5 size-1.5 rounded-full"
            :class="updateState.status === 'error' ? 'bg-[var(--tapir-danger)]' : updateState.status === 'downloaded' ? 'bg-[var(--tapir-success)]' : 'bg-[var(--tapir-accent)]'"
          ></span>
        </button>

        <section v-if="isUpdateMenuOpen" class="update-popover absolute right-0 top-[42px] z-50 w-[320px] rounded-lg border border-[var(--tapir-border-strong)] bg-[var(--tapir-bg-panel-opaque)] p-4 shadow-2xl" aria-label="Tapir updates" aria-live="polite">
          <div class="mb-3 flex items-start justify-between gap-3">
            <div>
              <strong class="block text-[14px] text-[var(--tapir-text-strong)]">Tapir updates</strong>
              <span class="text-[11px] text-[var(--tapir-text-subtle)]">Current version {{ updateState.currentVersion || "development" }}</span>
            </div>
            <span class="rounded-full bg-[var(--tapir-bg-control)] px-2 py-1 text-[10px] font-semibold text-[var(--tapir-text-soft)]">{{ updateStatusLabel }}</span>
          </div>
          <p class="m-0 text-[12px] leading-5 text-[var(--tapir-text-muted)]">{{ updateState.message || "A newer Tapir release is available." }}</p>
          <div v-if="updateState.status === 'downloading'" class="mt-3">
            <div class="mb-1 flex justify-between text-[11px] text-[var(--tapir-text-subtle)]"><span>Downloading</span><span>{{ Math.round(updateState.downloadPercent ?? 0) }}%</span></div>
            <div class="h-1.5 overflow-hidden rounded-full bg-[var(--tapir-bg-control)]">
              <div class="h-full rounded-full bg-[var(--tapir-accent)] transition-[width]" :style="{ width: `${updateState.downloadPercent ?? 0}%` }"></div>
            </div>
          </div>
          <div class="mt-4 flex justify-end gap-2">
            <button v-if="updateState.status === 'available' || updateState.status === 'error'" class="chrome-button is-active" type="button" @click="downloadUpdate"><Download :size="14" />{{ updateState.status === 'error' ? 'Retry download' : 'Download' }}</button>
            <button v-else-if="updateState.status === 'downloaded'" class="chrome-button is-active" type="button" @click="installUpdate"><RotateCcw :size="14" />Restart &amp; install</button>
          </div>
        </section>
      </div>
      <div class="window-controls">
        <button type="button" aria-label="Minimize window" title="Minimize" @click="minimizeWindow"><Minus :size="16" /></button>
        <button type="button" aria-label="Maximize window" title="Maximize" @click="toggleMaximizeWindow"><Square :size="12" /></button>
        <button class="is-close" type="button" aria-label="Close window" title="Close" @click="closeWindow"><X :size="16" /></button>
      </div>
    </div>
  </header>
</template>
