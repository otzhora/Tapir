import { computed, reactive, ref, watch, type ComputedRef, type Ref } from "vue";
import type {
  HttpMethod,
  NormalizedOperation,
  RequestDraft,
  RequestDraftParameter,
  ServerWithDefinition,
  Workspace
} from "@tapir/core";
import { requestBodyExample, requiredSchemaFields } from "@tapir/core";
import type { CollapsedPanels, RequestTab, RequestTabItem } from "../types";
import { customDraftRequest, openApiDraftRequest, parseDraftHeaders, parseDraftParameters } from "../requestDraftModel";
import { buildCurlCommand, formatJsonBody, formatRequestPreview } from "../requestFormatting";
import { bridgeUnavailableMessage, getTapirBridge as getAvailableTapirBridge } from "../tapirBridge";
import { useRequestDraftPersistence } from "./useRequestDraftPersistence";
import { useRequestExecution } from "./useRequestExecution";
import { useRequestHistoryRestoration } from "./useRequestHistoryRestoration";

export const CUSTOM_OPERATION_ID = "__tapir_custom_requests__";

interface UseOperationRequestInput {
  collapsedPanels: CollapsedPanels;
  operations: ComputedRef<NormalizedOperation[]>;
  selectedOperation: ComputedRef<NormalizedOperation | null>;
  selectedOperationId: Ref<string | null>;
  selectedServer: ComputedRef<ServerWithDefinition | null>;
  selectedServerId: Ref<string | null>;
  workspace: Ref<Workspace | null>;
  reloadHistory: () => Promise<void>;
  setErrorMessage: (message: string) => void;
}

