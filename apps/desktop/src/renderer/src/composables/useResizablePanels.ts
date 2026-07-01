import { computed, reactive, ref } from "vue";
import type { CollapsedPanels } from "../types";

type ColumnPanel = "servers" | "operations" | "history";

export function useResizablePanels() {
  const leftWidth = ref(200);
  const operationsWidth = ref(220);
  const historyWidth = ref(180);
  const responseHeight = ref(260);
  const isResizingLayout = ref(false);
  const collapsedPanels = reactive<CollapsedPanels>({ servers: false, operations: false, history: false, response: false });

  const shellStyle = computed(() => ({
    gridTemplateColumns: `${collapsedPanels.servers ? 44 : leftWidth.value}px 6px ${collapsedPanels.operations ? 44 : operationsWidth.value}px 6px minmax(260px, 1fr) 6px ${collapsedPanels.history ? 44 : historyWidth.value}px`
  }));

  const responseStyle = computed(() => ({
    gridTemplateRows: `minmax(280px, 1fr) 6px ${collapsedPanels.response ? 44 : responseHeight.value}px`
  }));

  function startColumnResize(target: ColumnPanel, event: MouseEvent): void {
    const startX = event.clientX;
    const startWidths = { left: leftWidth.value, operations: operationsWidth.value, history: historyWidth.value };
    collapsedPanels[target] = false;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      if (target === "servers") leftWidth.value = clamp(startWidths.left + delta, 44, 340);
      if (target === "operations") operationsWidth.value = clamp(startWidths.operations + delta, 44, 400);
      if (target === "history") historyWidth.value = clamp(startWidths.history - delta, 44, 340);
    };

    const onUp = () => {
      if (target === "servers") settlePanel("servers", leftWidth, 160);
      if (target === "operations") settlePanel("operations", operationsWidth, 180);
      if (target === "history") settlePanel("history", historyWidth, 160);
      stopResizing(onMove, onUp);
    };

    startResizing();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startResponseResize(event: MouseEvent): void {
    const startY = event.clientY;
    const startHeight = responseHeight.value;
    collapsedPanels.response = false;

    const onMove = (moveEvent: MouseEvent) => {
      responseHeight.value = clamp(startHeight - (moveEvent.clientY - startY), 44, window.innerHeight - 220);
    };

    const onUp = () => {
      settlePanel("response", responseHeight, 150);
      stopResizing(onMove, onUp);
    };

    startResizing();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function settlePanel(panel: keyof CollapsedPanels, size: { value: number }, expandedMin: number): void {
    if (size.value <= 92) collapsedPanels[panel] = true;
    if (!collapsedPanels[panel]) size.value = Math.max(size.value, expandedMin);
  }

  function startResizing(): void {
    isResizingLayout.value = true;
    document.body.classList.add("is-resizing");
  }

  function stopResizing(onMove: (event: MouseEvent) => void, onUp: () => void): void {
    document.body.classList.remove("is-resizing");
    isResizingLayout.value = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }

  return {
    collapsedPanels,
    isResizingLayout,
    responseStyle,
    shellStyle,
    startColumnResize,
    startResponseResize
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
