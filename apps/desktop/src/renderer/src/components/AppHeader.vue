<script setup lang="ts">
import { Activity, Server, Sparkles } from "lucide-vue-next";
import type { ServerWithDefinition, Workspace } from "@tapir/core";

defineProps<{
  operationsCount: number;
  selectedServer: ServerWithDefinition | null;
  serversCount: number;
  workspace: Workspace | null;
}>();

</script>

<template>
  <header class="app-titlebar grid h-11 shrink-0 grid-cols-[auto_1fr_auto] items-center border-b border-[var(--tapir-border)] bg-[var(--tapir-bg-panel-strong)] text-[13px] text-[var(--tapir-text-soft)] shadow-[var(--tapir-header-shadow)]">
    <div class="flex min-w-0 items-center gap-2 px-2">
      <div class="grid size-6 shrink-0 place-items-center rounded-md border border-[var(--tapir-border-control)] bg-[var(--tapir-bg-control-hover)] text-[var(--tapir-accent)] shadow-[var(--tapir-icon-inset-shadow)]">
        <Sparkles :size="14" />
      </div>
      <strong class="truncate text-[14px] text-[var(--tapir-text-strong)]">Tapir</strong>
    </div>

    <div class="mx-auto flex max-w-[680px] min-w-0 items-center justify-center gap-2 px-3 text-[var(--tapir-text-muted)]">
      <Server :size="15" class="shrink-0 text-[var(--tapir-accent)]" />
      <span class="truncate text-[var(--tapir-text)]">{{ selectedServer?.server.name ?? workspace?.name ?? "Local Workspace" }}</span>
      <span class="hidden truncate text-[var(--tapir-text-muted)] lg:inline">{{ selectedServer?.server.baseUrl ?? "Add an OpenAPI server to begin" }}</span>
    </div>

    <div class="mr-[138px] flex items-center justify-end gap-2 px-3">
      <span class="status-pill" title="Loaded servers">
        <Server :size="13" />
        {{ serversCount }}
      </span>
      <span class="status-pill" title="Loaded operations">
        <Activity :size="13" />
        {{ operationsCount }}
      </span>
    </div>
  </header>
</template>
