import type { NormalizedParameter, NormalizedRequestBodyMediaType } from "./index.js";

const maxExampleDepth = 8;

export function parameterExampleValue(parameter: NormalizedParameter): string {
  const value = parameter.example ?? schemaExample(parameter.schema);
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(stringValue).join(", ");
  return stringValue(value);
}

export function requestBodyExample(mediaType: NormalizedRequestBodyMediaType | undefined): string {
  if (!mediaType) return "";
  const value = mediaType.example ?? schemaExample(mediaType.schema);
  if (value === undefined) return "";
  if (isJsonLikeMediaType(mediaType.mediaType) || isStructuredFormMediaType(mediaType.mediaType)) {
    return JSON.stringify(value, null, 2);
  }
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function schemaExample(schema: unknown, depth = 0, seen = new Set<object>()): unknown {
  if (!isRecord(schema) || depth >= maxExampleDepth) return undefined;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (seen.has(schema)) return undefined;
  seen.add(schema);
  try {
    if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) {
      const variants = Array.isArray(schema.oneOf) ? schema.oneOf : schema.anyOf as unknown[];
      return schemaExample(variants[0], depth + 1, seen);
    }
    if (Array.isArray(schema.allOf)) {
      const parts = schema.allOf.map((part) => schemaExample(part, depth + 1, seen)).filter(isRecord);
      return parts.length > 0 ? Object.assign({}, ...parts) : undefined;
    }
    if (schema.type === "object" || isRecord(schema.properties)) {
      if (!isRecord(schema.properties)) return {};
      const result: Record<string, unknown> = {};
      for (const [key, property] of Object.entries(schema.properties)) {
        if (isRecord(property) && property.readOnly === true) continue;
        const value = schemaExample(property, depth + 1, seen);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    if (schema.type === "array") {
      const item = schemaExample(schema.items, depth + 1, seen);
      return item === undefined ? [] : [item];
    }
    if (schema.type === "boolean") return false;
    if (schema.type === "integer" || schema.type === "number") return schema.minimum ?? 0;
    if (schema.type === "string") return stringSchemaExample(schema);
  } finally {
    seen.delete(schema);
  }
  return undefined;
}

export function requiredSchemaFields(schema: unknown): string[] {
  if (!isRecord(schema) || !Array.isArray(schema.required)) return [];
  return schema.required.filter((value): value is string => typeof value === "string");
}

export function isJsonLikeMediaType(value: string): boolean {
  const mediaType = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

export function isStructuredFormMediaType(value: string): boolean {
  const mediaType = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/x-www-form-urlencoded" || mediaType === "multipart/form-data";
}

function stringSchemaExample(schema: Record<string, unknown>): string {
  if (schema.format === "date") return "2026-01-01";
  if (schema.format === "date-time") return "2026-01-01T00:00:00.000Z";
  if (schema.format === "email") return "user@example.com";
  if (schema.format === "uuid") return "00000000-0000-4000-8000-000000000000";
  if (schema.format === "uri" || schema.format === "url") return "https://example.com";
  return "string";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
