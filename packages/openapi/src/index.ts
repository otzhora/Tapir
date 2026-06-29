import type { HttpMethod, NormalizedApiDefinition, NormalizedOperation, NormalizedParameter } from "@tapir/core";

export interface DiscoveryResult {
  specUrl: string;
  discoveryMethod: string;
  document: unknown;
}

export interface OpenApiDiscoveryService {
  discover(baseUrl: string): Promise<DiscoveryResult>;
}

export interface OpenApiNormalizer {
  normalize(document: unknown): NormalizedApiDefinition;
}

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

export class BasicOpenApiNormalizer implements OpenApiNormalizer {
  normalize(document: unknown): NormalizedApiDefinition {
    if (!isRecord(document) || !isRecord(document.paths)) {
      throw new Error("OpenAPI document is missing paths.");
    }

    const info = isRecord(document.info) ? document.info : {};
    const operations: NormalizedOperation[] = [];

    for (const [path, pathItem] of Object.entries(document.paths)) {
      if (!isRecord(pathItem)) continue;
      const pathParameters = normalizeParameters(pathItem.parameters);

      for (const method of ["get", "post", "put", "patch", "delete", "head", "options"] as const) {
        const operation = pathItem[method];
        if (!isRecord(operation)) continue;

        const operationParameters = [
          ...pathParameters,
          ...normalizeParameters(operation.parameters)
        ];
        const operationId = typeof operation.operationId === "string"
          ? operation.operationId
          : `${method.toUpperCase()} ${path}`;

        operations.push({
          operationId,
          method: method.toUpperCase() as HttpMethod,
          path,
          summary: typeof operation.summary === "string" ? operation.summary : undefined,
          description: typeof operation.description === "string" ? operation.description : undefined,
          tags: Array.isArray(operation.tags) ? operation.tags.filter((tag): tag is string => typeof tag === "string") : [],
          parameters: operationParameters,
          requestBodySchema: isRecord(operation.requestBody) ? operation.requestBody : undefined,
          responses: isRecord(operation.responses) ? operation.responses : undefined,
          securityRequirements: Array.isArray(operation.security) ? operation.security : undefined
        });
      }
    }

    return {
      name: typeof info.title === "string" ? info.title : "Discovered API",
      version: typeof info.version === "string" ? info.version : "unknown",
      operations
    };
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

function normalizeParameters(value: unknown): NormalizedParameter[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((parameter) => {
    if (!isRecord(parameter) || typeof parameter.name !== "string" || typeof parameter.in !== "string") {
      return [];
    }
    if (!["path", "query", "header", "cookie"].includes(parameter.in)) {
      return [];
    }
    return [{
      name: parameter.name,
      in: parameter.in as NormalizedParameter["in"],
      required: parameter.required === true || parameter.in === "path",
      description: typeof parameter.description === "string" ? parameter.description : undefined,
      schema: parameter.schema
    }];
  });
}

function isOpenApiDocument(value: unknown): boolean {
  return isRecord(value) && (typeof value.openapi === "string" || typeof value.swagger === "string") && isRecord(value.paths);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
