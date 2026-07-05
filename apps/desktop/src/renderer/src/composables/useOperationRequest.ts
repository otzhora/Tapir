import { computed, nextTick, reactive, ref, watch, type ComputedRef, type Ref } from "vue";
import type {
  CallHistoryEntry,
  CallOperationRequest,
  CallOperationResponse,
  HttpMethod,
  NormalizedOperation,
  PreparedOperationRequest,
  RequestDraft,
  RequestDraftHeader,
  RequestDraftParameter,
  ServerWithDefinition,
  Workspace
} from "@tapir/core";
import type { CollapsedPanels, RequestTab, RequestTabItem } from "../types";
import { parseHeaders, parseRequestSnapshot, restoreRequestInputs as restoreInputsFromHistory } from "../historyRestore";
import { plainOperation } from "../ipcPayloads";
import { buildCurlCommand, formatJsonBody, formatRequestPreview } from "../requestFormatting";
import { bridgeUnavailableMessage, getTapirBridge as getAvailableTapirBridge } from "../tapirBridge";

export const CUSTOM_OPERATION_ID = "__tapir_custom_requests__";

interface UseOperationRequestInput {
  collapsedPanels: CollapsedPanels;
  history: Ref<CallHistoryEntry[]>;
  operations: ComputedRef<NormalizedOperation[]>;
  selectedOperation: ComputedRef<NormalizedOperation | null>;
  selectedOperationId: Ref<string | null>;
  selectedServer: ComputedRef<ServerWithDefinition | null>;
  workspace: Ref<Workspace | null>;
  setErrorMessage: (message: string) => void;
}

