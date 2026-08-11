import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BasicOpenApiNormalizer } from "./index.js";

describe("BasicOpenApiNormalizer", () => {
  it("terminates cached local-reference cycles", () => {
    const normalized = new BasicOpenApiNormalizer().normalize({
      openapi: "3.1.0",
      info: { title: "Cyclic API", version: "1" },
      paths: {
        "/nodes": {
          post: {
            requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Node" } } } },
            responses: { "200": { description: "OK" } }
          }
        }
      },
      components: {
        schemas: {
          Node: { type: "object", properties: { child: { $ref: "#/components/schemas/Node" } } }
        }
      }
    });

    expect(JSON.stringify(normalized.operations[0]?.requestBodySchema)).toContain("#/components/schemas/Node");
  });

  it("keeps nested response schemas referenced instead of expanding the full component graph", () => {
    const normalized = new BasicOpenApiNormalizer().normalize({
      openapi: "3.1.0",
      info: { title: "Response API", version: "1" },
      paths: {
        "/nodes": {
          get: {
            responses: {
              "200": {
                description: "OK",
                content: { "application/json": { schema: { $ref: "#/components/schemas/Node" } } }
              }
            }
          }
        }
      },
      components: {
        schemas: { Node: { type: "object", properties: { child: { $ref: "#/components/schemas/Node" } } } }
      }
    });

    expect(normalized.operations[0]?.responses).toEqual({
      "200": {
        description: "OK",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Node" } } }
      }
    });
  });

  it("normalizes the OpenAPI 3.0 and 3.1 compatibility fixtures and rejects the Swagger fixture", () => {
    const normalizer = new BasicOpenApiNormalizer();
    const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../test-fixtures/${name}`, import.meta.url), "utf8")) as unknown;

    expect(normalizer.normalize(fixture("openapi-3.0.json"))).toMatchObject({ name: "OpenAPI 3.0 fixture", operations: [{ operationId: "getPet" }] });
    expect(normalizer.normalize(fixture("openapi-3.1.json"))).toMatchObject({ name: "OpenAPI 3.1 fixture", operations: [{ operationId: "createPet" }] });
    expect(() => normalizer.normalize(fixture("swagger-2.0.json"))).toThrow("Swagger 2.0 is not supported");
  });

  it("extracts callable operations with path-level and operation-level parameters", () => {
    const normalizer = new BasicOpenApiNormalizer();

    const normalized = normalizer.normalize({
      openapi: "3.0.3",
      info: { title: "Billing API", version: "2026.1" },
      paths: {
        "/tenants/{tenantId}/invoices": {
          parameters: [
            { name: "tenantId", in: "path", schema: { type: "string" } }
          ],
          get: {
            operationId: "listInvoices",
            summary: "List invoices",
            tags: ["Invoices"],
            parameters: [
              { name: "cursor", in: "query", required: false, schema: { type: "string" } },
              { name: "x-trace-id", in: "header", required: false, schema: { type: "string" } }
            ],
            responses: { "200": { description: "OK" } }
          }
        }
      }
    });

    expect(normalized).toMatchObject({
      name: "Billing API",
      version: "2026.1",
      operations: [
        {
          operationId: "listInvoices",
          method: "GET",
          path: "/tenants/{tenantId}/invoices",
          summary: "List invoices",
          tags: ["Invoices"],
          requestBodyMediaTypes: [],
          securityRequirements: [],
          securitySchemes: []
        }
      ]
    });
    expect(normalized.operations[0]?.parameters).toEqual([
      { name: "tenantId", in: "path", required: true, style: "simple", explode: false, allowReserved: false, schema: { type: "string" } },
      { name: "cursor", in: "query", required: false, style: "form", explode: true, allowReserved: false, schema: { type: "string" } },
      { name: "x-trace-id", in: "header", required: false, style: "simple", explode: false, allowReserved: false, schema: { type: "string" } }
    ]);
  });

  it("lets operation-level parameters override matching path-level parameters", () => {
    const normalized = new BasicOpenApiNormalizer().normalize({
      openapi: "3.0.3",
      info: { title: "Search API", version: "1" },
      paths: {
        "/search": {
          parameters: [{ name: "tags", in: "query", description: "path default", schema: { type: "string" } }],
          get: {
            parameters: [{ name: "tags", in: "query", description: "operation override", explode: false, schema: { type: "array", items: { type: "string" } } }],
            responses: { "200": { description: "OK" } }
          }
        }
      }
    });

    expect(normalized.operations[0]?.parameters).toEqual([
      expect.objectContaining({ name: "tags", in: "query", description: "operation override", explode: false })
    ]);
  });

  it("rejects documents without OpenAPI paths", () => {
    const normalizer = new BasicOpenApiNormalizer();

    expect(() => normalizer.normalize({ openapi: "3.0.3", info: {} })).toThrow("missing paths");
  });

  it("resolves local refs and extracts body media types, servers, and security schemes", () => {
    const normalizer = new BasicOpenApiNormalizer();

    const normalized = normalizer.normalize({
      openapi: "3.0.3",
      info: { title: "Pets API", version: "1.0.0" },
      servers: [{ url: "https://api.example.test/v1" }],
      security: [{ ApiKeyAuth: [] }],
      components: {
        securitySchemes: {
          ApiKeyAuth: { type: "apiKey", name: "x-api-key", in: "header" }
        },
        parameters: {
          PetId: { name: "petId", in: "path", required: true, schema: { type: "string" } }
        },
        schemas: {
          PetInput: { type: "object", properties: { name: { type: "string" } } }
        }
      },
      paths: {
        "/pets/{petId}": {
          post: {
            operationId: "updatePet",
            parameters: [{ $ref: "#/components/parameters/PetId" }],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  example: { name: "Momo" },
                  schema: { $ref: "#/components/schemas/PetInput" }
                }
              }
            },
            responses: { "200": { description: "OK" } }
          }
        }
      }
    });

    expect(normalized.servers).toEqual(["https://api.example.test/v1"]);
    expect(normalized.operations[0]).toMatchObject({
      operationId: "updatePet",
      requestBodyMediaTypes: [
        {
          mediaType: "application/json",
          required: true,
          example: { name: "Momo" },
          schema: { type: "object", properties: { name: { type: "string" } } }
        }
      ],
      securityRequirements: [{ ApiKeyAuth: [] }],
      securitySchemes: [{ key: "ApiKeyAuth", type: "apiKey", name: "x-api-key", in: "header" }]
    });
  });

  it("resolves repeated sibling refs without treating them as cycles", () => {
    const normalizer = new BasicOpenApiNormalizer();

    const normalized = normalizer.normalize({
      openapi: "3.0.3",
      info: { title: "Pets API", version: "1.0.0" },
      components: {
        schemas: {
          Pet: { type: "object", properties: { id: { type: "string" } } }
        }
      },
      paths: {
        "/pets": {
          post: {
            operationId: "createPet",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      first: { $ref: "#/components/schemas/Pet" },
                      second: { $ref: "#/components/schemas/Pet" }
                    }
                  }
                }
              }
            },
            responses: { "200": { description: "OK" } }
          }
        }
      }
    });

    expect(normalized.operations[0]?.requestBodySchema).toMatchObject({
      properties: {
        first: { type: "object", properties: { id: { type: "string" } } },
        second: { type: "object", properties: { id: { type: "string" } } }
      }
    });
  });

  it("does not attach unrelated root security schemes to explicitly public operations", () => {
    const normalized = new BasicOpenApiNormalizer().normalize({
      openapi: "3.0.3",
      info: { title: "Mixed API", version: "1" },
      security: [{ BearerAuth: [] }],
      components: { securitySchemes: { BearerAuth: { type: "http", scheme: "bearer" } } },
      paths: {
        "/public": { get: { security: [], responses: { "200": { description: "OK" } } } }
      }
    });

    expect(normalized.operations[0]).toMatchObject({ securityRequirements: [], securitySchemes: [] });
  });

  it("assigns stable identities to duplicate operation IDs", () => {
    const document = {
      openapi: "3.0.3",
      info: { title: "Duplicates", version: "1" },
      paths: {
        "/pets": { get: { operationId: "find", responses: { "200": { description: "OK" } } } },
        "/owners": { get: { operationId: "find", responses: { "200": { description: "OK" } } } }
      }
    };

    const first = new BasicOpenApiNormalizer().normalize(document);
    const reordered = new BasicOpenApiNormalizer().normalize({ ...document, paths: { "/owners": document.paths["/owners"], "/pets": document.paths["/pets"] } });
    expect(first.operations.map((operation) => operation.operationId).sort()).toEqual([
      "find#GET:/owners",
      "find#GET:/pets"
    ]);
    expect(reordered.operations.map((operation) => operation.operationId).sort()).toEqual(first.operations.map((operation) => operation.operationId).sort());
    expect(first.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "duplicate-operation-id", path: "#/paths/~1pets/get/operationId" })
    ]));
  });

  it("handles OpenAPI 3.1 schema features and reports partially unsupported constructs", () => {
    const normalized = new BasicOpenApiNormalizer().normalize({
      openapi: "3.1.1",
      jsonSchemaDialect: "https://example.test/custom-dialect",
      info: { title: "Modern API", version: "1" },
      webhooks: { changed: {} },
      components: {
        schemas: { Identifier: { type: ["string", "null"], const: "fixed", description: "base", properties: { broken: { $ref: "#/components/schemas/Missing" } } } },
        securitySchemes: { OAuth: { type: "oauth2", flows: {} } }
      },
      paths: {
        "/reports": {
          get: {
            parameters: [
              { name: "filter", in: "query", style: "matrix", schema: { type: "object" } },
              { name: "id", in: "query", schema: { $ref: "#/components/schemas/Identifier", description: "sibling" } }
            ],
            security: [{ OAuth: [], Unknown: [] }],
            callbacks: { completed: {} },
            responses: { "200": { description: "OK" } }
          },
          post: {
            requestBody: { content: { "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string", format: "binary" } } }, encoding: { file: { contentType: "image/png" } } } } },
            responses: { "200": { description: "OK" } }
          },
          trace: { responses: { "200": { description: "OK" } } }
        }
      }
    });

    expect(normalized.operations[0]?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "filter", style: "form" }),
      expect.objectContaining({ name: "id", schema: expect.objectContaining({ type: ["string", "null"], const: "fixed", description: "sibling" }) })
    ]));
    expect(normalized.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      "schema-dialect",
      "unsupported-webhooks",
      "unsupported-security-scheme",
      "missing-security-scheme",
      "unsupported-parameter-style",
      "unsupported-binary-upload",
      "unsupported-media-encoding",
      "unsupported-callbacks",
      "unsupported-http-method",
      "unresolved-reference"
    ]));
  });

  it("rejects Swagger 2.0 and unknown OpenAPI versions with actionable messages", () => {
    const normalizer = new BasicOpenApiNormalizer();
    expect(() => normalizer.normalize({ swagger: "2.0", paths: {} })).toThrow("Convert the document to OpenAPI 3.0 or 3.1");
    expect(() => normalizer.normalize({ openapi: "4.0.0", paths: {} })).toThrow("Tapir supports OpenAPI 3.0 and 3.1");
  });
});
