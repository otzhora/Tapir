import { toRaw } from "vue";
import type { NormalizedOperation } from "@tapir/core";

export function plainOperation(operation: NormalizedOperation): NormalizedOperation {
  return JSON.parse(JSON.stringify(toRaw(operation))) as NormalizedOperation;
}
