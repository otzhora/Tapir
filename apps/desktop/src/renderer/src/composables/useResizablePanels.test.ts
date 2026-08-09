// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { useResizablePanels } from "./useResizablePanels";

describe("useResizablePanels", () => {
  afterEach(() => {
    document.body.classList.remove("is-resizing");
  });

  it("allows the sidebar to grow beyond the former fixed width limit", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });
    const panels = useResizablePanels();

    panels.startColumnResize(new MouseEvent("mousedown", { clientX: 320 }));
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 1000 }));

    expect(panels.shellStyle.value.gridTemplateColumns).toBe("1000px 6px minmax(260px, 1fr)");
    window.dispatchEvent(new MouseEvent("mouseup"));
  });

  it("keeps enough room for the main workspace at the window edge", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    const panels = useResizablePanels();

    panels.startColumnResize(new MouseEvent("mousedown", { clientX: 320 }));
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 1600 }));

    expect(panels.shellStyle.value.gridTemplateColumns).toBe("934px 6px minmax(260px, 1fr)");
    window.dispatchEvent(new MouseEvent("mouseup"));
  });
});
