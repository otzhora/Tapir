import { nextTick, type ComputedRef, type Ref } from "vue";
import type { CallHistoryEntry, CallOperationResponse, HttpMethod, NormalizedOperation, RequestDraft } from "@tapir/core";
import { parseHeaders, parseRequestSnapshot, restoreRequestInputs } from "../historyRestore";
import { parseDraftParameters } from "../requestDraftModel";

interface UseRequestHistoryRestorationInput {
  activeDraft: ComputedRef<RequestDraft | null>;
  customOperationId: string;
  operations: ComputedRef<NormalizedOperation[]>;
  selectedOperationId: Ref<string | null>;
  selectedServerId: Ref<string | null>;
  selectedContentTypes: ComputedRef<string[]>;
  createCustomRequest: (serverId: string | null, initialUrl?: string) => Promise<RequestDraft | null>;
  createOpenApiRequest: (operation: NormalizedOperation) => Promise<RequestDraft | null>;
  saveDraft: (draft: RequestDraft) => Promise<void>;
  selectDraft: (draftId: string) => void;
  setResponse: (draftId: string, response: CallOperationResponse | null) => void;
}

export function useRequestHistoryRestoration(input: UseRequestHistoryRestorationInput) {
  async function restoreHistory(entry: CallHistoryEntry, target: "current" | "new" = "current"): Promise<void> {
    if (!entry.operationId) {
      const request = parseRequestSnapshot(entry.requestSnapshotJson);
      input.selectedServerId.value = entry.serverInstanceId;
      input.selectedOperationId.value = input.customOperationId;
      await nextTick();
      const draft = target === "current"
        ? input.activeDraft.value
        : await input.createCustomRequest(entry.serverInstanceId, request.url);
      if (!draft) return;
      input.selectDraft(draft.id);
      await nextTick();
      await input.saveDraft({
        ...draft,
        method: request.method as HttpMethod,
        url: request.url,
        headersJson: JSON.stringify(Object.entries(request.headers).map(([name, value]) => ({ id: crypto.randomUUID(), name, value, enabled: true }))),
        body: request.body ?? ""
      });
      input.setResponse(draft.id, historyResponse(entry));
      return;
    }

    input.selectedServerId.value = entry.serverInstanceId;
    await nextTick();
    const operation = input.operations.value.find((candidate) => candidate.operationId === entry.operationId);
    if (!operation) return;
    input.selectedOperationId.value = operation.operationId;
    await nextTick();
    const draft = target === "current"
      ? input.activeDraft.value
      : await input.createOpenApiRequest(operation);
    if (!draft) return;
    input.selectDraft(draft.id);
    input.setResponse(draft.id, historyResponse(entry));
    const restored = restoreRequestInputs(operation, parseRequestSnapshot(entry.requestSnapshotJson), input.selectedContentTypes.value[0] ?? "application/json");
    await input.saveDraft({
      ...draft,
      body: restored.bodyValue,
      contentType: restored.contentType,
      parametersJson: JSON.stringify(parseDraftParameters(draft).map((parameter) => ({ ...parameter, value: restored.parameterValues[parameter.name] ?? parameter.value })))
    });
  }

  return { restoreHistory };
}

export function historyResponse(entry: CallHistoryEntry): CallOperationResponse | null {
  if (entry.responseBody === null || entry.responseStatus === null) return null;
  return {
    request: parseRequestSnapshot(entry.requestSnapshotJson),
    response: {
      status: entry.responseStatus,
      headers: parseHeaders(entry.responseHeadersJson),
      body: entry.responseBody,
      durationMs: entry.durationMs ?? 0
    }
  };
}
