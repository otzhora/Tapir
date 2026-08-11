import type { DiscoveryResult, OpenApiDiscoveryService } from "@tapir/core";
import { isOpenApiDocument } from "./guards.js";
import { resolveExternalReferences } from "./refs.js";

const discoveryPaths = [
  "/openapi.json",
  "/swagger.json",
  "/swagger/v1/swagger.json",
  "/docs/openapi.json",
  "/.well-known/openapi.json"
];

const discoveryTimeoutMs = 15_000;
const maxOpenApiDocumentBytes = 20 * 1024 * 1024;
const maxExternalReferenceBytes = 2 * 1024 * 1024;
const maxTotalExternalReferenceBytes = 10 * 1024 * 1024;

export class FetchOpenApiDiscoveryService implements OpenApiDiscoveryService {
  async discover(baseUrl: string): Promise<DiscoveryResult> {
    const normalizedBase = normalizeBaseUrl(baseUrl);
    const errors: string[] = [];

    for (const specUrl of discoveryCandidateUrls(normalizedBase)) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), discoveryTimeoutMs);
      try {
        const response = await fetch(specUrl, {
          headers: { accept: "application/json" },
          signal: controller.signal
        });
        if (!response.ok) {
          errors.push(`${specUrl}: HTTP ${response.status}`);
          continue;
        }

        const document = parseJsonDocument(await readLimitedText(response, maxOpenApiDocumentBytes, "OpenAPI document"));
        if (!isOpenApiDocument(document)) {
          errors.push(`${specUrl}: not an OpenAPI document`);
          continue;
        }

        return { specUrl, discoveryMethod: new URL(specUrl).pathname, document: await resolveDiscoveredReferences(document, specUrl) };
      } catch (error) {
        errors.push(`${specUrl}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error(`Could not discover an OpenAPI JSON document. Tried ${errors.join("; ")}`);
  }

  async fetch(specUrl: string): Promise<DiscoveryResult> {
    const normalizedUrl = normalizeHttpUrl(specUrl, "OpenAPI document URL");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), discoveryTimeoutMs);
    try {
      const response = await fetch(normalizedUrl, { headers: { accept: "application/json" }, signal: controller.signal });
      if (!response.ok) throw new Error(`OpenAPI document returned HTTP ${response.status}.`);
      const document = parseJsonDocument(await readLimitedText(response, maxOpenApiDocumentBytes, "OpenAPI document"));
      if (!isOpenApiDocument(document)) throw new Error("Configured URL did not return an OpenAPI document.");
      return { specUrl: normalizedUrl, discoveryMethod: "configured-url", document: await resolveDiscoveredReferences(document, normalizedUrl) };
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function resolveDiscoveredReferences(document: unknown, specUrl: string): Promise<unknown> {
  let totalBytes = 0;
  return resolveExternalReferences(document, specUrl, async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), discoveryTimeoutMs);
    try {
      const response = await fetch(url, { headers: { accept: "application/json" }, signal: controller.signal });
      if (!response.ok) throw new Error(`External OpenAPI reference returned HTTP ${response.status}: ${url}`);
      if (new URL(response.url || url).origin !== new URL(specUrl).origin) throw new Error(`External OpenAPI reference redirected outside ${new URL(specUrl).origin}.`);
      const text = await readLimitedText(response, maxExternalReferenceBytes, "External OpenAPI reference");
      totalBytes += new TextEncoder().encode(text).byteLength;
      if (totalBytes > maxTotalExternalReferenceBytes) throw new Error(`External OpenAPI references exceed Tapir's ${formatBytes(maxTotalExternalReferenceBytes)} combined limit.`);
      return JSON.parse(text) as unknown;
    } finally {
      clearTimeout(timeout);
    }
  });
}

function normalizeBaseUrl(baseUrl: string): string {
  const withProtocol = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
  const url = new URL(withProtocol);
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}

function discoveryCandidateUrls(baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const origin = new URL("/", base);
  return [...new Set(discoveryPaths.flatMap((path) => [
    new URL(path.slice(1), base).toString(),
    new URL(path, origin).toString()
  ]))];
}

function normalizeHttpUrl(value: string, label: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`${label} must use HTTP or HTTPS.`);
  return url.toString();
}

async function readLimitedText(response: Response, maxBytes: number, label: string): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error(`${label} exceeds Tapir's ${formatBytes(maxBytes)} limit.`);
  }
  const reader = response.body?.getReader();
  if (!reader) return response.text();

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error(`${label} exceeds Tapir's ${formatBytes(maxBytes)} limit.`);
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function formatBytes(value: number): string {
  return `${Math.round(value / 1024 / 1024)} MB`;
}

function parseJsonDocument(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("OpenAPI document is not valid JSON. Tapir currently supports JSON documents only; provide a JSON version of this specification.");
  }
}
