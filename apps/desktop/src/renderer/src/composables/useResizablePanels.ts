import { computed, getCurrentInstance, onBeforeUnmount, reactive, ref } from "vue";
import type { CollapsedPanels } from "../types";

export function useResizablePanels() {
  const leftWidth = ref(320);
  const responseHeight = ref(320);
  const isResizingLayout = ref(false);
  const collapsedPanels = reactive<CollapsedPanels>({ operations: false, response: false });
  let activeCleanup: (() => void) | null = null;

  const shellStyle = computed(() => ({
    gridTemplateColumns: `${leftWidth.value}px 1px minmax(260px, 1fr)`
  }));

  const responseStyle = computed(() => ({
    gridTemplateRows: `minmax(280px, 1fr) 1px ${collapsedPanels.response ? 44 : responseHeight.value}px`
  }));

  function startColumnResize(event: MouseEvent): void {
    const startX = event.clientX;
    const startWidth = leftWidth.value;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      leftWidth.value = clamp(startWidth + delta, 240, Math.max(240, window.innerWidth - 266));
    };

    const onUp = () => {
      stopResizing();
    };

    startResizing(onMove, onUp);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("blur", onUp);
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
      stopResizing();
    };

    startResizing(onMove, onUp);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("blur", onUp);
  }

  function settlePanel(panel: keyof CollapsedPanels, size: { value: number }, expandedMin: number): void {
    if (size.value <= 92) collapsedPanels[panel] = true;
    if (!collapsedPanels[panel]) size.value = Math.max(size.value, expandedMin);
  }

  function startResizing(onMove: (event: MouseEvent) => void, onUp: () => void): void {
    stopResizing();
    isResizingLayout.value = true;
    document.body.classList.add("is-resizing");
    activeCleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", onUp);
    };
  }

  function stopResizing(): void {
    activeCleanup?.();
    activeCleanup = null;
    document.body.classList.remove("is-resizing");
    isResizingLayout.value = false;
  }

  if (getCurrentInstance()) onBeforeUnmount(stopResizing);

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