export function useOperationRequest(input: UseOperationRequestInput) {
  const drafts = ref<RequestDraft[]>([]);
  const activeDraftBySpace = reactive<Record<string, string>>({});
  const responseByDraftId = reactive<Record<string, CallOperationResponse | null>>({});
  const previewByDraftId = reactive<Record<string, PreparedOperationRequest | null>>({});
  const sendingByDraftId = reactive<Record<string, boolean>>({});
  const previewingByDraftId = reactive<Record<string, boolean>>({});
  const automaticDraftBySpace: Record<string, Promise<RequestDraft | null> | undefined> = {};
  const draftSaveChains: Record<string, Promise<void> | undefined> = {};
  const activeRequestTab = ref<RequestTab>("params");

  const isCustomSpace = computed(() => input.selectedOperationId.value === CUSTOM_OPERATION_ID);
  const activeSpaceKey = computed(() => {
    const serverId = input.selectedServer.value?.server.id ?? "no-server";
    return isCustomSpace.value ? `${serverId}:custom` : `${serverId}:openapi:${input.selectedOperation.value?.operationId ?? "none"}`;
  });
  const visibleDrafts = computed(() => {
    const serverId = input.selectedServer.value?.server.id ?? null;
    if (isCustomSpace.value) {
      return drafts.value.filter((draft) => draft.sourceType === "custom" && draft.serverInstanceId === serverId);
    }
    const operationId = input.selectedOperation.value?.operationId ?? null;
    return drafts.value.filter((draft) => draft.sourceType === "openapi" && draft.serverInstanceId === serverId && draft.operationId === operationId);
  });
  const activeDraft = computed(() => {
    const activeId = activeDraftBySpace[activeSpaceKey.value];
    return visibleDrafts.value.find((draft) => draft.id === activeId) ?? visibleDrafts.value[0] ?? null;
  });
  const activeOperation = computed(() => activeDraft.value?.sourceType === "openapi" ? input.selectedOperation.value : null);
  const requestPreview = computed(() => activeDraft.value ? previewByDraftId[activeDraft.value.id] ?? null : null);
  const responseView = computed(() => activeDraft.value ? responseByDraftId[activeDraft.value.id] ?? null : null);
  const isSending = computed(() => activeDraft.value ? Boolean(sendingByDraftId[activeDraft.value.id]) : false);
  const isPreviewing = computed(() => activeDraft.value ? Boolean(previewingByDraftId[activeDraft.value.id]) : false);
  const selectedContentTypes = computed(() => (activeOperation.value?.requestBodyMediaTypes ?? []).map((item) => item.mediaType));
  const validationIssues = computed(() => requestPreview.value?.validationIssues ?? []);
  const canSend = computed(() => activeDraft.value !== null && !isSending.value && validationIssues.value.length === 0);
  const showBodyTab = computed(() => activeDraft.value?.method !== "GET");

  const requestTabs = computed<RequestTabItem[]>(() => [
    { id: "params", label: activeDraft.value?.sourceType === "custom" ? "Query" : "Params", count: enabledParameters(activeDraft.value).length },
    { id: "auth", label: "Headers", count: enabledHeaders(activeDraft.value).length },
    ...(showBodyTab.value ? [{ id: "body" as const, label: "Body", count: selectedContentTypes.value.length }] : []),
    ...(activeDraft.value?.sourceType === "openapi" ? [{ id: "schema" as const, label: "OpenAPI" }] : []),
    { id: "preview", label: "Preview" }
  ]);

  const prettyRequest = computed(() => formatRequestPreview(requestPreview.value?.redactedRequest ?? null));
  const prettyBody = computed(() => responseView.value ? formatJsonBody(responseView.value.response.body) : "");
  const curlCommand = computed(() => buildCurlCommand(requestPreview.value?.redactedRequest ?? null));
  const operationUrl = computed(() => requestPreview.value?.redactedRequest.url ?? activeDraft.value?.url ?? "");
  const requestBodySchema = computed(() => stringifySchema(activeOperation.value?.requestBodySchema ?? null));
  const responsesSchema = computed(() => stringifySchema(activeOperation.value?.responses ?? null));

  watch(activeDraft, (draft) => {
    if (!draft) return;
    activeDraftBySpace[activeSpaceKey.value] = draft.id;
    void refreshPreview(draft);
  });

  watch(requestTabs, (tabs) => {
    if (!tabs.some((tab) => tab.id === activeRequestTab.value)) activeRequestTab.value = "params";
  });

  watch(() => [input.selectedServer.value?.server.id, input.selectedOperationId.value, input.selectedOperation.value?.operationId], () => {
    void ensureActiveSpaceHasDraft();
  });

  async function loadDrafts(): Promise<void> {
    const tapir = getTapirBridge();
    if (!tapir || !input.workspace.value) return;
    drafts.value = await tapir.listRequestDrafts(input.workspace.value.id);
    await ensureActiveSpaceHasDraft();
  }

  async function ensureActiveSpaceHasDraft(): Promise<void> {
    if (!input.selectedServer.value) return;
    if (isCustomSpace.value) {
      if (visibleDrafts.value.length === 0) await createAutomaticDraft(activeSpaceKey.value, createCustomRequest);
      return;
    }
    if (!input.selectedOperation.value) return;
    if (visibleDrafts.value.length === 0) {
      const operation = input.selectedOperation.value;
      await createAutomaticDraft(activeSpaceKey.value, () => createOpenApiRequest(operation));
    }
  }

  async function createAutomaticDraft(spaceKey: string, createDraft: () => Promise<RequestDraft | null>): Promise<RequestDraft | null> {
    if (automaticDraftBySpace[spaceKey]) return automaticDraftBySpace[spaceKey] ?? null;
    automaticDraftBySpace[spaceKey] = (async () => {
      const draft = await createDraft();
      return draft;
    })();
    try {
      return await automaticDraftBySpace[spaceKey] ?? null;
    } finally {
      delete automaticDraftBySpace[spaceKey];
    }
  }

  async function createOpenApiRequest(operation: NormalizedOperation): Promise<RequestDraft | null> {
    const tapir = getTapirBridge();
    if (!tapir || !input.selectedServer.value) return null;
    const draft = await tapir.createRequestDraft({
      serverId: input.selectedServer.value.server.id,
      sourceType: "openapi",
      operationId: operation.operationId,
      name: defaultOperationDraftName(operation),
      method: operation.method,
      path: operation.path,
      url: "",
      parameters: operation.parameters.map(parameterFromOperation),
      headers: [],
      body: "",
      contentType: operation.requestBodyMediaTypes[0]?.mediaType ?? "application/json",
      sortOrder: Date.now()
    });
    drafts.value = [...drafts.value, draft];
    activeDraftBySpace[`${input.selectedServer.value.server.id}:openapi:${operation.operationId}`] = draft.id;
    activeRequestTab.value = "params";
    return draft;
  }

  async function createCustomRequest(): Promise<RequestDraft | null> {
    const tapir = getTapirBridge();
    if (!tapir || !input.selectedServer.value) return null;
    const draft = await tapir.createRequestDraft({
      serverId: input.selectedServer.value.server.id,
      sourceType: "custom",
      operationId: null,
      name: "Custom request",
      isNameManual: false,
      method: "GET",
      url: input.selectedServer.value.server.baseUrl,
      parameters: [],
      headers: [],
      body: "",
      contentType: "application/json",
      sortOrder: Date.now()
    });
    drafts.value = [...drafts.value, draft];
    activeDraftBySpace[`${input.selectedServer.value.server.id}:custom`] = draft.id;
    activeRequestTab.value = "params";
    return draft;
  }

  async function closeDraft(draftId: string): Promise<void> {
    const tapir = getTapirBridge();
    if (!tapir) return;
    await tapir.deleteRequestDraft(draftId);
    drafts.value = drafts.value.filter((draft) => draft.id !== draftId);
    delete responseByDraftId[draftId];
    delete previewByDraftId[draftId];
  }

  function selectDraft(draftId: string): void {
    activeDraftBySpace[activeSpaceKey.value] = draftId;
    activeRequestTab.value = "params";
    const draft = drafts.value.find((candidate) => candidate.id === draftId);
    if (draft) void refreshPreview(draft);
  }

  async function updateDraft(changes: Partial<RequestDraft>): Promise<void> {
    if (!activeDraft.value) return;
    await saveDraft({ ...activeDraft.value, ...changes });
  }

  async function updateDraftName(value: string): Promise<void> {
    await updateDraft({ name: value, isNameManual: true });
  }

  async function updateMethod(value: string): Promise<void> {
    if (activeDraft.value?.sourceType !== "custom") return;
    await updateDraft({ method: value as HttpMethod });
  }

  async function updateUrl(value: string): Promise<void> {
    if (activeDraft.value?.sourceType !== "custom") return;
    await updateDraft({ url: value });
  }

  async function updateBodyValue(value: string): Promise<void> {
    await updateDraft({ body: value });
  }

  async function updateContentType(value: string): Promise<void> {
    await updateDraft({ contentType: value });
  }

  async function setParameterValue(id: string, value: string): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    await saveDraft({ ...draft, parametersJson: JSON.stringify(parseParameters(draft).map((parameter) => parameter.id === id ? { ...parameter, value } : parameter)) });
  }

  async function toggleParameter(id: string, enabled: boolean): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    await saveDraft({ ...draft, parametersJson: JSON.stringify(parseParameters(draft).map((parameter) => parameter.id === id ? { ...parameter, enabled } : parameter)) });
  }

  async function addParameter(location: RequestDraftParameter["in"]): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    const parameters = parseParameters(draft);
    parameters.push({ id: crypto.randomUUID(), name: "", in: location, value: "", enabled: true, source: "custom" });
    await saveDraft({ ...draft, parametersJson: JSON.stringify(parameters) });
  }

  async function updateParameterName(id: string, name: string): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    await saveDraft({ ...draft, parametersJson: JSON.stringify(parseParameters(draft).map((parameter) => parameter.id === id ? { ...parameter, name } : parameter)) });
  }

  async function removeParameter(id: string): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    await saveDraft({ ...draft, parametersJson: JSON.stringify(parseParameters(draft).filter((parameter) => parameter.id !== id || parameter.source === "openapi")) });
  }

  async function addHeader(): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    await saveDraft({ ...draft, headersJson: JSON.stringify([...parseHeadersFromDraft(draft), { id: crypto.randomUUID(), name: "", value: "", enabled: true }]) });
  }

  async function updateHeader(id: string, field: "name" | "value", value: string): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    await saveDraft({ ...draft, headersJson: JSON.stringify(parseHeadersFromDraft(draft).map((header) => header.id === id ? { ...header, [field]: value } : header)) });
  }

  async function toggleHeader(id: string, enabled: boolean): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    await saveDraft({ ...draft, headersJson: JSON.stringify(parseHeadersFromDraft(draft).map((header) => header.id === id ? { ...header, enabled } : header)) });
  }

  async function removeHeader(id: string): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    await saveDraft({ ...draft, headersJson: JSON.stringify(parseHeadersFromDraft(draft).filter((header) => header.id !== id)) });
  }

  async function saveDraft(next: RequestDraft): Promise<void> {
    const tapir = getTapirBridge();
    if (!tapir) return;
    drafts.value = drafts.value.map((draft) => draft.id === next.id ? next : draft);

    const saveChain = (draftSaveChains[next.id] ?? Promise.resolve()).then(async () => {
      const latest = drafts.value.find((draft) => draft.id === next.id) ?? next;
      const saved = await tapir.updateRequestDraft({ draft: latest });
      const current = drafts.value.find((draft) => draft.id === saved.id);
      if (current && editableDraftFieldsMatch(current, latest)) {
        drafts.value = drafts.value.map((draft) => draft.id === saved.id ? saved : draft);
        void refreshPreview(saved);
      } else {
        void refreshPreview(current ?? latest);
      }
    });

    const trackedSave = saveChain.finally(() => {
      if (draftSaveChains[next.id] === trackedSave) delete draftSaveChains[next.id];
    });

    draftSaveChains[next.id] = trackedSave;
    await trackedSave;
  }

  async function callOperation(): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    input.setErrorMessage("");
    const tapir = getTapirBridge();
    if (!tapir) return;
    sendingByDraftId[draft.id] = true;
    try {
      responseByDraftId[draft.id] = draft.sourceType === "custom"
        ? await tapir.callCustomRequest(customPayload(draft))
        : await tapir.callOperation(operationRequestPayload(draft));
      input.collapsedPanels.response = false;
      if (draft.serverInstanceId) input.history.value = await tapir.listHistory(draft.serverInstanceId);
    } catch (error) {
      input.setErrorMessage(toErrorMessage(error));
    } finally {
      sendingByDraftId[draft.id] = false;
    }
  }

  async function refreshPreview(draft = activeDraft.value): Promise<void> {
    if (!draft) return;
    const tapir = getTapirBridge();
    if (!tapir) return;
    previewingByDraftId[draft.id] = true;
    try {
      previewByDraftId[draft.id] = draft.sourceType === "custom"
        ? await tapir.previewCustomRequest(customPayload(draft))
        : await tapir.previewOperation(operationRequestPayload(draft));
    } catch (error) {
      input.setErrorMessage(toErrorMessage(error));
    } finally {
      previewingByDraftId[draft.id] = false;
    }
  }

  function operationRequestPayload(draft: RequestDraft): CallOperationRequest {
    if (!input.selectedServer.value || !input.selectedOperation.value) {
      throw new Error("Select an operation before preparing a request.");
    }
    const parameters = parseParameters(draft).filter((parameter) => parameter.enabled);
    const operation = plainOperation(input.selectedOperation.value);
    operation.parameters = parameters.map((parameter) => ({
      name: parameter.name,
      in: parameter.in,
      required: parameter.required ?? false,
      description: parameter.description
    }));
    return {
      serverId: input.selectedServer.value.server.id,
      requestDraftId: draft.id,
      operation,
      values: Object.fromEntries(parameters.map((parameter) => [parameter.name, parameter.value])),
      body: draft.body,
      contentType: draft.contentType
    };
  }

  function customPayload(draft: RequestDraft) {
    return {
      serverId: draft.serverInstanceId,
      requestDraftId: draft.id,
      method: draft.method,
      url: draft.url,
      parameters: parseParameters(draft).filter((parameter) => parameter.in !== "path"),
      headers: parseHeadersFromDraft(draft),
      body: draft.body,
      contentType: draft.contentType
    };
  }

  async function restoreHistory(entry: CallHistoryEntry): Promise<void> {
    if (!entry.operationId) {
      input.selectedOperationId.value = CUSTOM_OPERATION_ID;
      await nextTick();
      const draft = entry.requestDraftId ? drafts.value.find((candidate) => candidate.id === entry.requestDraftId) ?? null : null;
      const targetDraft = draft ?? await createCustomRequest();
      if (!targetDraft) return;
      selectDraft(targetDraft.id);
      await nextTick();
      const request = parseRequestSnapshot(entry.requestSnapshotJson);
      await saveDraft({
        ...targetDraft,
        method: request.method as HttpMethod,
        url: request.url,
        headersJson: JSON.stringify(Object.entries(request.headers).map(([name, value]) => ({ id: crypto.randomUUID(), name, value, enabled: true }))),
        body: request.body ?? ""
      });
      responseByDraftId[targetDraft.id] = historyResponse(entry);
      return;
    }
    const operation = input.operations.value.find((candidate) => candidate.operationId === entry.operationId);
    if (!operation) return;
    input.selectedOperationId.value = operation.operationId;
    await nextTick();
    const matchedDraft = entry.requestDraftId ? visibleDrafts.value.find((candidate) => candidate.id === entry.requestDraftId) ?? null : null;
    const draft = matchedDraft ?? visibleDrafts.value[0] ?? await createOpenApiRequest(operation);
      if (!draft) return;
    selectDraft(draft.id);
    responseByDraftId[draft.id] = historyResponse(entry);
    const restored = restoreInputsFromHistory(operation, parseRequestSnapshot(entry.requestSnapshotJson), selectedContentTypes.value[0] ?? "application/json");
    await saveDraft({
      ...draft,
      body: restored.bodyValue,
      contentType: restored.contentType,
      parametersJson: JSON.stringify(parseParameters(draft).map((parameter) => ({ ...parameter, value: restored.parameterValues[parameter.name] ?? parameter.value })))
    });
  }

  function clearRequestInputs(): void {
    if (!activeDraft.value) return;
    void saveDraft({
      ...activeDraft.value,
      body: "",
      parametersJson: JSON.stringify(parseParameters(activeDraft.value).map((parameter) => ({ ...parameter, value: "" })))
    });
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
    activeDraft,
    activeRequestTab,
    callOperation,
    canSend,
    clearRequestInputs,
    closeDraft,
    copyCurl,
    createCustomRequest,
    createOpenApiRequest,
    curlCommand,
    isCustomSpace,
    isPreviewing,
    isSending,
    ensureActiveSpaceHasDraft,
    loadDrafts,
    operationUrl,
    parameters: computed(() => parseParameters(activeDraft.value)),
    headers: computed(() => parseHeadersFromDraft(activeDraft.value)),
    prettyBody,
    prettyRequest,
    requestBodySchema,
    requestPreview,
    requestTabs,
    responseView,
    responsesSchema,
    restoreHistory,
    selectedContentTypes,
    selectDraft,
    setParameterValue,
    toggleParameter,
    addParameter,
    updateParameterName,
    removeParameter,
    addHeader,
    updateHeader,
    toggleHeader,
    removeHeader,
    updateBodyValue,
    updateContentType,
    updateDraftName,
    updateMethod,
    updateUrl,
    validationIssues,
    visibleDrafts
  };
}

