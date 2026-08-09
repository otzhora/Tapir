import { parameterExampleValue, requestBodyExample } from "@tapir/core";
import type {
  CallCustomRequestRequest,
  CallOperationRequest,
  CreateRequestDraftRequest,
  NormalizedOperation,
  RequestDraft,
  RequestDraftHeader,
  RequestDraftParameter
} from "@tapir/core";

export function openApiDraftRequest(serverId: string, operation: NormalizedOperation, sortOrder = Date.now()): CreateRequestDraftRequest {
  return {
    serverId,
    sourceType: "openapi",
    operationId: operation.operationId,
    name: operation.summary || `${operation.method} ${operation.path}`,
    method: operation.method,
    path: operation.path,
    url: "",
    parameters: operation.parameters.map(parameterFromOperation),
    headers: [],
    body: requestBodyExample(operation.requestBodyMediaTypes[0]),
    contentType: operation.requestBodyMediaTypes[0]?.mediaType ?? "application/json",
    sortOrder
  };
}

export function customDraftRequest(serverId: string | null, baseUrl: string, sortOrder = Date.now()): CreateRequestDraftRequest {
  return {
    serverId,
    sourceType: "custom",
    operationId: null,
    name: "Custom request",
    isNameManual: false,
    method: "GET",
    url: baseUrl,
    parameters: [],
    headers: [],
    body: "",
    contentType: "application/json",
    sortOrder
  };
}

export function operationRequestPayload(draft: RequestDraft, serverId: string, selectedOperation: NormalizedOperation): CallOperationRequest {
  const parameters = parseDraftParameters(draft).filter((parameter) => parameter.enabled);
  return {
    serverId,
    requestDraftId: draft.id,
    operationId: selectedOperation.operationId,
    values: Object.fromEntries(parameters.map((parameter) => [parameter.name, parameter.value])),
    body: draft.body,
    contentType: draft.contentType
  };
}

export function customRequestPayload(draft: RequestDraft): CallCustomRequestRequest {
  return {
    serverId: draft.serverInstanceId,
    requestDraftId: draft.id,
    method: draft.method,
    url: draft.url,
    parameters: parseDraftParameters(draft).filter((parameter) => parameter.in !== "path"),
    headers: parseDraftHeaders(draft),
    body: draft.body,
    contentType: draft.contentType
  };
}

export function parseDraftParameters(draft: RequestDraft | null): RequestDraftParameter[] {
  return draft ? parseJsonArray<RequestDraftParameter>(draft.parametersJson) : [];
}

export function parseDraftHeaders(draft: RequestDraft | null): RequestDraftHeader[] {
  return draft ? parseJsonArray<RequestDraftHeader>(draft.headersJson) : [];
}

export function editableDraftFieldsMatch(left: RequestDraft, right: RequestDraft): boolean {
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

function parameterFromOperation(parameter: NormalizedOperation["parameters"][number]): RequestDraftParameter {
  return {
    id: `${parameter.in}:${parameter.name}`,
    name: parameter.name,
    in: parameter.in,
    value: parameterExampleValue(parameter),
    enabled: true,
    required: parameter.required,
    description: parameter.description,
    source: "openapi"
  };
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}
