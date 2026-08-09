import { describe, expect, it } from "vitest";
import { parameterExampleValue, requestBodyExample, requiredSchemaFields, schemaExample } from "./schemaExamples.js";

describe("schema examples", () => {
  it("prefers explicit examples and generates deterministic nested values", () => {
    expect(parameterExampleValue({ name: "limit", in: "query", required: false, example: 25, schema: { type: "integer" } })).toBe("25");
    expect(requestBodyExample({
      mediaType: "application/json",
      schema: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", example: "Momo" },
          active: { type: "boolean" },
          tags: { type: "array", items: { type: "string", enum: ["friendly"] } },
          internalId: { type: "string", readOnly: true }
        }
      }
    })).toBe(JSON.stringify({ name: "Momo", active: false, tags: ["friendly"] }, null, 2));
    expect(requiredSchemaFields({ required: ["name", 12, "active"] })).toEqual(["name", "active"]);
  });

  it("terminates circular schemas and bounded recursive branches", () => {
    const schema: Record<string, unknown> = { type: "object", properties: {} };
    (schema.properties as Record<string, unknown>).self = schema;
    (schema.properties as Record<string, unknown>).name = { type: "string" };

    expect(schemaExample(schema)).toEqual({ name: "string" });
  });

  it("merges allOf object examples", () => {
    expect(schemaExample({ allOf: [
      { type: "object", properties: { id: { type: "integer", minimum: 1 } } },
      { type: "object", properties: { email: { type: "string", format: "email" } } }
    ] })).toEqual({ id: 1, email: "user@example.com" });
  });

  it("supports OpenAPI 3.1 and JSON Schema 2020-12 authoring keywords", () => {
    expect(schemaExample({ type: ["string", "null"], const: "fixed" })).toBe("fixed");
    expect(schemaExample({ type: "array", prefixItems: [{ type: "integer" }, { type: ["string", "null"], examples: ["sample"] }] })).toEqual([0, "sample"]);
    expect(requiredSchemaFields({ allOf: [{ required: ["id"] }, { required: ["name", "id"] }] })).toEqual(["id", "name"]);
  });
});
