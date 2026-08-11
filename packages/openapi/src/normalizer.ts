import type {
  HttpMethod,
  NormalizedApiDefinition,
  NormalizedOperation,
  NormalizedParameter,
  NormalizedRequestBodyMediaType,
  NormalizedSecurityScheme,
  OpenApiDiagnostic,
  OpenApiNormalizer
} from "@tapir/core";
import { isRecord } from "./guards.js";
import { resolveRef, resolveRefsInValue } from "./refs.js";

export class BasicOpenApiNormalizer implements OpenApiNormalizer {
  normalize(document: unknown): NormalizedApiDefinition {
    if (!isRecord(document)) throw new Error("OpenAPI document must be a JSON object.");
    if (document.swagger === "2.0") {
      throw new Error("Swagger 2.0 is not supported. Convert the document to OpenAPI 3.0 or 3.1 before adding it to Tapir.");
    }
    if (typeof document.openapi !== "string" || !/^3\.(0|1)(?:\.|$)/.test(document.openapi)) {
      throw new Error(`Unsupported OpenAPI version${typeof document.openapi === "string" ? ` ${document.openapi}` : ""}. Tapir supports OpenAPI 3.0 and 3.1.`);
    }
    if (!isRecord(document.paths)) {
      throw new Error("OpenAPI document is missing paths.");
    }

    const diagnostics: OpenApiDiagnostic[] = [];
    diagnoseUnresolvedReferences(document, diagnostics);
    if (document.openapi.startsWith("3.1") && typeof document.jsonSchemaDialect === "string" && document.jsonSchemaDialect !== "https://json-schema.org/draft/2020-12/schema") {
      diagnostics.push({ severity: "warning", code: "schema-dialect", message: `OpenAPI declares JSON Schema dialect ${document.jsonSchemaDialect}; Tapir applies OpenAPI 3.1 and JSON Schema 2020-12-compatible authoring behavior.`, path: "#/jsonSchemaDialect" });
    }
    if (isRecord(document.webhooks) && Object.keys(document.webhooks).length > 0) {
      diagnostics.push({ severity: "warning", code: "unsupported-webhooks", message: "OpenAPI webhooks are not shown because Tapir currently authors client-initiated HTTP requests only.", path: "#/webhooks" });
    }
    const info = isRecord(document.info) ? document.info : {};
    const securitySchemes = normalizeSecuritySchemes(document, diagnostics);
    const rootSecurity = normalizeSecurityRequirements(document.security);
    const operations: NormalizedOperation[] = [];

    for (const [path, pathItem] of Object.entries(document.paths)) {
      const resolvedPathItem = resolveRef(document, pathItem);
      if (!isRecord(resolvedPathItem)) continue;
      const pathParameters = normalizeParameters(document, resolvedPathItem.parameters, diagnostics, `#/paths/${escapePointer(path)}/parameters`);
      if (isRecord(resolvedPathItem.trace)) diagnostics.push({ severity: "warning", code: "unsupported-http-method", message: `TRACE ${path} is not shown because Tapir does not currently execute TRACE requests.`, path: `#/paths/${escapePointer(path)}/trace` });

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
          securitySchemes,
          diagnostics
        }));
      }
    }

    stabilizeOperationIds(operations, diagnostics);

    return {
      name: typeof info.title === "string" ? info.title : "Discovered API",
      version: typeof info.version === "string" ? info.version : "unknown",
      servers: normalizeServers(document.servers),
      operations,
      diagnostics
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
  diagnostics: OpenApiDiagnostic[];
}): NormalizedOperation {
  const operationParameters = mergeParameters(
    input.pathParameters,
    normalizeParameters(input.document, input.operation.parameters, input.diagnostics, `#/paths/${escapePointer(input.path)}/${input.method}/parameters`)
  );
  const sourceOperationId = typeof input.operation.operationId === "string" && input.operation.operationId.trim()
    ? input.operation.operationId.trim()
    : undefined;
  const operationId = sourceOperationId
    ? sourceOperationId
    : `${input.method.toUpperCase()} ${input.path}`;
  const requestBodyMediaTypes = normalizeRequestBodyMediaTypes(input.document, input.operation.requestBody, input.diagnostics, `#/paths/${escapePointer(input.path)}/${input.method}/requestBody`);
  const securityRequirements = Array.isArray(input.operation.security)
    ? normalizeSecurityRequirements(input.operation.security)
    : input.rootSecurity;
  for (const schemeKey of new Set(securityRequirements.flatMap((requirement) => Object.keys(requirement)))) {
    if (!input.securitySchemes.some((scheme) => scheme.key === schemeKey)) input.diagnostics.push({ severity: "warning", code: "missing-security-scheme", message: `Operation references security scheme ${schemeKey}, but that scheme is not defined.`, path: `#/paths/${escapePointer(input.path)}/${input.method}/security` });
  }
  if (isRecord(input.operation.callbacks) && Object.keys(input.operation.callbacks).length > 0) {
    input.diagnostics.push({ severity: "warning", code: "unsupported-callbacks", message: "OpenAPI callback operations are not shown in Tapir.", path: `#/paths/${escapePointer(input.path)}/${input.method}/callbacks` });
  }

  return {
    operationId,
    sourceOperationId,
    method: input.method.toUpperCase() as HttpMethod,
    path: input.path,
    summary: typeof input.operation.summary === "string" ? input.operation.summary : undefined,
    description: typeof input.operation.description === "string" ? input.operation.description : undefined,
    tags: Array.isArray(input.operation.tags) ? input.operation.tags.filter((tag): tag is string => typeof tag === "string") : [],
    parameters: operationParameters,
    requestBodySchema: requestBodyMediaTypes[0]?.schema,
    requestBodyMediaTypes,
    responses: normalizeResponses(input.document, input.operation.responses),
    securityRequirements,
    securitySchemes: input.securitySchemes.filter((scheme) => securityRequirements.some((requirement) => scheme.key in requirement))
  };
}

