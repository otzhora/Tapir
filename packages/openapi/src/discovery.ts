import type { DiscoveryResult, OpenApiDiscoveryService } from "@tapir/core";
import { isOpenApiDocument } from "./guards.js";

const discoveryPaths = [
  "/openapi.json",
  "/swagger.json",
  "/swagger/v1/swagger.json",
  "/docs/openapi.json",
  "/.well-known/openapi.json"
];

const discoveryTimeoutMs = 15_000;
const maxOpenApiDocumentBytes = 5 * 1024 * 1024;

export class FetchOpenApiDiscoveryService implements OpenApiDiscoveryService {
  async discover(baseUrl: string): Promise<DiscoveryResult> {
    const normalizedBase = normalizeBaseUrl(baseUrl);
    const errors: string[] = [];

    for (const path of discoveryPaths) {
      const specUrl = new URL(path, normalizedBase).toString();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), discoveryTimeoutMs);
      try {
        const response = await fetch(specUrl, {
          headers: { accept: "application/json" },
          signal: controller.signal
        });
        if (!response.ok) {
          errors.push(`${path}: HTTP ${response.status}`);
          continue;
        }

        const document = JSON.parse(await readLimitedText(response, maxOpenApiDocumentBytes, "OpenAPI document")) as unknown;
        if (!isOpenApiDocument(document)) {
          errors.push(`${path}: not an OpenAPI document`);
          continue;
        }

        return { specUrl, discoveryMethod: path, document };
      } catch (error) {
        errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error(`Could not discover an OpenAPI JSON document. Tried ${errors.join("; ")}`);
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const withProtocol = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
  const url = new URL(withProtocol);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
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
