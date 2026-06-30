import type { PreparedRequest } from "@tapir/core";

export function formatJsonBody(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function formatRequestPreview(request: PreparedRequest | null): string {
  if (!request) return "";
  return JSON.stringify(request, null, 2);
}

export function buildCurlCommand(request: PreparedRequest | null): string {
  if (!request) return "";
  const parts = ["curl", "-X", request.method, quoteShell(request.url)];
  for (const [name, value] of Object.entries(request.headers)) {
    parts.push("-H", quoteShell(`${name}: ${value}`));
  }
  if (request.body) parts.push("--data", quoteShell(request.body));
  return parts.join(" ");
}

function quoteShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