function normalizeResponses(root: unknown, value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(Object.entries(value).map(([status, response]) => [status, resolveRef(root, response)]));
}

function normalizeParameters(root: unknown, value: unknown, diagnostics: OpenApiDiagnostic[], path: string): NormalizedParameter[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((parameterValue, index) => {
    const parameter = resolveRef(root, parameterValue);
    if (!isRecord(parameter) || typeof parameter.name !== "string" || typeof parameter.in !== "string") {
      diagnostics.push({ severity: "warning", code: "invalid-parameter", message: "A parameter was ignored because it has no valid name or location.", path: `${path}/${index}` });
      return [];
    }
    if (!["path", "query", "header", "cookie"].includes(parameter.in)) {
      diagnostics.push({ severity: "warning", code: "unsupported-parameter-location", message: `Parameter ${parameter.name} uses unsupported location ${parameter.in}.`, path: `${path}/${index}` });
      return [];
    }
    const schema = resolveRefsInValue(root, parameter.schema);
    let style = normalizeParameterStyle(parameter.style, parameter.in, diagnostics, `${path}/${index}`);
    const types = schemaTypes(schema);
    if (["spaceDelimited", "pipeDelimited"].includes(style ?? "") && !types.includes("array")) {
      diagnostics.push({ severity: "warning", code: "unsupported-parameter-shape", message: `Parameter ${parameter.name} uses ${style} with a non-array schema; Tapir will use form serialization.`, path: `${path}/${index}/style` });
      style = "form";
    }
    if (style === "deepObject" && !types.includes("object")) {
      diagnostics.push({ severity: "warning", code: "unsupported-parameter-shape", message: `Parameter ${parameter.name} uses deepObject without an object schema; Tapir will use form serialization.`, path: `${path}/${index}/style` });
      style = "form";
    }
    if (parameter.allowReserved === true && parameter.in !== "query") {
      diagnostics.push({ severity: "warning", code: "ignored-allow-reserved", message: `allowReserved is only defined for query parameters; it is ignored for ${parameter.name}.`, path: `${path}/${index}/allowReserved` });
    }
    return [{
      name: parameter.name,
      in: parameter.in as NormalizedParameter["in"],
      required: parameter.required === true || parameter.in === "path",
      description: typeof parameter.description === "string" ? parameter.description : undefined,
      style,
      explode: typeof parameter.explode === "boolean" ? parameter.explode : style === "form",
      allowReserved: parameter.allowReserved === true && parameter.in === "query",
      example: parameter.example ?? (isRecord(schema) ? schema.example ?? schema.default : undefined),
      schema
    }];
  });
}

