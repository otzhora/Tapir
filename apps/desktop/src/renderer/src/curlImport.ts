import type { HttpMethod, RequestDraftHeader } from "@tapir/core";

export interface ParsedCurlRequest {
  method: HttpMethod;
  url: string;
  headers: RequestDraftHeader[];
  body: string;
  contentType: string;
  browserHeaderCount: number;
  sensitiveHeaderCount: number;
}

export interface CurlImportOptions {
  includeBrowserHeaders: boolean;
  includeSensitiveHeaders: boolean;
}

export interface CurlImportDraft {
  serverId: string | null;
  createServerBaseUrl?: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: RequestDraftHeader[];
  body: string;
  contentType: string;
}

const supportedMethods = new Set<HttpMethod>(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const browserHeaderNames = new Set([
  "accept-encoding",
  "accept-language",
  "cache-control",
  "connection",
  "content-length",
  "dnt",
  "host",
  "origin",
  "pragma",
  "priority",
  "referer",
  "sec-gpc",
  "upgrade-insecure-requests",
  "user-agent"
]);

export function parseCurlCommand(command: string, options: CurlImportOptions): ParsedCurlRequest {
  const tokens = tokenizeCurl(command.trim());
  if (!tokens.length || !["curl", "curl.exe"].includes(tokens[0]!.toLowerCase())) {
    throw new Error("Paste a cURL command beginning with curl.");
  }

  let explicitMethod = "";
  let url = "";
  let useGet = false;
  let useHead = false;
  const rawHeaders: Array<{ name: string; value: string }> = [];
  const dataParts: string[] = [];

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const [option, inlineValue] = splitLongOption(token);
    if (["-X", "--request"].includes(option)) {
      explicitMethod = requireOptionValue(tokens, index, option, inlineValue);
      if (inlineValue === undefined) index += 1;
      continue;
    }
    if (["-H", "--header"].includes(option)) {
      const value = requireOptionValue(tokens, index, option, inlineValue);
      if (inlineValue === undefined) index += 1;
      const separator = value.indexOf(":");
      if (separator <= 0) throw new Error(`Invalid header: ${value}`);
      rawHeaders.push({ name: value.slice(0, separator).trim(), value: value.slice(separator + 1).trimStart() });
      continue;
    }
    if (["-b", "--cookie"].includes(option)) {
      const value = requireOptionValue(tokens, index, option, inlineValue);
      if (inlineValue === undefined) index += 1;
      if (value.startsWith("@")) throw new Error("Cookie files are not supported. Paste inline cookies instead.");
      rawHeaders.push({ name: "Cookie", value });
      continue;
    }
    if (["-d", "--data", "--data-raw", "--data-binary", "--data-ascii", "--data-urlencode"].includes(option)) {
      const value = requireOptionValue(tokens, index, option, inlineValue);
      if (inlineValue === undefined) index += 1;
      if (option === "--data-binary" && value.startsWith("@")) throw new Error("File-backed request bodies are not supported yet.");
      dataParts.push(value);
      continue;
    }
    if (["-F", "--form", "--form-string"].includes(option)) {
      throw new Error("Multipart form arguments are not supported yet. Use a cURL command with an inline body.");
    }
    if (option === "--url") {
      url = requireOptionValue(tokens, index, option, inlineValue);
      if (inlineValue === undefined) index += 1;
      continue;
    }
    if (["-G", "--get"].includes(option)) {
      useGet = true;
      continue;
    }
    if (["-I", "--head"].includes(option)) {
      useHead = true;
      continue;
    }
    if (option.startsWith("-")) {
      if (optionRequiresValue(option)) index += 1;
      continue;
    }
    if (!url) url = token;
  }

  if (!url) throw new Error("The cURL command does not contain a request URL.");
  try {
    url = new URL(url).toString();
  } catch {
    throw new Error("The imported request URL must be absolute.");
  }

  const requestedMethod = (explicitMethod || (useHead ? "HEAD" : useGet ? "GET" : dataParts.length ? "POST" : "GET")).toUpperCase();
  if (!supportedMethods.has(requestedMethod as HttpMethod)) throw new Error(`Tapir does not support the ${requestedMethod} method.`);

  const browserHeaderCount = rawHeaders.filter((header) => isBrowserHeader(header.name)).length;
  const sensitiveHeaderCount = rawHeaders.filter((header) => isSensitiveHeader(header.name)).length;
  const headers = rawHeaders
    .filter((header) => options.includeBrowserHeaders || !isBrowserHeader(header.name))
    .filter((header) => options.includeSensitiveHeaders || !isSensitiveHeader(header.name))
    .map((header, index) => ({ id: `curl-header-${index}-${header.name.toLowerCase()}`, ...header, enabled: true }));
  const contentType = rawHeaders.find((header) => header.name.toLowerCase() === "content-type")?.value ?? "application/json";

  return {
    method: requestedMethod as HttpMethod,
    url,
    headers,
    body: dataParts.join("&"),
    contentType,
    browserHeaderCount,
    sensitiveHeaderCount
  };
}

