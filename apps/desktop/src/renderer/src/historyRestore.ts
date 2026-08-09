import type { CallOperationResponse, NormalizedOperation } from "@tapir/core";

export interface RestoredRequestInputs {
  parameterValues: Record<string, string>;
  bodyValue: string;
  contentType: string;
}

export function parseRequestSnapshot(value: string): CallOperationResponse["request"] {
  try {
    return JSON.parse(value) as CallOperationResponse["request"];
  } catch {
    return { method: "GET", url: "", headers: {} };
  }
}

export function parseHeaders(value: string | null): Record<string, string> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, string>;
  } catch {
    return {};
  }
}

export function restoreRequestInputs(
  operation: NormalizedOperation,
  request: CallOperationResponse["request"],
  fallbackContentType: string
): RestoredRequestInputs {
  const url = parseUrl(request.url);
  const parameterValues: Record<string, string> = {};
  if (url) {
    Object.assign(parameterValues, restorePathValues(operation, url));
    const cookies = parseCookies(request.headers.cookie ?? request.headers.Cookie);
    for (const parameter of operation.parameters) {
      if (parameter.in === "query") {
        parameterValues[parameter.name] = restoreQueryParameter(parameter, url);
      }
      if (parameter.in === "header" && request.headers[parameter.name]) {
        parameterValues[parameter.name] = restoreSimpleParameter(parameter, request.headers[parameter.name]);
      }
      if (parameter.in === "cookie") {
        parameterValues[parameter.name] = restoreCookieParameter(parameter, cookies);
      }
    }
  }
  return {
    parameterValues,
    bodyValue: request.body ?? "",
    contentType: request.headers["content-type"] ?? fallbackContentType
  };
}

function parseCookies(value: string | undefined): Record<string, string> {
  if (!value) return {};
  const cookies: Record<string, string> = {};
  for (const part of value.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = decodeURIComponent(part.slice(0, separator).trim());
    const rawValue = part.slice(separator + 1).trim();
    cookies[name] = decodeURIComponent(rawValue);
  }
  return cookies;
}

function restorePathValues(operation: NormalizedOperation, url: URL): Record<string, string> {
  const values: Record<string, string> = {};
  const templateParts = operation.path.split("/").filter(Boolean);
  const actualParts = url.pathname.split("/").filter(Boolean);
  templateParts.forEach((part, index) => {
    const match = /^\{(.+)\}$/.exec(part);
    if (!match) return;
    const parameter = operation.parameters.find((candidate) => candidate.in === "path" && candidate.name === match[1]);
    values[match[1]] = parameter ? restorePathParameter(parameter, decodeURIComponent(actualParts[index] ?? "")) : decodeURIComponent(actualParts[index] ?? "");
  });
  return values;
}

function restoreQueryParameter(parameter: NormalizedOperation["parameters"][number], url: URL): string {
  if (!parameterIsObject(parameter)) return url.searchParams.getAll(parameter.name).join(", ");
  if (parameter.style === "deepObject") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of url.searchParams) {
      if (!key.startsWith(`${parameter.name}[`)) continue;
      assignDeepObject(result, key.slice(parameter.name.length), value);
    }
    return Object.keys(result).length > 0 ? JSON.stringify(result) : "";
  }
  if (parameter.explode !== false) {
    const result = Object.fromEntries(schemaPropertyNames(parameter).flatMap((name) => {
      const values = url.searchParams.getAll(name);
      return values.length > 0 ? [[name, values.length === 1 ? values[0] : values]] : [];
    }));
    return Object.keys(result).length > 0 ? JSON.stringify(result) : "";
  }
  return objectFromPairs(url.searchParams.get(parameter.name) ?? "");
}

function restoreSimpleParameter(parameter: NormalizedOperation["parameters"][number], value: string): string {
  if (!parameterIsObject(parameter)) return value;
  if (parameter.explode) return JSON.stringify(Object.fromEntries(value.split(",").map((part) => part.split("=", 2)).filter((pair) => pair.length === 2)));
  return objectFromPairs(value);
}

function restoreCookieParameter(parameter: NormalizedOperation["parameters"][number], cookies: Record<string, string>): string {
  if (!parameterIsObject(parameter)) return cookies[parameter.name] ?? "";
  if (parameter.explode !== false) {
    const result = Object.fromEntries(schemaPropertyNames(parameter).flatMap((name) => name in cookies ? [[name, cookies[name]]] : []));
    return Object.keys(result).length > 0 ? JSON.stringify(result) : "";
  }
  return objectFromPairs(cookies[parameter.name] ?? "");
}

function restorePathParameter(parameter: NormalizedOperation["parameters"][number], value: string): string {
  if (!parameterIsObject(parameter)) return value;
  if (parameter.style === "matrix") {
    if (parameter.explode) return JSON.stringify(Object.fromEntries(value.split(";").filter(Boolean).map((part) => part.split("=", 2))));
    return objectFromPairs(value.replace(new RegExp(`^;${escapeRegExp(parameter.name)}=`), ""));
  }
  if (parameter.style === "label") {
    const content = value.replace(/^\./, "");
    if (parameter.explode) return JSON.stringify(Object.fromEntries(content.split(".").map((part) => part.split("=", 2))));
    return objectFromPairs(content);
  }
  if (parameter.explode) return JSON.stringify(Object.fromEntries(value.split(",").map((part) => part.split("=", 2))));
  return objectFromPairs(value);
}

function objectFromPairs(value: string): string {
  if (!value) return "";
  const parts = value.split(",");
  const result: Record<string, string> = {};
  for (let index = 0; index + 1 < parts.length; index += 2) result[parts[index]!] = parts[index + 1]!;
  return JSON.stringify(result);
}

function assignDeepObject(target: Record<string, unknown>, suffix: string, value: string): void {
  const segments = Array.from(suffix.matchAll(/\[([^\]]*)\]/g), (match) => match[1] ?? "");
  if (segments.length === 0) return;
  let current: Record<string, unknown> | unknown[] = target;
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    if (last) {
      if (segment === "" && Array.isArray(current)) {
        current.push(value);
        return;
      }
      if (segment === "" || Array.isArray(current)) return;
      const existing = current[segment];
      current[segment] = existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
      return;
    }
    if (!segment || Array.isArray(current)) return;
    const next = segments[index + 1];
    if (!current[segment] || typeof current[segment] !== "object") current[segment] = next === "" ? [] : {};
    current = current[segment] as Record<string, unknown> | unknown[];
  });
}

function schemaPropertyNames(parameter: NormalizedOperation["parameters"][number]): string[] {
  if (!parameter.schema || typeof parameter.schema !== "object" || Array.isArray(parameter.schema) || !("properties" in parameter.schema)) return [];
  const properties = parameter.schema.properties;
  return properties && typeof properties === "object" && !Array.isArray(properties) ? Object.keys(properties) : [];
}

function parameterIsObject(parameter: NormalizedOperation["parameters"][number]): boolean {
  if (!parameter.schema || typeof parameter.schema !== "object" || Array.isArray(parameter.schema) || !("type" in parameter.schema)) return false;
  const type = parameter.schema.type;
  return type === "object" || Array.isArray(type) && type.includes("object");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
