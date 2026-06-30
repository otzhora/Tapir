import { describe, expect, it } from "vitest";
import { BasicOpenApiNormalizer } from "./index.js";

describe("BasicOpenApiNormalizer", () => {
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
      { name: "tenantId", in: "path", required: true, schema: { type: "string" } },
      { name: "cursor", in: "query", required: false, schema: { type: "string" } },
      { name: "x-trace-id", in: "header", required: false, schema: { type: "string" } }
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
              content: {
                "application/json": {
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
          schema: { type: "object", properties: { name: { type: "string" } } }
        }
      ],
      securityRequirements: [{ ApiKeyAuth: [] }],
      securitySchemes: [{ key: "ApiKeyAuth", type: "apiKey", name: "x-api-key", in: "header" }]
    });
  });
});
