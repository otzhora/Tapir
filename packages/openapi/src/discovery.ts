import type { DiscoveryResult, OpenApiDiscoveryService } from "@tapir/core";
import { isOpenApiDocument } from "./guards.js";

const discoveryPaths = [
  "/openapi.json",
  "/swagger.json",
  "/swagger/v1/swagger.json",
  "/docs/openapi.json",
  "/.well-known/openapi.json"
];

export class FetchOpenApiDiscoveryService implements OpenApiDiscoveryService {
  async discover(baseUrl: string): Promise<DiscoveryResult> {
    const normalizedBase = normalizeBaseUrl(baseUrl);
    const errors: string[] = [];

    for (const path of discoveryPaths) {
      const specUrl = new URL(path, normalizedBase).toString();
      try {
        const response = await fetch(specUrl, { headers: { accept: "application/json" } });
        if (!response.ok) {
          errors.push(`${path}: HTTP ${response.status}`);
          continue;
        }

        const document = await response.json();
        if (!isOpenApiDocument(document)) {
          errors.push(`${path}: not an OpenAPI document`);
          continue;
        }

        return { specUrl, discoveryMethod: path, document };
      } catch (error) {
        errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
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