function mergeParameters(pathParameters: NormalizedParameter[], operationParameters: NormalizedParameter[]): NormalizedParameter[] {
  const operationKeys = new Set(operationParameters.map(parameterKey));
  return [
    ...pathParameters.filter((parameter) => !operationKeys.has(parameterKey(parameter))),
    ...operationParameters
  ];
}

function parameterKey(parameter: NormalizedParameter): string {
  return `${parameter.in}:${parameter.name}`;
}

function normalizeParameterStyle(value: unknown, location: string, diagnostics: OpenApiDiagnostic[], path: string): NormalizedParameter["style"] {
  const defaults: Record<string, NormalizedParameter["style"]> = { query: "form", cookie: "form", path: "simple", header: "simple" };
  const supportedByLocation: Record<string, NormalizedParameter["style"][]> = {
    query: ["form", "spaceDelimited", "pipeDelimited", "deepObject"],
    cookie: ["form"],
    path: ["matrix", "label", "simple"],
    header: ["simple"]
  };
  if (typeof value === "string" && supportedByLocation[location]?.includes(value as NormalizedParameter["style"])) return value as NormalizedParameter["style"];
  if (typeof value === "string") diagnostics.push({ severity: "warning", code: "unsupported-parameter-style", message: `Parameter style ${value} is not supported for ${location} parameters; Tapir will use ${defaults[location]}.`, path: `${path}/style` });
  return defaults[location];
}

function normalizeServers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((server) => {
    if (!isRecord(server) || typeof server.url !== "string") return [];
    return [server.url];
  });
}

function normalizeRequestBodyMediaTypes(root: unknown, value: unknown, diagnostics: OpenApiDiagnostic[], path: string): NormalizedRequestBodyMediaType[] {
  const requestBody = resolveRef(root, value);
  if (!isRecord(requestBody) || !isRecord(requestBody.content)) return [];
  return Object.entries(requestBody.content).flatMap(([mediaType, content]) => {
    const resolvedContent = resolveRef(root, content);
    if (!isRecord(resolvedContent)) return [];
    const schema = resolveRefsInValue(root, resolvedContent.schema);
    const normalizedMediaType = mediaType.toLowerCase().split(";")[0]?.trim();
    if (["application/x-www-form-urlencoded", "multipart/form-data"].includes(normalizedMediaType ?? "") && !schemaTypes(schema).includes("object")) {
      diagnostics.push({ severity: "warning", code: "unsupported-form-schema", message: `${mediaType} uses a non-object schema. Tapir's structured form editor requires an object schema.`, path: `${path}/content/${escapePointer(mediaType)}/schema` });
    }
    if (normalizedMediaType === "multipart/form-data" && schemaContainsBinary(schema)) {
      diagnostics.push({ severity: "warning", code: "unsupported-binary-upload", message: `Multipart media type ${mediaType} contains binary fields. Tapir currently sends text values and cannot attach files.`, path: `${path}/content/${escapePointer(mediaType)}` });
    }
    if (isRecord(resolvedContent.encoding) && Object.keys(resolvedContent.encoding).length > 0) diagnostics.push({ severity: "warning", code: "unsupported-media-encoding", message: `Per-property encoding rules for ${mediaType} are not currently applied by Tapir.`, path: `${path}/content/${escapePointer(mediaType)}/encoding` });
    return [{
      mediaType,
      required: requestBody.required === true,
      example: mediaTypeExample(resolvedContent),
      schema
    }];
  });
}

