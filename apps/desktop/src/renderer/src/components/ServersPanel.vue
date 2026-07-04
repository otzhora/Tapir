<script setup lang="ts">
import { ref } from "vue";
import { ChevronLeft, Plus, RefreshCw, Server } from "lucide-vue-next";
import type { ServerWithDefinition, Workspace } from "@tapir/core";
import { activeItemClass, eyebrowClass, fieldClass, itemClass, panelClass } from "../uiClasses";
import { bridgeUnavailableMessage, getTapirBridge as getAvailableTapirBridge } from "../tapirBridge";

defineProps<{
  collapsed: boolean;
  selectedServerId: string | null;
  servers: ServerWithDefinition[];
  workspace: Workspace | null;
}>();

const emit = defineEmits<{
  collapse: [value: boolean];
  serverAdded: [server: ServerWithDefinition];
  selectServer: [serverId: string];
}>();

const baseUrl = ref("");
const errorMessage = ref("");
const isAddingServer = ref(false);

async function addServer(): Promise<void> {
  errorMessage.value = "";
  const tapir = getTapirBridge();
  if (!tapir) return;
  isAddingServer.value = true;
  try {
    const result = await tapir.addServer(baseUrl.value);
    const server = { server: result.server, definition: result.normalized };
    emit("serverAdded", server);
    emit("selectServer", result.server.id);
    baseUrl.value = "";
  } catch (error) {
    errorMessage.value = toErrorMessage(error);
  } finally {
    isAddingServer.value = false;
  }
}

function getTapirBridge() {
  const tapir = getAvailableTapirBridge();
  if (!tapir) errorMessage.value = bridgeUnavailableMessage;
  return tapir;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
</script>

<template>
  <aside :class="[panelClass, collapsed && 'overflow-hidden px-2']">
    <button v-if="collapsed" class="grid h-full w-full place-items-start pt-3 text-[#97a3ac]" title="Expand servers" @click="emit('collapse', false)">
      <Server :size="20" />
    </button>
    <template v-else>
      <div class="mb-5 flex items-center gap-3">
        <div class="grid size-9 place-items-center rounded-md border border-[#2d7b68] bg-[#1fc294] font-black text-[#06110f] shadow-[0_8px_22px_rgba(31,194,148,0.14)]">T</div>
        <div>
          <h1 class="m-0 text-[20px] font-bold text-[#f3f7f5]">Tapir</h1>
          <p class="m-0 text-[13px] text-[#97a3ac]">{{ workspace?.name ?? "Local Workspace" }}</p>
        </div>
        <button class="ml-auto rounded-md p-1.5 text-[#97a3ac] transition hover:bg-[#232a31] hover:text-white" title="Collapse servers" @click="emit('collapse', true)">
          <ChevronLeft :size="17" />
        </button>
      </div>

      <form class="mb-4 grid gap-2.5" @submit.prevent="addServer">
        <label for="base-url" :class="eyebrowClass">Add Server</label>
        <div class="grid grid-cols-[minmax(0,1fr)_44px] gap-2.5">
          <input id="base-url" v-model="baseUrl" :class="fieldClass" placeholder="https://api.example.com" required />
          <button class="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#1fc294] font-extrabold text-[#06110f] shadow-[0_8px_18px_rgba(31,194,148,0.12)] transition hover:bg-[#34d0a5] disabled:cursor-not-allowed disabled:opacity-60" type="submit" :disabled="isAddingServer || !baseUrl.trim()" title="Discover spec">
            <RefreshCw v-if="isAddingServer" :size="17" class="animate-spin" />
            <Plus v-else :size="18" />
          </button>
        </div>
      </form>

      <p v-if="errorMessage" class="my-2.5 rounded-md border border-[#7a352f] bg-[#2b1717] p-2.5 text-[13px] text-[#ffb7aa]">{{ errorMessage }}</p>

      <div class="grid gap-2.5">
        <button
          v-for="item in servers"
          :key="item.server.id"
          :class="[itemClass, item.server.id === selectedServerId && activeItemClass]"
          @click="emit('selectServer', item.server.id)"
        >
          <Server :size="17" />
          <span class="grid min-w-0 gap-[3px]">
            <strong class="truncate">{{ item.server.name }}</strong>
            <small class="truncate text-[#97a3ac]">{{ item.server.baseUrl }}</small>
          </span>
        </button>
      </div>
    </template>
  </aside>
</template>
