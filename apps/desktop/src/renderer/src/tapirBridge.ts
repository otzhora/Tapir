import type { TapirBridge } from "../../preload";

export function getTapirBridge(): TapirBridge | null {
  return window.tapir ?? null;
}

export const bridgeUnavailableMessage = "Tapir's desktop bridge is unavailable. Run Tapir with npm run dev and use the Electron window it opens.";