function mediaTypeExample(content: Record<string, unknown>): unknown {
  if (content.example !== undefined) return content.example;
  if (!isRecord(content.examples)) return undefined;
  for (const candidate of Object.values(content.examples)) {
    const resolved = isRecord(candidate) && "value" in candidate ? candidate.value : undefined;
    if (resolved !== undefined) return resolved;
  }
  return undefined;
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

function normalizeSecuritySchemes(root: unknown, diagnostics: OpenApiDiagnostic[]): NormalizedSecurityScheme[] {
  if (!isRecord(root) || !isRecord(root.components) || !isRecord(root.components.securitySchemes)) return [];
  return Object.entries(root.components.securitySchemes).flatMap(([key, schemeValue]) => {
    const scheme = resolveRef(root, schemeValue);
    if (!isRecord(scheme) || typeof scheme.type !== "string") return [];
    const supported = (scheme.type === "apiKey" && ["query", "header", "cookie"].includes(String(scheme.in)))
      || (scheme.type === "http" && ["bearer", "basic"].includes(String(scheme.scheme).toLowerCase()));
    if (!supported) diagnostics.push({ severity: "warning", code: "unsupported-security-scheme", message: `Security scheme ${key} (${scheme.type}${typeof scheme.scheme === "string" ? ` ${scheme.scheme}` : ""}) is not currently configurable in Tapir.`, path: `#/components/securitySchemes/${escapePointer(key)}` });
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

function stabilizeOperationIds(operations: NormalizedOperation[], diagnostics: OpenApiDiagnostic[]): void {
  const counts = new Map<string, number>();
  for (const operation of operations) counts.set(operation.operationId, (counts.get(operation.operationId) ?? 0) + 1);
  const used = new Set(operations.filter((operation) => (counts.get(operation.operationId) ?? 0) === 1).map((operation) => operation.operationId));
  for (const operation of operations) {
    if ((counts.get(operation.operationId) ?? 0) < 2) continue;
    const duplicate = operation.operationId;
    let identity = `${duplicate}#${operation.method}:${operation.path}`;
    while (used.has(identity)) identity = `tapir:${identity}`;
    operation.operationId = identity;
    used.add(identity);
    diagnostics.push({ severity: "warning", code: "duplicate-operation-id", message: `Duplicate operationId ${duplicate} was assigned stable identity ${operation.operationId}.`, path: `#/paths/${escapePointer(operation.path)}/${operation.method.toLowerCase()}/operationId` });
  }
}

function schemaContainsBinary(value: unknown, depth = 0): boolean {
  if (depth > 12 || !isRecord(value)) return false;
  if (value.format === "binary" || value.contentEncoding === "base64") return true;
  return Object.values(value).some((item) => Array.isArray(item)
    ? item.some((nested) => schemaContainsBinary(nested, depth + 1))
    : schemaContainsBinary(item, depth + 1));
}

function schemaTypes(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return Array.isArray(value.type)
    ? value.type.filter((item): item is string => typeof item === "string")
    : typeof value.type === "string" ? [value.type] : [];
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function diagnoseUnresolvedReferences(root: unknown, diagnostics: OpenApiDiagnostic[]): void {
  const seen = new Set<object>();
  const visit = (value: unknown, path: string): void => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}/${index}`));
      return;
    }
    if (!isRecord(value)) return;
    if (typeof value.$ref === "string" && value["x-tapir-circular-ref"] !== true) {
      const missing = value.$ref.startsWith("#/") ? resolveLocalPointer(root, value.$ref) === undefined : true;
      if (missing) diagnostics.push({
        severity: "warning",
        code: "unresolved-reference",
        message: `Reference ${value.$ref} could not be resolved. Refresh the document and verify the referenced path.`,
        path: `${path}/$ref`
      });
    }
    for (const [key, item] of Object.entries(value)) visit(item, `${path}/${escapePointer(key)}`);
  };
  visit(root, "#");
}

function resolveLocalPointer(root: unknown, reference: string): unknown {
  return reference.slice(2).split("/")
    .map((part) => decodeURIComponent(part).replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>((current, segment) => isRecord(current) ? current[segment] : Array.isArray(current) ? current[Number(segment)] : undefined, root);
}