function parameterFromOperation(parameter: NormalizedOperation["parameters"][number]): RequestDraftParameter {
  return {
    id: `${parameter.in}:${parameter.name}`,
    name: parameter.name,
    in: parameter.in === "cookie" ? "header" : parameter.in,
    value: "",
    enabled: true,
    required: parameter.required,
    description: parameter.description,
    source: "openapi"
  };
}

function parseParameters(draft: RequestDraft | null): RequestDraftParameter[] {
  if (!draft) return [];
  return parseJsonArray<RequestDraftParameter>(draft.parametersJson);
}

function parseHeadersFromDraft(draft: RequestDraft | null): RequestDraftHeader[] {
  if (!draft) return [];
  return parseJsonArray<RequestDraftHeader>(draft.headersJson);
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function enabledParameters(draft: RequestDraft | null): RequestDraftParameter[] {
  return parseParameters(draft).filter((parameter) => parameter.enabled);
}

function enabledHeaders(draft: RequestDraft | null): RequestDraftHeader[] {
  return parseHeadersFromDraft(draft).filter((header) => header.enabled);
}

function editableDraftFieldsMatch(left: RequestDraft, right: RequestDraft): boolean {
  return left.name === right.name
    && left.isNameManual === right.isNameManual
    && left.method === right.method
    && left.path === right.path
    && left.url === right.url
    && left.parametersJson === right.parametersJson
    && left.headersJson === right.headersJson
    && left.body === right.body
    && left.contentType === right.contentType
    && left.sortOrder === right.sortOrder;
}

function defaultOperationDraftName(operation: NormalizedOperation): string {
  return operation.summary || `${operation.method} ${operation.path}`;
}

function historyResponse(entry: CallHistoryEntry): CallOperationResponse | null {
  if (!entry.responseBody || !entry.responseStatus) return null;
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

function stringifySchema(value: unknown): string {
  if (!value) return "No schema declared by the OpenAPI definition.";
  return JSON.stringify(value, null, 2);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
