<script setup lang="ts">
import { methodClass } from "../methodStyles";

defineProps<{
  method: string;
}>();
</script>

<template>
  <span :class="methodClass(method)">{{ method }}</span>
</template>
