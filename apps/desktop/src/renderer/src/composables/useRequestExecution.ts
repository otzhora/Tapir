import { computed, reactive, type ComputedRef } from "vue";
import type { CallOperationResponse, NormalizedOperation, PreparedOperationRequest, RequestDraft, ServerWithDefinition } from "@tapir/core";
import type { TapirBridge } from "../../../preload";
import type { CollapsedPanels } from "../types";
import { customRequestPayload, operationRequestPayload } from "../requestDraftModel";

interface UseRequestExecutionInput {
  activeDraft: ComputedRef<RequestDraft | null>;
  selectedOperation: ComputedRef<NormalizedOperation | null>;
  selectedServer: ComputedRef<ServerWithDefinition | null>;
  collapsedPanels: CollapsedPanels;
  getBridge: () => TapirBridge | null;
  reloadHistory: () => Promise<void>;
  setErrorMessage: (message: string) => void;
}

export function useRequestExecution(input: UseRequestExecutionInput) {
  const responseByDraftId = reactive<Record<string, CallOperationResponse | null>>({});
  const previewByDraftId = reactive<Record<string, PreparedOperationRequest | null>>({});
  const sendingByDraftId = reactive<Record<string, boolean>>({});
  const previewingByDraftId = reactive<Record<string, boolean>>({});
  const previewVersionByDraftId: Record<string, number | undefined> = {};

  const requestPreview = computed(() => input.activeDraft.value ? previewByDraftId[input.activeDraft.value.id] ?? null : null);
  const responseView = computed(() => input.activeDraft.value ? responseByDraftId[input.activeDraft.value.id] ?? null : null);
  const isSending = computed(() => input.activeDraft.value ? Boolean(sendingByDraftId[input.activeDraft.value.id]) : false);
  const isPreviewing = computed(() => input.activeDraft.value ? Boolean(previewingByDraftId[input.activeDraft.value.id]) : false);

  async function callActiveRequest(): Promise<void> {
    const draft = input.activeDraft.value;
    if (!draft) return;
    input.setErrorMessage("");
    const bridge = input.getBridge();
    if (!bridge) return;
    sendingByDraftId[draft.id] = true;
    try {
      responseByDraftId[draft.id] = draft.sourceType === "custom"
        ? await bridge.callCustomRequest(customRequestPayload(draft))
        : await bridge.callOperation(openApiPayload(draft));
      input.collapsedPanels.response = false;
      await input.reloadHistory();
    } catch (error) {
      input.setErrorMessage(errorMessage(error));
    } finally {
      sendingByDraftId[draft.id] = false;
    }
  }

  async function refreshPreview(draft = input.activeDraft.value): Promise<void> {
    if (!draft) return;
    if (input.activeDraft.value?.id !== draft.id) return;
    if (draft.sourceType === "openapi" && (input.selectedOperation.value?.operationId !== draft.operationId || input.selectedServer.value?.server.id !== draft.serverInstanceId)) return;
    const bridge = input.getBridge();
    if (!bridge) return;
    const version = (previewVersionByDraftId[draft.id] ?? 0) + 1;
    previewVersionByDraftId[draft.id] = version;
    previewingByDraftId[draft.id] = true;
    try {
      const preview = draft.sourceType === "custom"
        ? await bridge.previewCustomRequest(customRequestPayload(draft))
        : await bridge.previewOperation(openApiPayload(draft));
      if (previewVersionByDraftId[draft.id] === version) previewByDraftId[draft.id] = preview;
    } catch (error) {
      if (previewVersionByDraftId[draft.id] === version) input.setErrorMessage(errorMessage(error));
    } finally {
      if (previewVersionByDraftId[draft.id] === version) previewingByDraftId[draft.id] = false;
    }
  }

  function openApiPayload(draft: RequestDraft) {
    const server = input.selectedServer.value;
    const operation = input.selectedOperation.value;
    if (!server || !operation || operation.operationId !== draft.operationId || server.server.id !== draft.serverInstanceId) {
      throw new Error("Select the draft's OpenAPI operation before preparing its request.");
    }
    return operationRequestPayload(draft, server.server.id, operation);
  }

  function discardDraftState(draftId: string): void {
    delete responseByDraftId[draftId];
    delete previewByDraftId[draftId];
    delete sendingByDraftId[draftId];
    delete previewingByDraftId[draftId];
    delete previewVersionByDraftId[draftId];
  }

  function setResponse(draftId: string, response: CallOperationResponse | null): void {
    responseByDraftId[draftId] = response;
  }

  return {
    callActiveRequest,
    discardDraftState,
    isPreviewing,
    isSending,
    refreshPreview,
    requestPreview,
    responseView,
    setResponse
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
