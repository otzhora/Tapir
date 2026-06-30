export function isOpenApiDocument(value: unknown): boolean {
  return isRecord(value) && (typeof value.openapi === "string" || typeof value.swagger === "string") && isRecord(value.paths);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
