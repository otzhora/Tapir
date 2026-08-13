<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Download, LoaderCircle, Minus, RotateCcw, Square, X } from "lucide-vue-next";
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

onMounted(async () => {
  const tapir = window.tapir;
  if (!tapir?.getUpdateState) return;
  updateState.value = await tapir.getUpdateState();
  removeUpdateListener = tapir.onUpdateState((state) => { updateState.value = state; });
});

onBeforeUnmount(() => removeUpdateListener?.());

async function downloadUpdate(): Promise<void> {
  const state = await window.tapir?.downloadUpdate();
  if (state) updateState.value = state;
}

function installUpdate(): void {
  void window.tapir?.installUpdate();
}
</script>

<template>
  <header class="app-titlebar grid h-11 shrink-0 grid-cols-[184px_1fr_184px] items-center border-b border-[var(--tapir-border)] bg-[var(--tapir-bg-panel-strong)] text-[13px] text-[var(--tapir-text-soft)] shadow-[var(--tapir-header-shadow)]">
    <strong class="truncate px-3 text-[14px] text-[var(--tapir-text-strong)]">Tapir</strong>

    <div class="mx-auto flex max-w-[720px] min-w-0 items-center justify-center gap-2 px-3">
      <strong class="truncate text-[var(--tapir-text-soft)]">{{ selectedServer?.server.name ?? workspace?.name ?? "Local Workspace" }}</strong>
      <span class="hidden truncate text-[var(--tapir-text-subtle)] lg:inline">{{ selectedServer?.server.baseUrl ?? "Add an OpenAPI server to begin" }}</span>
    </div>
    <div class="flex h-11 items-center justify-end">
      <div v-if="showUpdateButton" class="relative grid h-11 w-[46px] place-items-center">
        <button
          class="update-titlebar-button relative grid size-9 place-items-center rounded-md text-[var(--tapir-accent)] transition hover:bg-[var(--tapir-bg-control-active)] hover:text-[var(--tapir-text-strong)]"
          type="button"
          aria-label="App updates"
          title="App updates"
          @click="isUpdateMenuOpen = !isUpdateMenuOpen"
        >
          <LoaderCircle v-if="isUpdateBusy" :size="17" class="animate-spin" />
          <Download v-else :size="17" />
          <span class="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[var(--tapir-accent)]"></span>
        </button>

        <section v-if="isUpdateMenuOpen" class="update-popover absolute right-0 top-[42px] z-50 w-[320px] rounded-lg border border-[var(--tapir-border-strong)] bg-[var(--tapir-bg-panel-opaque)] p-4 shadow-2xl" aria-label="Tapir updates">
          <div class="mb-3 flex items-start justify-between gap-3">
            <div>
              <strong class="block text-[14px] text-[var(--tapir-text-strong)]">Tapir updates</strong>
              <span class="text-[11px] text-[var(--tapir-text-subtle)]">Current version {{ updateState.currentVersion || "development" }}</span>
            </div>
          </div>
          <p class="m-0 text-[12px] leading-5 text-[var(--tapir-text-muted)]">{{ updateState.message || "A newer Tapir release is available." }}</p>
          <div v-if="updateState.status === 'downloading'" class="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--tapir-bg-control)]">
            <div class="h-full rounded-full bg-[var(--tapir-accent)] transition-[width]" :style="{ width: `${updateState.downloadPercent ?? 0}%` }"></div>
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
