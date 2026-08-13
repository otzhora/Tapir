<script setup lang="ts">
import { Minus, Square, X } from "lucide-vue-next";
import type { ServerWithDefinition, Workspace } from "@tapir/core";

defineProps<{
  selectedServer: ServerWithDefinition | null;
  workspace: Workspace | null;
}>();

function minimizeWindow(): void { window.tapir?.minimizeWindow(); }
function toggleMaximizeWindow(): void { window.tapir?.toggleMaximizeWindow(); }
function closeWindow(): void { window.tapir?.closeWindow(); }
</script>

<template>
  <header class="app-titlebar grid h-11 shrink-0 grid-cols-[138px_1fr_138px] items-center border-b border-[var(--tapir-border)] bg-[var(--tapir-bg-panel-strong)] text-[13px] text-[var(--tapir-text-soft)] shadow-[var(--tapir-header-shadow)]">
    <strong class="truncate px-3 text-[14px] text-[var(--tapir-text-strong)]">Tapir</strong>

    <div class="mx-auto flex max-w-[720px] min-w-0 items-center justify-center gap-2 px-3">
      <strong class="truncate text-[var(--tapir-text-soft)]">{{ selectedServer?.server.name ?? workspace?.name ?? "Local Workspace" }}</strong>
      <span class="hidden truncate text-[var(--tapir-text-subtle)] lg:inline">{{ selectedServer?.server.baseUrl ?? "Add an OpenAPI server to begin" }}</span>
    </div>
    <div class="window-controls">
      <button type="button" aria-label="Minimize window" title="Minimize" @click="minimizeWindow"><Minus :size="16" /></button>
      <button type="button" aria-label="Maximize window" title="Maximize" @click="toggleMaximizeWindow"><Square :size="12" /></button>
      <button class="is-close" type="button" aria-label="Close window" title="Close" @click="closeWindow"><X :size="16" /></button>
    </div>
  </header>
</template>