export function redirectCurlUrl(sourceUrl: string, target: string): string {
  const source = new URL(sourceUrl);
  const destination = new URL(normalizeTarget(target));
  source.protocol = destination.protocol;
  source.username = destination.username;
  source.password = destination.password;
  source.host = destination.host;
  return source.toString();
}

export function isSensitiveHeader(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized === "authorization"
    || normalized === "cookie"
    || normalized === "proxy-authorization"
    || normalized === "x-api-key"
    || normalized === "api-key"
    || normalized.includes("token")
    || normalized.includes("secret")
    || normalized.includes("csrf")
    || normalized.includes("session");
}

export function isBrowserHeader(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized.startsWith("sec-ch-") || normalized.startsWith("sec-fetch-") || browserHeaderNames.has(normalized);
}

function normalizeTarget(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Enter a destination URL.");
  return /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function splitLongOption(token: string): [string, string | undefined] {
  if (!token.startsWith("--")) return [token, undefined];
  const separator = token.indexOf("=");
  return separator === -1 ? [token, undefined] : [token.slice(0, separator), token.slice(separator + 1)];
}

function requireOptionValue(tokens: string[], index: number, option: string, inlineValue: string | undefined): string {
  const value = inlineValue ?? tokens[index + 1];
  if (value === undefined) throw new Error(`${option} requires a value.`);
  return value;
}

function optionRequiresValue(option: string): boolean {
  return ["-A", "--user-agent", "-e", "--referer", "-u", "--user", "-x", "--proxy", "--connect-to", "--resolve", "-o", "--output"].includes(option);
}

function tokenizeCurl(command: string): string[] {
  const normalized = command
    .replace(/\\\r?\n[ \t]*/g, "")
    .replace(/\^\r?\n[ \t]*/g, "")
    .replace(/`\r?\n[ \t]*/g, "");
  const tokens: string[] = [];
  let current = "";
  let quote: "single" | "double" | null = null;
  let tokenStarted = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]!;
    if (!quote && /\s/.test(character)) {
      if (tokenStarted) {
        tokens.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }
    if (character === "'" && quote !== "double") {
      quote = quote === "single" ? null : "single";
      tokenStarted = true;
      continue;
    }
    if (character === "\"" && quote !== "single") {
      quote = quote === "double" ? null : "double";
      tokenStarted = true;
      continue;
    }
    if (quote !== "single" && character === "\\") {
      const next = normalized[index + 1];
      if (next !== undefined) {
        current += next;
        index += 1;
        tokenStarted = true;
        continue;
      }
    }
    if (!quote && (character === "^" || character === "`") && normalized[index + 1] !== undefined) {
      current += normalized[index + 1];
      index += 1;
      tokenStarted = true;
      continue;
    }
    current += character;
    tokenStarted = true;
  }
  if (quote) throw new Error("The cURL command contains an unterminated quote.");
  if (tokenStarted) tokens.push(current);
  return tokens;
}
