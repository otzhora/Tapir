import type {
  NormalizedOperation,
  PreparedOperationRequest,
  PreparedRequest,
  PreparedRequestValidationIssue,
  RequestDraftHeader,
  RequestDraftParameter,
  ServerVariable
} from "./index";
import { resolveVariables } from "./variables.js";

export interface PrepareOperationRequestInput {
  operation: NormalizedOperation;
  values: Record<string, string>;
  body?: string;
  contentType?: string;
  authentications?: PreparedAuthentication[];
  variables?: ServerVariable[];
}

export type PreparedAuthentication =
  | { type: "apiKey"; name: string; in: "query" | "header" | "cookie"; value: string }
  | { type: "bearer"; value: string }
  | { type: "basic"; username: string; password: string };

export function prepareOperationRequest(baseUrl: string, input: PrepareOperationRequestInput): PreparedOperationRequest {
  const validationIssues: PreparedRequestValidationIssue[] = [];
  const resolve = (value: string, field: string) => resolveVariables(value, { variables: input.variables, validationIssues, field });
  let path = input.operation.path;
  for (const parameter of input.operation.parameters.filter((parameter) => parameter.in === "path")) {
    const value = resolve(input.values[parameter.name]?.trim() ?? "", parameter.name);
    if (parameter.required && !value) {
      validationIssues.push({ field: parameter.name, message: `${parameter.name} is required.` });
    }
    path = path.replaceAll(`{${parameter.name}}`, serializePathParameter(parameter, value));
  }
  if (/{[^}]+}/.test(path)) {
    validationIssues.push({ field: "path", message: "The request path still has unresolved parameters." });
  }

  const resolvedBaseUrl = resolve(baseUrl, "url");
  const url = createUrl(path.replace(/^\//, ""), ensureTrailingSlash(resolvedBaseUrl), validationIssues);
  for (const parameter of input.operation.parameters.filter((parameter) => parameter.in === "query")) {
    const value = resolve(input.values[parameter.name]?.trim() ?? "", parameter.name);
    if (parameter.required && !value) {
      validationIssues.push({ field: parameter.name, message: `${parameter.name} is required.` });
    }
    appendOperationQueryValue(url, parameter, value);
  }

  const headers: Record<string, string> = {};
  for (const parameter of input.operation.parameters.filter((parameter) => parameter.in === "header")) {
    const value = resolve(input.values[parameter.name]?.trim() ?? "", parameter.name);
    if (parameter.required && !value) {
      validationIssues.push({ field: parameter.name, message: `${parameter.name} is required.` });
    }
    if (value) headers[parameter.name] = serializeHeaderValue(parameter, value);
  }
  const cookieValues = input.operation.parameters
    .filter((parameter) => parameter.in === "cookie")
    .flatMap((parameter) => {
      const value = resolve(input.values[parameter.name]?.trim() ?? "", parameter.name);
      if (parameter.required && !value) {
        validationIssues.push({ field: parameter.name, message: `${parameter.name} is required.` });
      }
      return serializeCookieValues(parameter, value);
    });
  applyAuthentications(url, headers, cookieValues, input.authentications ?? [], resolve);
  if (cookieValues.length > 0) headers.cookie = cookieValues.join("; ");

  const rawBody = input.operation.method === "GET" || input.operation.method === "HEAD" ? undefined : input.body;
  const contentType = input.contentType?.trim() || input.operation.requestBodyMediaTypes?.[0]?.mediaType || "application/json";
  const media = input.operation.requestBodyMediaTypes.find((candidate) => candidate.mediaType === contentType)
    ?? input.operation.requestBodyMediaTypes[0];
  if (media?.required && !rawBody?.trim()) validationIssues.push({ field: "body", message: "Request body is required." });
  const preparedBody = prepareBody(rawBody, contentType, validationIssues, media?.schema);
  if (preparedBody.body && !preparedBody.bodyEncoding) headers["content-type"] = headers["content-type"] ?? contentType;

  const request = {
    method: input.operation.method,
    url: url.toString(),
    headers,
    body: preparedBody.body,
    bodyEncoding: preparedBody.bodyEncoding
  };
  return {
    request,
    redactedRequest: redactRequest(request, input.authentications ?? [], resolve),
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
  variables?: ServerVariable[];
}

export function prepareCustomRequest(input: PrepareCustomRequestInput): PreparedOperationRequest {
  const validationIssues: PreparedRequestValidationIssue[] = [];
  const resolve = (value: string, field: string) => resolveVariables(value, { variables: input.variables, validationIssues, field });
  const urlValue = resolve(input.url.trim(), "url");
  let url: URL | null = null;
  try {
    url = new URL(urlValue);
  } catch {
    validationIssues.push({ field: "url", message: "Custom request URL must be absolute." });
  }

  if (url) {
    for (const parameter of input.parameters.filter((parameter) => parameter.enabled && parameter.in === "query")) {
      appendQueryValues(url, resolve(parameter.name.trim(), parameter.name || "query"), resolve(parameter.value, parameter.name || "query"));
    }
  }

  const headers: Record<string, string> = {};
  for (const header of input.headers.filter((header) => header.enabled)) {
    const name = resolve(header.name.trim(), header.name || "header");
    if (name) headers[name] = resolve(header.value, name);
  }
  for (const parameter of input.parameters.filter((parameter) => parameter.enabled && parameter.in === "header")) {
    const name = resolve(parameter.name.trim(), parameter.name || "header");
    if (name) headers[name] = resolve(parameter.value, name);
  }
  const cookieValues = input.parameters
    .filter((parameter) => parameter.enabled && parameter.in === "cookie")
    .flatMap((parameter) => {
      const name = resolve(parameter.name.trim(), parameter.name || "cookie");
      const value = resolve(parameter.value, name || "cookie");
      return name && value ? [`${name}=${encodeURIComponent(value)}`] : [];
    });
  if (cookieValues.length > 0) headers.cookie = cookieValues.join("; ");

  const rawBody = input.method === "GET" || input.method === "HEAD" ? undefined : input.body;
  const contentType = input.contentType?.trim() || "application/json";
  const preparedBody = prepareBody(rawBody, contentType, validationIssues);
  if (preparedBody.body && !preparedBody.bodyEncoding) headers["content-type"] = headers["content-type"] ?? contentType;

  const request = {
    method: input.method,
    url: url?.toString() ?? urlValue,
    headers,
    body: preparedBody.body,
    bodyEncoding: preparedBody.bodyEncoding
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

function appendOperationQueryValue(
  url: URL,
  parameter: NormalizedOperation["parameters"][number],
  value: string
): void {
  if (!value) return;
  const items = parameterIsArray(parameter) ? splitArrayInput(value) : [value];
  if (parameter.style === "spaceDelimited") {
    url.searchParams.append(parameter.name, items.join(" "));
    return;
  }
  if (parameter.style === "pipeDelimited") {
    url.searchParams.append(parameter.name, items.join("|"));
    return;
  }
  if (parameterIsArray(parameter) && parameter.explode !== false) {
    for (const item of items) url.searchParams.append(parameter.name, item);
    return;
  }
  url.searchParams.append(parameter.name, items.join(","));
}

function serializePathParameter(parameter: NormalizedOperation["parameters"][number], value: string): string {
  const values = parameterIsArray(parameter) ? splitArrayInput(value) : [value];
  const encoded = values.map(encodeURIComponent);
  if (parameter.style === "label") return `.${encoded.join(parameter.explode ? "." : ",")}`;
  if (parameter.style === "matrix") {
    return parameter.explode
      ? encoded.map((item) => `;${encodeURIComponent(parameter.name)}=${item}`).join("")
      : `;${encodeURIComponent(parameter.name)}=${encoded.join(",")}`;
  }
  return encoded.join(",");
}

function serializeHeaderValue(parameter: NormalizedOperation["parameters"][number], value: string): string {
  return parameterIsArray(parameter) ? splitArrayInput(value).join(",") : value;
}

function serializeCookieValues(parameter: NormalizedOperation["parameters"][number], value: string): string[] {
  if (!value) return [];
  const values = parameterIsArray(parameter) ? splitArrayInput(value) : [value];
  if (parameterIsArray(parameter)) {
    const encodedName = encodeURIComponent(parameter.name);
    const encodedValues = values.map(encodeURIComponent);
    return parameter.explode === false
      ? [`${encodedName}=${encodedValues.join(",")}`]
      : [`${encodedName}=${encodedValues.join(`&${encodedName}=`)}`];
  }
  return [`${encodeURIComponent(parameter.name)}=${encodeURIComponent(value)}`];
}

function parameterIsArray(parameter: NormalizedOperation["parameters"][number]): boolean {
  return !!parameter.schema && typeof parameter.schema === "object" && !Array.isArray(parameter.schema)
    && "type" in parameter.schema && parameter.schema.type === "array";
}

function splitArrayInput(value: string): string[] {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function createUrl(path: string, baseUrl: string, validationIssues: PreparedRequestValidationIssue[]): URL {
  try {
    return new URL(path, baseUrl);
  } catch {
    validationIssues.push({ field: "url", message: "Request URL could not be prepared." });
    return new URL(path.replace(/^\//, ""), "http://tapir.invalid/");
  }
}

function prepareBody(
  body: string | undefined,
  contentType: string,
  validationIssues: PreparedRequestValidationIssue[],
  schema?: unknown
): { body?: string; bodyEncoding?: "multipart-json" } {
  if (!body) return {};
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();
  if (mediaType === "application/x-www-form-urlencoded") {
    const value = parseObjectBody(body, validationIssues, "URL-encoded form body");
    if (!value) return { body };
    const encoded = new URLSearchParams();
    appendFormValues(encoded, value);
    return { body: encoded.toString() };
  }
  if (mediaType === "multipart/form-data") {
    parseObjectBody(body, validationIssues, "Multipart body");
    return { body, bodyEncoding: "multipart-json" };
  }
  if (mediaType === "application/json" || mediaType?.endsWith("+json")) {
    const value = parseJsonBody(body, validationIssues);
    if (value !== undefined) validateRequiredBodyFields(value, schema, validationIssues);
  }
  return { body };
}

function parseJsonBody(body: string, validationIssues: PreparedRequestValidationIssue[]): unknown | undefined {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    validationIssues.push({ field: "body", message: "Request body must be valid JSON for the selected content type." });
    return undefined;
  }
}

function parseObjectBody(body: string, validationIssues: PreparedRequestValidationIssue[], label: string): Record<string, unknown> | null {
  const value = parseJsonBody(body, validationIssues);
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    validationIssues.push({ field: "body", message: `${label} must be a JSON object.` });
    return null;
  }
  return value as Record<string, unknown>;
}

function appendFormValues(target: URLSearchParams, value: Record<string, unknown>): void {
  for (const [key, item] of Object.entries(value)) {
    const values = Array.isArray(item) ? item : [item];
    for (const nested of values) {
      if (nested === undefined || nested === null) continue;
      target.append(key, typeof nested === "object" ? JSON.stringify(nested) : String(nested));
    }
  }
}

function validateRequiredBodyFields(value: unknown, schema: unknown, validationIssues: PreparedRequestValidationIssue[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value) || !schema || typeof schema !== "object" || Array.isArray(schema)) return;
  const required = "required" in schema && Array.isArray(schema.required) ? schema.required : [];
  const missing = required.filter((key): key is string => typeof key === "string" && !(key in value));
  if (missing.length > 0) validationIssues.push({ field: "body", message: `Missing required body field${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.` });
}

function applyAuthentications(
  url: URL,
  headers: Record<string, string>,
  cookies: string[],
  authentications: PreparedAuthentication[],
  resolve: (value: string, field: string) => string
): void {
  for (const authentication of authentications) {
    if (authentication.type === "apiKey") {
      const name = resolve(authentication.name, "authentication");
      const value = resolve(authentication.value, "authentication");
      if (!name || !value) continue;
      if (authentication.in === "query") url.searchParams.append(name, value);
      if (authentication.in === "header") headers[name] = value;
      if (authentication.in === "cookie") cookies.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
    }
    if (authentication.type === "bearer") {
      const value = resolve(authentication.value, "authentication");
      if (value) headers.authorization = `Bearer ${value}`;
    }
    if (authentication.type === "basic") {
      const username = resolve(authentication.username, "authentication");
      const password = resolve(authentication.password, "authentication");
      if (username || password) headers.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    }
  }
}

function redactRequest(
  request: PreparedRequest,
  authentications: PreparedAuthentication[],
  resolve: (value: string, field: string) => string
): PreparedRequest {
  if (authentications.length === 0) return request;
  const redactedUrl = new URL(request.url);
  const headers = { ...request.headers };
  for (const authentication of authentications) {
    const authenticationName = authentication.type === "apiKey" ? resolve(authentication.name, "authentication") : "";
    if (authentication.type === "apiKey" && authentication.in === "query") {
      if (redactedUrl.searchParams.has(authenticationName)) redactedUrl.searchParams.set(authenticationName, "********");
    }
    if (authentication.type === "apiKey" && authentication.in === "header" && authenticationName in headers) {
      headers[authenticationName] = "********";
    }
    if (authentication.type === "apiKey" && authentication.in === "cookie" && headers.cookie) {
      headers.cookie = redactCookie(headers.cookie, authenticationName);
    }
    if ((authentication.type === "bearer" || authentication.type === "basic") && headers.authorization) {
      headers.authorization = `${authentication.type === "bearer" ? "Bearer" : "Basic"} ********`;
    }
  }
  return { ...request, url: redactedUrl.toString(), headers };
}

function redactCookie(value: string, name: string): string {
  const encodedName = encodeURIComponent(name);
  return value.split(";").map((part) => {
    const trimmed = part.trim();
    return trimmed.startsWith(`${encodedName}=`) ? `${encodedName}=********` : trimmed;
  }).join("; ");
}
