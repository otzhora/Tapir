import type {
  CallCustomRequestRequest,
  CallOperationRequest,
  CreateRequestDraftRequest,
  DeleteAuthenticationRequest,
  ListRequestDraftsRequest,
  PreviewCustomRequestRequest,
  SaveAuthenticationRequest,
  SaveServerVariablesRequest,
  TapirIpcChannel,
  TapirIpcRequest,
  UpdateRequestDraftRequest,
  UpdateServerConfigurationRequest
} from "./ipc.js";
import type { HistoryFilter, HistoryQuery, HttpMethod, RequestDraft, RequestDraftHeader, RequestDraftParameter } from "./index.js";

const httpMethods = new Set<HttpMethod>(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

export function parseTapirIpcRequest<Channel extends TapirIpcChannel>(
  channel: Channel,
  value: unknown
): TapirIpcRequest<Channel> {
  const parsed: unknown = parseByChannel(channel, value);
  return parsed as TapirIpcRequest<Channel>;
}

function parseByChannel(channel: TapirIpcChannel, value: unknown): unknown {
  switch (channel) {
    case "tapir:getInitialState":
      if (value !== undefined) invalid(channel);
      return undefined;
    case "tapir:addServer": {
      const input = record(value, channel);
      return { baseUrl: string(input.baseUrl, "baseUrl"), specUrl: optionalString(input.specUrl, "specUrl") };
    }
    case "tapir:refreshServerSchema":
    case "tapir:rediscoverServerSchema": {
      const input = record(value, channel);
      return { serverId: string(input.serverId, "serverId") };
    }
    case "tapir:updateServerConfiguration":
      return updateServerConfiguration(value);
    case "tapir:deleteServer":
    case "tapir:deleteRequestDraft":
      return string(value, "id");
    case "tapir:saveAuthentication":
      return saveAuthentication(value);
    case "tapir:deleteAuthentication":
      return deleteAuthentication(value);
    case "tapir:saveServerVariables":
      return saveServerVariables(value);
    case "tapir:callOperation":
    case "tapir:previewOperation":
      return callOperation(value);
    case "tapir:listHistory":
      return historyQuery(value);
    case "tapir:deleteHistoryEntry": {
      const input = record(value, channel);
      return { workspaceId: string(input.workspaceId, "workspaceId"), id: string(input.id, "id") };
    }
    case "tapir:clearHistory":
      return historyFilter(value);
    case "tapir:listRequestDrafts": {
      const input = record(value, channel);
      return { workspaceId: string(input.workspaceId, "workspaceId") } satisfies ListRequestDraftsRequest;
    }
    case "tapir:createRequestDraft":
      return createRequestDraft(value);
    case "tapir:updateRequestDraft": {
      const input = record(value, channel);
      return { draft: editableRequestDraft(input.draft) } satisfies UpdateRequestDraftRequest;
    }
    case "tapir:previewCustomRequest":
      return customRequest(value, false);
    case "tapir:callCustomRequest":
      return customRequest(value, true);
  }
}

function updateServerConfiguration(value: unknown): UpdateServerConfigurationRequest {
  const input = record(value, "updateServerConfiguration");
  return {
    serverId: string(input.serverId, "serverId"),
    name: string(input.name, "name"),
    baseUrl: string(input.baseUrl, "baseUrl"),
    specUrl: string(input.specUrl, "specUrl")
  };
}

function saveAuthentication(value: unknown): SaveAuthenticationRequest {
  const input = record(value, "saveAuthentication");
  const type = oneOf(input.type, ["apiKey", "bearer", "basic"] as const, "type");
  return {
    serverId: string(input.serverId, "serverId"),
    schemeKey: string(input.schemeKey, "schemeKey"),
    type,
    parameterName: optionalString(input.parameterName, "parameterName"),
    location: optionalOneOf(input.location, ["query", "header", "cookie"] as const, "location"),
    username: optionalString(input.username, "username"),
    secretValue: string(input.secretValue, "secretValue")
  };
}

function deleteAuthentication(value: unknown): DeleteAuthenticationRequest {
  const input = record(value, "deleteAuthentication");
  return { serverId: string(input.serverId, "serverId"), schemeKey: string(input.schemeKey, "schemeKey") };
}

function saveServerVariables(value: unknown): SaveServerVariablesRequest {
  const input = record(value, "saveServerVariables");
  return {
    serverId: string(input.serverId, "serverId"),
    variables: array(input.variables, "variables").map((candidate, index) => {
      const variable = record(candidate, `variables[${index}]`);
      return {
        id: optionalString(variable.id, `variables[${index}].id`),
        key: string(variable.key, `variables[${index}].key`),
        value: string(variable.value, `variables[${index}].value`)
      };
    })
  };
}

function callOperation(value: unknown): CallOperationRequest {
  const input = record(value, "callOperation");
  return {
    serverId: string(input.serverId, "serverId"),
    requestDraftId: optionalString(input.requestDraftId, "requestDraftId"),
    operationId: string(input.operationId, "operationId"),
    values: stringRecord(input.values, "values"),
    body: optionalString(input.body, "body"),
    contentType: optionalString(input.contentType, "contentType")
  };
}

function createRequestDraft(value: unknown): CreateRequestDraftRequest {
  const input = record(value, "createRequestDraft");
  return {
    serverId: nullableString(input.serverId, "serverId"),
    sourceType: oneOf(input.sourceType, ["openapi", "custom"] as const, "sourceType"),
    operationId: nullableString(input.operationId, "operationId"),
    name: string(input.name, "name"),
    isNameManual: optionalBoolean(input.isNameManual, "isNameManual"),
    method: method(input.method),
    path: optionalString(input.path, "path"),
    url: optionalString(input.url, "url"),
    parameters: input.parameters === undefined ? undefined : array(input.parameters, "parameters").map(requestParameter),
    headers: input.headers === undefined ? undefined : array(input.headers, "headers").map(requestHeader),
    body: optionalString(input.body, "body"),
    contentType: optionalString(input.contentType, "contentType"),
    sortOrder: optionalFiniteNumber(input.sortOrder, "sortOrder")
  };
}

function customRequest(value: unknown, requireServerId: boolean): PreviewCustomRequestRequest | CallCustomRequestRequest {
  const input = record(value, "customRequest");
  const base = {
    method: method(input.method),
    serverId: input.serverId === undefined && !requireServerId ? undefined : nullableString(input.serverId, "serverId"),
    url: string(input.url, "url"),
    parameters: array(input.parameters, "parameters").map(requestParameter),
    headers: array(input.headers, "headers").map(requestHeader),
    body: optionalString(input.body, "body"),
    contentType: optionalString(input.contentType, "contentType")
  };
  return requireServerId
    ? { ...base, serverId: nullableString(input.serverId, "serverId"), requestDraftId: optionalString(input.requestDraftId, "requestDraftId") }
    : base;
}

function editableRequestDraft(value: unknown): UpdateRequestDraftRequest["draft"] {
  const input = record(value, "draft");
  return {
    id: string(input.id, "draft.id"),
    name: string(input.name, "draft.name"),
    isNameManual: boolean(input.isNameManual, "draft.isNameManual"),
    method: method(input.method),
    path: string(input.path, "draft.path"),
    url: string(input.url, "draft.url"),
    parametersJson: string(input.parametersJson, "draft.parametersJson"),
    headersJson: string(input.headersJson, "draft.headersJson"),
    body: string(input.body, "draft.body"),
    contentType: string(input.contentType, "draft.contentType"),
    sortOrder: finiteNumber(input.sortOrder, "draft.sortOrder")
  };
}

function requestParameter(value: unknown, index: number): RequestDraftParameter {
  const input = record(value, `parameters[${index}]`);
  return {
    id: string(input.id, `parameters[${index}].id`),
    name: string(input.name, `parameters[${index}].name`),
    in: oneOf(input.in, ["path", "query", "header", "cookie"] as const, `parameters[${index}].in`),
    value: string(input.value, `parameters[${index}].value`),
    enabled: boolean(input.enabled, `parameters[${index}].enabled`),
    required: optionalBoolean(input.required, `parameters[${index}].required`),
    description: optionalString(input.description, `parameters[${index}].description`),
    source: oneOf(input.source, ["openapi", "custom"] as const, `parameters[${index}].source`)
  };
}

function requestHeader(value: unknown, index: number): RequestDraftHeader {
  const input = record(value, `headers[${index}]`);
  return {
    id: string(input.id, `headers[${index}].id`),
    name: string(input.name, `headers[${index}].name`),
    value: string(input.value, `headers[${index}].value`),
    enabled: boolean(input.enabled, `headers[${index}].enabled`)
  };
}

function historyQuery(value: unknown): HistoryQuery {
  const input = historyFilter(value);
  const raw = record(value, "historyQuery");
  return { ...input, cursor: optionalString(raw.cursor, "cursor"), limit: optionalFiniteNumber(raw.limit, "limit") };
}

function historyFilter(value: unknown): HistoryFilter {
  const input = record(value, "historyFilter");
  return {
    workspaceId: string(input.workspaceId, "workspaceId"),
    serverId: input.serverId === undefined ? undefined : nullableString(input.serverId, "serverId"),
    method: input.method === undefined ? undefined : method(input.method),
    status: optionalFiniteNumber(input.status, "status"),
    operationId: optionalString(input.operationId, "operationId"),
    search: optionalString(input.search, "search"),
    createdAfter: optionalString(input.createdAfter, "createdAfter"),
    createdBefore: optionalString(input.createdBefore, "createdBefore")
  };
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field);
  return value as Record<string, unknown>;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) invalid(field);
  return value;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string") invalid(field);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : string(value, field);
}

function nullableString(value: unknown, field: string): string | null {
  return value === null ? null : string(value, field);
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") invalid(field);
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  return value === undefined ? undefined : boolean(value, field);
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(field);
  return value;
}

function optionalFiniteNumber(value: unknown, field: string): number | undefined {
  return value === undefined ? undefined : finiteNumber(value, field);
}

function method(value: unknown): HttpMethod {
  if (typeof value !== "string" || !httpMethods.has(value as HttpMethod)) invalid("method");
  return value as HttpMethod;
}

function stringRecord(value: unknown, field: string): Record<string, string> {
  const input = record(value, field);
  return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, string(item, `${field}.${key}`)]));
}

function oneOf<const Values extends readonly string[]>(value: unknown, values: Values, field: string): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) invalid(field);
  return value as Values[number];
}

function optionalOneOf<const Values extends readonly string[]>(value: unknown, values: Values, field: string): Values[number] | undefined {
  return value === undefined ? undefined : oneOf(value, values, field);
}

function invalid(field: string): never {
  throw new Error(`Invalid IPC request field: ${field}.`);
}
