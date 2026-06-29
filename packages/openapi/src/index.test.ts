import { describe, expect, it } from "vitest";
import { BasicOpenApiNormalizer } from "./index";

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
          tags: ["Invoices"]
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
});
