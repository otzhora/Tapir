<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { AlertCircle, Search } from "lucide-vue-next";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { openSearchPanel } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, basicSetup } from "codemirror";

type EditorLanguage = "json" | "text";

const props = withDefaults(defineProps<{
  modelValue: string;
  editable?: boolean;
  language?: EditorLanguage;
  minHeight?: string;
  placeholder?: string;
  title?: string;
}>(), {
  editable: true,
  language: "json",
  minHeight: "190px",
  placeholder: "{ }",
  title: "JSON editor"
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;

const jsonIssue = computed(() => {
  if (props.language !== "json") return "";
  if (!props.modelValue.trim()) return "";
  try {
    JSON.parse(props.modelValue);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid JSON";
  }
});

const editorTheme = EditorView.theme({
  "&": {
    minHeight: props.minHeight,
    height: "100%",
    color: "var(--tapir-text)",
    backgroundColor: "var(--tapir-bg-code)",
    borderRadius: "7px",
    fontSize: "13px"
  },
  "&.cm-focused": {
    outline: "none",
    boxShadow: "0 0 0 2px var(--tapir-focus-ring)"
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--tapir-accent)"
  },
  ".cm-scroller": {
    minHeight: props.minHeight,
    fontFamily: "\"Cascadia Code\", \"SFMono-Regular\", Consolas, monospace",
    lineHeight: "1.65"
  },
  ".cm-content": {
    padding: "12px 0"
  },
  ".cm-line": {
    padding: "0 14px"
  },
  ".cm-gutters": {
    backgroundColor: "rgba(255, 255, 255, 0.025)",
    color: "var(--tapir-text-subtle)",
    borderRight: "1px solid var(--tapir-border)"
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "rgba(255, 255, 255, 0.055)"
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--tapir-selection)"
  },
  ".cm-matchingBracket, .cm-nonmatchingBracket": {
    backgroundColor: "rgba(159, 190, 255, 0.18)",
    outline: "1px solid var(--tapir-accent)"
  },
  ".cm-foldPlaceholder": {
    border: "1px solid var(--tapir-border-control)",
    backgroundColor: "var(--tapir-bg-control)",
    color: "var(--tapir-text-soft)"
  },
  ".cm-diagnostic": {
    fontFamily: "\"Aptos\", \"Segoe UI\", sans-serif"
  },
  ".cm-panels": {
    borderColor: "var(--tapir-border)",
    backgroundColor: "var(--tapir-bg-panel-strong)",
    color: "var(--tapir-text)"
  },
  ".cm-search label": {
    color: "var(--tapir-text-soft)"
  },
  ".cm-textfield": {
    border: "1px solid var(--tapir-border-control)",
    borderRadius: "6px",
    backgroundColor: "var(--tapir-bg-field)",
    color: "var(--tapir-text-strong)"
  },
  ".cm-button": {
    border: "1px solid var(--tapir-border-control)",
    borderRadius: "6px",
    backgroundImage: "none",
    backgroundColor: "var(--tapir-bg-control)",
    color: "var(--tapir-text-strong)"
  }
});

function editorExtensions(): Extension[] {
  const languageExtensions = props.language === "json"
    ? [lintGutter(), json(), linter(jsonParseLinter())]
    : [];

  return [
    basicSetup,
    ...languageExtensions,
    EditorState.readOnly.of(!props.editable),
    EditorView.editable.of(props.editable),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (!update.docChanged || !props.editable) return;
      emit("update:modelValue", update.state.doc.toString());
    }),
    editorTheme
  ];
}

function createEditor(): void {
  if (!host.value) return;
  view?.destroy();
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: editorExtensions()
    })
  });
}

function openSearch(): void {
  if (view) openSearchPanel(view);
}

watch(() => props.modelValue, (nextValue) => {
  if (!view || nextValue === view.state.doc.toString()) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: nextValue }
  });
});

watch(() => props.language, createEditor);

onMounted(createEditor);

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});
</script>

<template>
  <div class="json-editor-shell">
    <div class="json-editor-toolbar">
      <span class="truncate text-[12px] font-black uppercase tracking-[0.08em] text-[var(--tapir-text-muted)]">{{ title }}</span>
      <button class="icon-button" type="button" :title="language === 'json' ? 'Search JSON' : 'Search body'" @click="openSearch">
        <Search :size="15" />
      </button>
    </div>
    <div ref="host" class="json-editor-host" :aria-label="title" />
    <div v-if="!modelValue && placeholder" class="json-editor-placeholder">{{ placeholder }}</div>
    <p v-if="jsonIssue" class="field-error mt-2">
      <AlertCircle :size="14" class="mt-0.5 shrink-0" />
      <span>{{ jsonIssue }}</span>
    </p>
  </div>
</template>
