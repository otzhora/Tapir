export type RequestTab = "params" | "authorization" | "headers" | "body" | "preview";

export type CollapsiblePanel = "operations" | "response";

export type CollapsedPanels = Record<CollapsiblePanel, boolean>;

export interface RequestTabItem {
  id: RequestTab;
  label: string;
  count?: number;
}
