import type { PreparedRequest } from "@tapir/core";
import { isSensitiveHeader } from "./curlImport";

export type CurlShell = "posix" | "powershell" | "cmd";

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

export function redactSensitiveRequest(request: PreparedRequest | null): PreparedRequest | null {
  if (!request) return null;
  const headers = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name, isSensitiveHeader(name) ? redactedHeaderValue(name, value) : value]));
  let url = request.url;
  try {
    const parsed = new URL(request.url);
    for (const name of [...parsed.searchParams.keys()]) {
      if (/token|secret|password|session|signature|credential|api[-_]?key|authorization/i.test(name)) parsed.searchParams.set(name, "********");
    }
    url = parsed.toString();
  } catch {
    // Variable-based URLs may not be parseable until request preparation.
  }
  return { ...request, url, headers };
}

export function buildCurlCommand(request: PreparedRequest | null, shell: CurlShell = "posix"): string {
  if (!request) return "";
  const quote = shell === "cmd" ? quoteCmd : shell === "powershell" ? quotePowerShell : quotePosix;
  const executable = shell === "powershell" ? "curl.exe" : "curl";
  const parts = [executable, "-X", request.method, quote(request.url)];
  for (const [name, value] of Object.entries(request.headers)) {
    parts.push("-H", quote(`${name}: ${value}`));
  }
  if (request.body) parts.push("--data-raw", quote(request.body));
  return parts.join(" ");
}

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteCmd(value: string): string {
  return `"${value.replaceAll("%", "%%").replaceAll("\"", "\\\"")}"`;
}

function redactedHeaderValue(name: string, value: string): string {
  const normalized = name.toLowerCase();
  if (normalized === "authorization") {
    const scheme = value.match(/^\s*([^\s]+)\s+/)?.[1];
    return scheme ? `${scheme} ********` : "********";
  }
  if (normalized === "cookie") {
    return value.split(";").map((part) => `${part.split("=", 1)[0]?.trim() || "cookie"}=********`).join("; ");
  }
  return "********";
}
