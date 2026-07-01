import { computed, nextTick, reactive, ref, watch, type ComputedRef, type Ref } from "vue";
import type { CallHistoryEntry, CallOperationRequest, CallOperationResponse, NormalizedOperation, PreparedOperationRequest, ServerWithDefinition } from "@tapir/core";
import type { CollapsedPanels, RequestTab, RequestTabItem } from "../types";
import { parseHeaders, parseRequestSnapshot, restoreRequestInputs as restoreInputsFromHistory } from "../historyRestore";
import { plainOperation } from "../ipcPayloads";
import { buildCurlCommand, formatJsonBody, formatRequestPreview } from "../requestFormatting";
import { bridgeUnavailableMessage, getTapirBridge as getAvailableTapirBridge } from "../tapirBridge";

interface UseOperationRequestInput {
  collapsedPanels: CollapsedPanels;
  history: Ref<CallHistoryEntry[]>;
  operations: ComputedRef<NormalizedOperation[]>;
  selectedOperation: ComputedRef<NormalizedOperation | null>;
  selectedOperationId: Ref<string | null>;
  selectedServer: ComputedRef<ServerWithDefinition | null>;
  setErrorMessage: (message: string) => void;
}

export function useOperationRequest(input: UseOperationRequestInput) {
  const isSending = ref(false);
  const isPreviewing = ref(false);
  const responseView = ref<CallOperationResponse | null>(null);
  const requestPreview = ref<PreparedOperationRequest | null>(null);
  const activeRequestTab = ref<RequestTab>("params");

  const parameterValues = reactive<Record<string, string>>({});
  const bodyValue = ref("");
  const contentType = ref("application/json");
  const authHeaderName = ref("x-api-key");
  const authSecret = ref("");

  const selectedContentTypes = computed(() => (input.selectedOperation.value?.requestBodyMediaTypes ?? []).map((item) => item.mediaType));
  const apiKeyHeaderScheme = computed(() => (input.selectedOperation.value?.securitySchemes ?? []).find((scheme) => scheme.type === "apiKey" && scheme.in === "header") ?? null);
  const validationIssues = computed(() => requestPreview.value?.validationIssues ?? []);
  const canSend = computed(() => input.selectedOperation.value !== null && !isSending.value && validationIssues.value.length === 0);
  const showBodyTab = computed(() => input.selectedOperation.value?.method !== "GET");

  const requestTabs = computed<RequestTabItem[]>(() => [
    { id: "params", label: "Params", count: input.selectedOperation.value?.parameters.length ?? 0 },
    { id: "auth", label: "Auth", count: input.selectedOperation.value?.securitySchemes.length ?? 0 },
    ...(showBodyTab.value ? [{ id: "body" as const, label: "Body", count: selectedContentTypes.value.length }] : []),
    { id: "schema", label: "OpenAPI" },
    { id: "preview", label: "Preview" }
  ]);

  const prettyRequest = computed(() => formatRequestPreview(requestPreview.value?.redactedRequest ?? null));
  const prettyBody = computed(() => responseView.value ? formatJsonBody(responseView.value.response.body) : "");
  const curlCommand = computed(() => buildCurlCommand(requestPreview.value?.redactedRequest ?? null));
  const operationUrl = computed(() => requestPreview.value?.redactedRequest.url ?? `${input.selectedServer.value?.server.baseUrl ?? ""}${input.selectedOperation.value?.path ?? ""}`);
  const requestBodySchema = computed(() => stringifySchema(input.selectedOperation.value?.requestBodySchema ?? null));
  const responsesSchema = computed(() => stringifySchema(input.selectedOperation.value?.responses ?? null));

  watch(input.selectedOperation, () => {
    clearRequestInputs();
    contentType.value = selectedContentTypes.value[0] ?? "application/json";
    authHeaderName.value = apiKeyHeaderScheme.value?.name ?? authHeaderName.value;
    activeRequestTab.value = "params";
    void refreshPreview();
  });

  watch([bodyValue, authHeaderName, authSecret, contentType], () => {
    void refreshPreview();
  });

  watch(parameterValues, () => {
    void refreshPreview();
  }, { deep: true });

  async function callOperation(): Promise<void> {
    if (!input.selectedServer.value || !input.selectedOperation.value) return;
    input.setErrorMessage("");
    const tapir = getTapirBridge();
    if (!tapir) return;
    isSending.value = true;
    try {
      if (authSecret.value.trim()) {
        await tapir.saveApiKeyHeader({
          serverId: input.selectedServer.value.server.id,
          headerName: authHeaderName.value,
          secretValue: authSecret.value
        });
      }
      responseView.value = await tapir.callOperation(operationRequestPayload());
      input.collapsedPanels.response = false;
      input.history.value = await tapir.listHistory(input.selectedServer.value.server.id);
    } catch (error) {
      input.setErrorMessage(toErrorMessage(error));
    } finally {
      isSending.value = false;
    }
  }

  async function refreshPreview(): Promise<void> {
    if (!input.selectedServer.value || !input.selectedOperation.value) {
      requestPreview.value = null;
      return;
    }
    const tapir = getTapirBridge();
    if (!tapir) return;
    isPreviewing.value = true;
    try {
      requestPreview.value = await tapir.previewOperation(operationRequestPayload());
    } catch (error) {
      input.setErrorMessage(toErrorMessage(error));
    } finally {
      isPreviewing.value = false;
    }
  }

  function operationRequestPayload(): CallOperationRequest {
    if (!input.selectedServer.value || !input.selectedOperation.value) {
      throw new Error("Select an operation before preparing a request.");
    }
    return {
      serverId: input.selectedServer.value.server.id,
      operation: plainOperation(input.selectedOperation.value),
      values: { ...parameterValues },
      body: bodyValue.value,
      contentType: contentType.value,
      apiKeyHeaderName: authHeaderName.value,
      apiKeyValue: authSecret.value
    };
  }

  async function restoreHistory(entry: CallHistoryEntry): Promise<void> {
    if (!entry.operationId) return;
    const operation = input.operations.value.find((candidate) => candidate.operationId === entry.operationId);
    if (!operation) return;
    input.selectedOperationId.value = operation.operationId;
    await nextTick();
    responseView.value = entry.responseBody && entry.responseStatus
      ? {
        request: parseRequestSnapshot(entry.requestSnapshotJson),
        response: {
          status: entry.responseStatus,
          headers: parseHeaders(entry.responseHeadersJson),
          body: entry.responseBody,
          durationMs: entry.durationMs ?? 0
        }
      }
      : null;
    restoreRequestInputs(operation, parseRequestSnapshot(entry.requestSnapshotJson));
  }

  function clearRequestInputs(): void {
    bodyValue.value = "";
    clearParameterValues();
  }

  function clearParameterValues(): void {
    for (const key of Object.keys(parameterValues)) {
      delete parameterValues[key];
    }
  }

  function restoreRequestInputs(operation: NormalizedOperation, request: CallOperationResponse["request"]): void {
    clearParameterValues();
    const restored = restoreInputsFromHistory(operation, request, selectedContentTypes.value[0] ?? "application/json");
    bodyValue.value = restored.bodyValue;
    contentType.value = restored.contentType;
    for (const [name, value] of Object.entries(restored.parameterValues)) {
      parameterValues[name] = value;
    }
    void refreshPreview();
  }

  function setParameterValue(name: string, value: string): void {
    parameterValues[name] = value;
  }

  async function copyCurl(): Promise<void> {
    if (!curlCommand.value) return;
    await navigator.clipboard.writeText(curlCommand.value);
  }

  function getTapirBridge() {
    const tapir = getAvailableTapirBridge();
    if (!tapir) input.setErrorMessage(bridgeUnavailableMessage);
    return tapir;
  }

  return {
    activeRequestTab,
    authHeaderName,
    authSecret,
    bodyValue,
    callOperation,
    canSend,
    clearRequestInputs,
    contentType,
    copyCurl,
    curlCommand,
    isPreviewing,
    isSending,
    operationUrl,
    parameterValues,
    prettyBody,
    prettyRequest,
    requestBodySchema,
    requestPreview,
    requestTabs,
    responseView,
    responsesSchema,
    restoreHistory,
    selectedContentTypes,
    setParameterValue,
    validationIssues
  };
}

function stringifySchema(value: unknown): string {
  if (!value) return "No schema declared by the OpenAPI definition.";
  return JSON.stringify(value, null, 2);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
