import { computed, reactive, ref } from "vue";
import type { CollapsedPanels } from "../types";

export function useResizablePanels() {
  const leftWidth = ref(320);
  const responseHeight = ref(260);
  const isResizingLayout = ref(false);
  const collapsedPanels = reactive<CollapsedPanels>({ operations: false, response: false });

  const shellStyle = computed(() => ({
    gridTemplateColumns: `${leftWidth.value}px 6px minmax(260px, 1fr)`
  }));

  const responseStyle = computed(() => ({
    gridTemplateRows: `minmax(280px, 1fr) 6px ${collapsedPanels.response ? 44 : responseHeight.value}px`
  }));

  function startColumnResize(event: MouseEvent): void {
    const startX = event.clientX;
    const startWidth = leftWidth.value;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      leftWidth.value = clamp(startWidth + delta, 240, 440);
    };

    const onUp = () => {
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
