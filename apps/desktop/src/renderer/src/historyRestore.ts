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
    for (const parameter of operation.parameters) {
      if (parameter.in === "query") {
        parameterValues[parameter.name] = url.searchParams.getAll(parameter.name).join(", ");
      }
      if (parameter.in === "header" && request.headers[parameter.name]) {
        parameterValues[parameter.name] = request.headers[parameter.name];
      }
    }
  }
  return {
    parameterValues,
    bodyValue: request.body ?? "",
    contentType: request.headers["content-type"] ?? fallbackContentType
  };
}

function restorePathValues(operation: NormalizedOperation, url: URL): Record<string, string> {
  const values: Record<string, string> = {};
  const templateParts = operation.path.split("/").filter(Boolean);
  const actualParts = url.pathname.split("/").filter(Boolean);
  templateParts.forEach((part, index) => {
    const match = /^\{(.+)\}$/.exec(part);
    if (!match) return;
    values[match[1]] = decodeURIComponent(actualParts[index] ?? "");
  });
  return values;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
