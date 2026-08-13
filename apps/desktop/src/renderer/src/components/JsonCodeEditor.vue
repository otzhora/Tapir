<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { AlertCircle, Search } from "lucide-vue-next";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import { openSearchPanel } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";

type EditorLanguage = "json" | "text" | "curl";

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
    padding: "13px 0",
    caretColor: "var(--tapir-accent)"
  },
  ".cm-line": {
    padding: "0 7px"
  },
  ".cm-gutters": {
    backgroundColor: "rgba(255, 255, 255, 0.018)",
    color: "#73777f",
    borderRight: "1px solid var(--tapir-border)"
  },
  ".cm-foldGutter .cm-gutterElement": {
    display: "flex",
    boxSizing: "border-box",
    width: "18px !important",
    minWidth: "18px !important",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 !important",
    color: "var(--tapir-text-muted)",
    fontSize: "0",
    fontWeight: "800",
    lineHeight: "1"
  },
  ".cm-foldGutter": {
    boxSizing: "border-box",
    flex: "0 0 18px !important",
    width: "18px !important",
    minWidth: "18px !important",
    maxWidth: "18px !important",
    overflow: "hidden"
  },
  ".cm-foldGutter .cm-gutterElement span": {
    display: "grid",
    width: "16px",
    height: "100%",
    placeItems: "center",
    borderRadius: "0",
    fontSize: "0",
    lineHeight: "1",
    transform: "none"
  },
  ".cm-foldGutter span[title='Fold line']::after": {
    content: "'▾'",
    color: "var(--tapir-text-muted)",
    fontSize: "14px",
    lineHeight: "1"
  },
  ".cm-foldGutter span[title='Unfold line']::after": {
    content: "'▸'",
    color: "var(--tapir-text-muted)",
    fontSize: "14px",
    lineHeight: "1"
  },
  ".cm-foldGutter span[title]:hover::after": {
    color: "var(--tapir-text-strong)"
  },
  ".cm-lineNumbers .cm-gutterElement": {
    boxSizing: "border-box",
    width: "30px !important",
    minWidth: "30px !important",
    padding: "0 5px 0 2px !important"
  },
  ".cm-lineNumbers": {
    boxSizing: "border-box",
    flex: "0 0 30px !important",
    width: "30px !important",
    minWidth: "30px !important",
    maxWidth: "30px !important"
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
  },
  ".tok-curl-command": {
    color: "var(--tapir-method-get-text)",
    fontWeight: "800"
  },
  ".tok-curl-option": {
    color: "var(--tapir-accent)"
  },
  ".tok-curl-string": {
    color: "var(--tapir-warning)"
  },
  ".tok-curl-url": {
    color: "var(--tapir-success)",
    textDecoration: "underline",
    textDecorationColor: "rgba(142, 228, 201, 0.35)"
  }
});

const tapirHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: "#9fcbff" },
  { tag: [tags.string, tags.special(tags.string)], color: "#e5b77f" },
  { tag: [tags.number, tags.bool], color: "#bda5ee" },
  { tag: tags.null, color: "#98a0ac", fontStyle: "italic" },
  { tag: [tags.keyword, tags.operator], color: "#88c7ba" },
  { tag: [tags.brace, tags.squareBracket, tags.paren], color: "#c7cbd1" },
  { tag: tags.comment, color: "#737b84", fontStyle: "italic" },
  { tag: tags.invalid, color: "var(--tapir-danger)", textDecoration: "underline" }
]);

const curlHighlighting = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = curlDecorations(view);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) this.decorations = curlDecorations(update.view);
  }
}, { decorations: (plugin) => plugin.decorations });

function editorExtensions(): Extension[] {
  const languageExtensions = props.language === "json"
    ? [json(), linter(jsonParseLinter())]
    : props.language === "curl" ? [curlHighlighting] : [];

  return [
    basicSetup,
    syntaxHighlighting(tapirHighlightStyle),
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

function curlDecorations(view: EditorView): DecorationSet {
  const ranges: Array<{ from: number; to: number; className: string }> = [];
  const tokenPattern = /(^|\s)(curl(?:\.exe)?)(?=\s)|(--?[\w-]+)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(https?:\/\/[^\s'"]+)/gi;
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (const match of text.matchAll(tokenPattern)) {
      const start = from + (match.index ?? 0);
      if (match[2]) {
        const commandStart = start + match[1]!.length;
        ranges.push({ from: commandStart, to: commandStart + match[2].length, className: "tok-curl-command" });
      } else if (match[3]) {
        ranges.push({ from: start, to: start + match[3].length, className: "tok-curl-option" });
      } else if (match[4]) {
        ranges.push({ from: start, to: start + match[4].length, className: "tok-curl-string" });
      } else if (match[5]) {
        ranges.push({ from: start, to: start + match[5].length, className: "tok-curl-url" });
      }
    }
  }
  return Decoration.set(ranges.map((range) => Decoration.mark({ class: range.className }).range(range.from, range.to)), true);
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
      <button class="icon-button" type="button" :title="language === 'json' ? 'Search JSON' : language === 'curl' ? 'Search cURL' : 'Search body'" @click="openSearch">
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
