import type {
  NormalizedOperation,
  PreparedOperationRequest,
  PreparedRequest,
  PreparedRequestValidationIssue,
  RequestDraftHeader,
  RequestDraftParameter
} from "./index";

export interface PrepareOperationRequestInput {
  operation: NormalizedOperation;
  values: Record<string, string>;
  body?: string;
  contentType?: string;
  apiKeyHeaderName?: string;
  apiKeyValue?: string;
}

export function prepareOperationRequest(baseUrl: string, input: PrepareOperationRequestInput): PreparedOperationRequest {
  const validationIssues: PreparedRequestValidationIssue[] = [];
  let path = input.operation.path;
  for (const parameter of input.operation.parameters.filter((parameter) => parameter.in === "path")) {
    const value = input.values[parameter.name]?.trim() ?? "";
    if (parameter.required && !value) {
      validationIssues.push({ field: parameter.name, message: `${parameter.name} is required.` });
    }
    path = path.replaceAll(`{${parameter.name}}`, encodeURIComponent(value));
  }
  if (/{[^}]+}/.test(path)) {
    validationIssues.push({ field: "path", message: "The request path still has unresolved parameters." });
  }

  const url = new URL(path.replace(/^\//, ""), ensureTrailingSlash(baseUrl));
  for (const parameter of input.operation.parameters.filter((parameter) => parameter.in === "query")) {
    const value = input.values[parameter.name]?.trim() ?? "";
    if (parameter.required && !value) {
      validationIssues.push({ field: parameter.name, message: `${parameter.name} is required.` });
    }
    appendQueryValues(url, parameter.name, value);
  }

  const headers: Record<string, string> = {};
  for (const parameter of input.operation.parameters.filter((parameter) => parameter.in === "header")) {
    const value = input.values[parameter.name]?.trim() ?? "";
    if (parameter.required && !value) {
      validationIssues.push({ field: parameter.name, message: `${parameter.name} is required.` });
    }
    if (value) headers[parameter.name] = value;
  }
  const apiKeyHeaderName = input.apiKeyHeaderName?.trim();
  const apiKeyValue = input.apiKeyValue ?? "";
  if (apiKeyHeaderName && apiKeyValue) {
    headers[apiKeyHeaderName] = apiKeyValue;
  }

  const body = input.operation.method === "GET" || input.operation.method === "HEAD" ? undefined : input.body;
  const contentType = input.contentType?.trim() || input.operation.requestBodyMediaTypes?.[0]?.mediaType || "application/json";
  if (body) {
    headers["content-type"] = headers["content-type"] ?? contentType;
    if (contentType.includes("json")) {
      validateJsonBody(body, validationIssues);
    }
  }

  const request = {
    method: input.operation.method,
    url: url.toString(),
    headers,
    body
  };
  return {
    request,
    redactedRequest: redactRequest(request, apiKeyHeaderName),
    validationIssues
  };
}

export interface PrepareCustomRequestInput {
  method: PreparedRequest["method"];
  url: string;
  parameters: RequestDraftParameter[];
  headers: RequestDraftHeader[];
  body?: string;
  contentType?: string;
}

export function prepareCustomRequest(input: PrepareCustomRequestInput): PreparedOperationRequest {
  const validationIssues: PreparedRequestValidationIssue[] = [];
  const urlValue = input.url.trim();
  let url: URL | null = null;
  try {
    url = new URL(urlValue);
  } catch {
    validationIssues.push({ field: "url", message: "Custom request URL must be absolute." });
  }

  if (url) {
    for (const parameter of input.parameters.filter((parameter) => parameter.enabled && parameter.in === "query")) {
      appendQueryValues(url, parameter.name.trim(), parameter.value);
    }
  }

  const headers: Record<string, string> = {};
  for (const header of input.headers.filter((header) => header.enabled)) {
    const name = header.name.trim();
    if (name) headers[name] = header.value;
  }
  for (const parameter of input.parameters.filter((parameter) => parameter.enabled && parameter.in === "header")) {
    const name = parameter.name.trim();
    if (name) headers[name] = parameter.value;
  }

  const body = input.method === "GET" || input.method === "HEAD" ? undefined : input.body;
  const contentType = input.contentType?.trim() || "application/json";
  if (body) {
    headers["content-type"] = headers["content-type"] ?? contentType;
    if (contentType.includes("json")) validateJsonBody(body, validationIssues);
  }

  const request = {
    method: input.method,
    url: url?.toString() ?? urlValue,
    headers,
    body
  };
  return {
    request,
    redactedRequest: request,
    validationIssues
  };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function appendQueryValues(url: URL, name: string, value: string): void {
  if (!value) return;
  for (const item of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    url.searchParams.append(name, item);
  }
}

function validateJsonBody(body: string, validationIssues: PreparedRequestValidationIssue[]): void {
  const trimmed = body.trim();
  if (!trimmed) return;
  try {
    JSON.parse(trimmed);
  } catch {
    validationIssues.push({ field: "body", message: "Request body must be valid JSON for the selected content type." });
  }
}

function redactRequest(request: PreparedRequest, secretHeaderName?: string): PreparedRequest {
  if (!secretHeaderName || !(secretHeaderName in request.headers)) return request;
  return {
    ...request,
    headers: { ...request.headers, [secretHeaderName]: "********" }
  };
}
