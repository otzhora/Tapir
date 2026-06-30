import type {
  HttpMethod,
  NormalizedApiDefinition,
  NormalizedOperation,
  NormalizedParameter,
  NormalizedRequestBodyMediaType,
  NormalizedSecurityScheme,
  OpenApiNormalizer
} from "@tapir/core";
import { isRecord } from "./guards.js";
import { resolveRef, resolveRefsInValue } from "./refs.js";

export class BasicOpenApiNormalizer implements OpenApiNormalizer {
  normalize(document: unknown): NormalizedApiDefinition {
    if (!isRecord(document) || !isRecord(document.paths)) {
      throw new Error("OpenAPI document is missing paths.");
    }

    const info = isRecord(document.info) ? document.info : {};
    const securitySchemes = normalizeSecuritySchemes(document);
    const rootSecurity = normalizeSecurityRequirements(document.security);
    const operations: NormalizedOperation[] = [];

    for (const [path, pathItem] of Object.entries(document.paths)) {
      const resolvedPathItem = resolveRef(document, pathItem);
      if (!isRecord(resolvedPathItem)) continue;
      const pathParameters = normalizeParameters(document, resolvedPathItem.parameters);

      for (const method of ["get", "post", "put", "patch", "delete", "head", "options"] as const) {
        const operation = resolveRef(document, resolvedPathItem[method]);
        if (!isRecord(operation)) continue;

        operations.push(normalizeOperation({
          document,
          method,
          path,
          operation,
          pathParameters,
          rootSecurity,
          securitySchemes
        }));
      }
    }

    return {
      name: typeof info.title === "string" ? info.title : "Discovered API",
      version: typeof info.version === "string" ? info.version : "unknown",
      servers: normalizeServers(document.servers),
      operations
    };
  }
}

function normalizeOperation(input: {
  document: unknown;
  method: "get" | "post" | "put" | "patch" | "delete" | "head" | "options";
  path: string;
  operation: Record<string, unknown>;
  pathParameters: NormalizedParameter[];
  rootSecurity: Array<Record<string, string[]>>;
  securitySchemes: NormalizedSecurityScheme[];
}): NormalizedOperation {
  const operationParameters = [
    ...input.pathParameters,
    ...normalizeParameters(input.document, input.operation.parameters)
  ];
  const operationId = typeof input.operation.operationId === "string"
    ? input.operation.operationId
    : `${input.method.toUpperCase()} ${input.path}`;
  const requestBodyMediaTypes = normalizeRequestBodyMediaTypes(input.document, input.operation.requestBody);
  const securityRequirements = Array.isArray(input.operation.security)
    ? normalizeSecurityRequirements(input.operation.security)
    : input.rootSecurity;

  return {
    operationId,
    method: input.method.toUpperCase() as HttpMethod,
    path: input.path,
    summary: typeof input.operation.summary === "string" ? input.operation.summary : undefined,
    description: typeof input.operation.description === "string" ? input.operation.description : undefined,
    tags: Array.isArray(input.operation.tags) ? input.operation.tags.filter((tag): tag is string => typeof tag === "string") : [],
    parameters: operationParameters,
    requestBodySchema: requestBodyMediaTypes[0]?.schema,
    requestBodyMediaTypes,
    responses: isRecord(input.operation.responses) ? resolveRefsInValue(input.document, input.operation.responses) : undefined,
    securityRequirements,
    securitySchemes: securityRequirements.length > 0
      ? input.securitySchemes.filter((scheme) => securityRequirements.some((requirement) => scheme.key in requirement))
      : input.securitySchemes
  };
}

function normalizeParameters(root: unknown, value: unknown): NormalizedParameter[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((parameterValue) => {
    const parameter = resolveRef(root, parameterValue);
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
      schema: resolveRefsInValue(root, parameter.schema)
    }];
  });
}

function normalizeServers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((server) => {
    if (!isRecord(server) || typeof server.url !== "string") return [];
    return [server.url];
  });
}

function normalizeRequestBodyMediaTypes(root: unknown, value: unknown): NormalizedRequestBodyMediaType[] {
  const requestBody = resolveRef(root, value);
  if (!isRecord(requestBody) || !isRecord(requestBody.content)) return [];
  return Object.entries(requestBody.content).flatMap(([mediaType, content]) => {
    const resolvedContent = resolveRef(root, content);
    if (!isRecord(resolvedContent)) return [];
    return [{ mediaType, schema: resolveRefsInValue(root, resolvedContent.schema) }];
  });
}

function normalizeSecurityRequirements(value: unknown): Array<Record<string, string[]>> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((requirement) => {
    if (!isRecord(requirement)) return [];
    const normalized: Record<string, string[]> = {};
    for (const [key, scopes] of Object.entries(requirement)) {
      normalized[key] = Array.isArray(scopes) ? scopes.filter((scope): scope is string => typeof scope === "string") : [];
    }
    return [normalized];
  });
}

function normalizeSecuritySchemes(root: unknown): NormalizedSecurityScheme[] {
  if (!isRecord(root) || !isRecord(root.components) || !isRecord(root.components.securitySchemes)) return [];
  return Object.entries(root.components.securitySchemes).flatMap(([key, schemeValue]) => {
    const scheme = resolveRef(root, schemeValue);
    if (!isRecord(scheme) || typeof scheme.type !== "string") return [];
    return [{
      key,
      type: scheme.type,
      name: typeof scheme.name === "string" ? scheme.name : undefined,
      in: scheme.in === "query" || scheme.in === "header" || scheme.in === "cookie" ? scheme.in : undefined,
      scheme: typeof scheme.scheme === "string" ? scheme.scheme : undefined,
      bearerFormat: typeof scheme.bearerFormat === "string" ? scheme.bearerFormat : undefined,
      description: typeof scheme.description === "string" ? scheme.description : undefined
    }];
  });
}
