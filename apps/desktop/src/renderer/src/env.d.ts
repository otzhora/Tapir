import type { TapirBridge } from "../../preload";

declare global {
  interface Window {
    tapir: TapirBridge;
  }
}