export function useOperationRequest(input: UseOperationRequestInput) {
  const activeDraftBySpace = reactive<Record<string, string>>({});
  const automaticDraftBySpace: Record<string, Promise<RequestDraft | null> | undefined> = {};
  const activeRequestTab = ref<RequestTab>("params");
  let onDraftPersisted = (_draft: RequestDraft): void => undefined;
  let onDraftDeleted = (_draftId: string): void => undefined;
  const persistence = useRequestDraftPersistence({
    workspace: input.workspace,
    getBridge: getTapirBridge,
    onDraftPersisted: (draft) => onDraftPersisted(draft),
    onDraftDeleted: (draftId) => onDraftDeleted(draftId)
  });
  const drafts = persistence.drafts;

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
  const execution = useRequestExecution({
    activeDraft,
    selectedOperation: input.selectedOperation,
    selectedServer: input.selectedServer,
    collapsedPanels: input.collapsedPanels,
    getBridge: getTapirBridge,
    reloadHistory: input.reloadHistory,
    setErrorMessage: input.setErrorMessage
  });
  onDraftPersisted = (draft) => void execution.refreshPreview(draft);
  onDraftDeleted = execution.discardDraftState;
  const { isPreviewing, isSending, requestPreview, responseView } = execution;
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
  const requiredBodyFields = computed(() => requiredSchemaFields(
    activeOperation.value?.requestBodyMediaTypes.find((media) => media.mediaType === activeDraft.value?.contentType)?.schema
      ?? activeOperation.value?.requestBodySchema
  ));
  const responsesSchema = computed(() => stringifySchema(activeOperation.value?.responses ?? null));
  const historyRestoration = useRequestHistoryRestoration({
    customOperationId: CUSTOM_OPERATION_ID,
    operations: input.operations,
    selectedOperationId: input.selectedOperationId,
    selectedServerId: input.selectedServerId,
    selectedContentTypes,
    drafts,
    visibleDrafts,
    createCustomRequest,
    createOpenApiRequest,
    saveDraft: persistence.saveDraft,
    selectDraft,
    setResponse: execution.setResponse
  });

  watch(activeDraft, (draft) => {
    if (!draft) return;
    activeDraftBySpace[activeSpaceKey.value] = draft.id;
    void execution.refreshPreview(draft);
  });

  watch(requestTabs, (tabs) => {
    if (!tabs.some((tab) => tab.id === activeRequestTab.value)) activeRequestTab.value = "params";
  });

  watch(() => [input.selectedServer.value?.server.id, input.selectedOperationId.value, input.selectedOperation.value?.operationId], () => {
    void ensureActiveSpaceHasDraft();
  });

  async function loadDrafts(): Promise<void> {
    await persistence.loadDrafts();
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
    const draft = await tapir.createRequestDraft(openApiDraftRequest(input.selectedServer.value.server.id, operation));
    persistence.addDraft(draft);
    activeDraftBySpace[`${input.selectedServer.value.server.id}:openapi:${operation.operationId}`] = draft.id;
    activeRequestTab.value = "params";
    return draft;
  }

  async function createCustomRequest(serverId = input.selectedServer.value?.server.id ?? null, initialUrl?: string): Promise<RequestDraft | null> {
    const tapir = getTapirBridge();
    if (!tapir) return null;
    const draft = await tapir.createRequestDraft(customDraftRequest(serverId, initialUrl ?? input.selectedServer.value?.server.baseUrl ?? ""));
    persistence.addDraft(draft);
    activeDraftBySpace[`${serverId ?? "no-server"}:custom`] = draft.id;
    activeRequestTab.value = "params";
    return draft;
  }

  async function closeDraft(draftId: string): Promise<void> {
    await persistence.deleteDraft(draftId);
  }

  function selectDraft(draftId: string): void {
    activeDraftBySpace[activeSpaceKey.value] = draftId;
    activeRequestTab.value = "params";
    const draft = drafts.value.find((candidate) => candidate.id === draftId);
    if (draft) void execution.refreshPreview(draft);
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

  async function generateBodyExample(): Promise<void> {
    const draft = activeDraft.value;
    if (!draft || !activeOperation.value) return;
    const media = activeOperation.value.requestBodyMediaTypes.find((candidate) => candidate.mediaType === draft.contentType);
    const example = requestBodyExample(media);
    if (!example) return;
    if (draft.body.trim() && !window.confirm("Replace the current request body with a generated example?")) return;
    await updateDraft({ body: example });
  }

  async function setParameterValue(id: string, value: string): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    await saveDraft({ ...draft, parametersJson: JSON.stringify(parseDraftParameters(draft).map((parameter) => parameter.id === id ? { ...parameter, value } : parameter)) });
  }

  async function toggleParameter(id: string, enabled: boolean): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    await saveDraft({ ...draft, parametersJson: JSON.stringify(parseDraftParameters(draft).map((parameter) => parameter.id === id ? { ...parameter, enabled } : parameter)) });
  }

  async function addParameter(location: RequestDraftParameter["in"]): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    const parameters = parseDraftParameters(draft);
    parameters.push({ id: crypto.randomUUID(), name: "", in: location, value: "", enabled: true, source: "custom" });
    await saveDraft({ ...draft, parametersJson: JSON.stringify(parameters) });
  }

  async function updateParameterName(id: string, name: string): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    await saveDraft({ ...draft, parametersJson: JSON.stringify(parseDraftParameters(draft).map((parameter) => parameter.id === id ? { ...parameter, name } : parameter)) });
  }

  async function removeParameter(id: string): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    await saveDraft({ ...draft, parametersJson: JSON.stringify(parseDraftParameters(draft).filter((parameter) => parameter.id !== id || parameter.source === "openapi")) });
  }

  async function addHeader(): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    await saveDraft({ ...draft, headersJson: JSON.stringify([...parseDraftHeaders(draft), { id: crypto.randomUUID(), name: "", value: "", enabled: true }]) });
  }

  async function updateHeader(id: string, field: "name" | "value", value: string): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    await saveDraft({ ...draft, headersJson: JSON.stringify(parseDraftHeaders(draft).map((header) => header.id === id ? { ...header, [field]: value } : header)) });
  }

  async function toggleHeader(id: string, enabled: boolean): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    await saveDraft({ ...draft, headersJson: JSON.stringify(parseDraftHeaders(draft).map((header) => header.id === id ? { ...header, enabled } : header)) });
  }

  async function removeHeader(id: string): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    await saveDraft({ ...draft, headersJson: JSON.stringify(parseDraftHeaders(draft).filter((header) => header.id !== id)) });
  }

  async function saveDraft(next: RequestDraft): Promise<void> {
    await persistence.saveDraft(next);
  }

  async function callOperation(): Promise<void> {
    await execution.callActiveRequest();
  }

  async function refreshPreview(draft = activeDraft.value): Promise<void> {
    await execution.refreshPreview(draft);
  }

  async function restoreHistory(entry: Parameters<typeof historyRestoration.restoreHistory>[0]): Promise<void> {
    await historyRestoration.restoreHistory(entry);
  }

  function clearRequestInputs(): void {
    if (!activeDraft.value) return;
    void saveDraft({
      ...activeDraft.value,
      body: "",
      parametersJson: JSON.stringify(parseDraftParameters(activeDraft.value).map((parameter) => ({ ...parameter, value: "" })))
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
    parameters: computed(() => parseDraftParameters(activeDraft.value)),
    headers: computed(() => parseDraftHeaders(activeDraft.value)),
    prettyBody,
    prettyRequest,
    requestBodySchema,
    requiredBodyFields,
    requestPreview,
    requestTabs,
    refreshPreview,
    responseView,
    responsesSchema,
    restoreHistory,
    selectedContentTypes,
    generateBodyExample,
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

function enabledParameters(draft: RequestDraft | null): RequestDraftParameter[] {
  return parseDraftParameters(draft).filter((parameter) => parameter.enabled);
}

function enabledHeaders(draft: RequestDraft | null) {
  return parseDraftHeaders(draft).filter((header) => header.enabled);
}

function stringifySchema(value: unknown): string {
  if (!value) return "No schema declared by the OpenAPI definition.";
  return JSON.stringify(value, null, 2);
}
