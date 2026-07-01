export type RequestTab = "params" | "auth" | "body" | "schema" | "preview";

export type CollapsiblePanel = "servers" | "operations" | "history" | "response";

export type CollapsedPanels = Record<CollapsiblePanel, boolean>;

export interface RequestTabItem {
  id: RequestTab;
  label: string;
  count?: number;
}
