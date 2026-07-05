import { describe, expect, it } from "vitest";
import { prepareOperationRequest } from "./requestPreparation.js";
import type { NormalizedOperation } from "./index.js";

const operation: NormalizedOperation = {
  operationId: "updatePet",
  method: "POST",
  path: "/pets/{petId}",
  tags: ["Pets"],
  parameters: [
    { name: "petId", in: "path", required: true },
    { name: "include", in: "query", required: false },
    { name: "x-trace-id", in: "header", required: false }
  ],
  requestBodyMediaTypes: [{ mediaType: "application/json", schema: { type: "object" } }],
  securityRequirements: [{ apiKey: [] }],
  securitySchemes: [{ key: "apiKey", type: "apiKey", name: "x-api-key", in: "header" }]
};

describe("prepareOperationRequest", () => {
  it("builds a redacted request preview with repeated query values", () => {
    const prepared = prepareOperationRequest("https://api.example.test", {
      operation,
      values: { petId: "pet 1", include: "owner, visits", "x-trace-id": "trace-1" },
      body: "{\"name\":\"Momo\"}",
      contentType: "application/json",
      apiKeyHeaderName: "x-api-key",
      apiKeyValue: "secret"
    });

    expect(prepared.validationIssues).toEqual([]);
    expect(prepared.request).toMatchObject({
      method: "POST",
      url: "https://api.example.test/pets/pet%201?include=owner&include=visits",
      headers: {
        "content-type": "application/json",
        "x-api-key": "secret",
        "x-trace-id": "trace-1"
      },
      body: "{\"name\":\"Momo\"}"
    });
    expect(prepared.redactedRequest.headers["x-api-key"]).toBe("********");
  });

  it("resolves Postman-style server variables outside request bodies", () => {
    const prepared = prepareOperationRequest("https://{{host}}", {
      operation,
      values: { petId: "{{petId}}", include: "owner, {{include}}", "x-trace-id": "{{traceId}}" },
      body: "{\"name\":\"{{petName}}\"}",
      contentType: "application/json",
      apiKeyHeaderName: "{{apiKeyHeader}}",
      apiKeyValue: "{{apiKey}}",
      variables: [
        serverVariable("host", "api.example.test"),
        serverVariable("petId", "pet 1"),
        serverVariable("include", "visits"),
        serverVariable("traceId", "trace-1"),
        serverVariable("apiKeyHeader", "x-api-key"),
        serverVariable("apiKey", "secret")
      ]
    });

    expect(prepared.validationIssues).toEqual([]);
    expect(prepared.request).toMatchObject({
      url: "https://api.example.test/pets/pet%201?include=owner&include=visits",
      headers: {
        "content-type": "application/json",
        "x-api-key": "secret",
        "x-trace-id": "trace-1"
      },
      body: "{\"name\":\"{{petName}}\"}"
    });
    expect(prepared.redactedRequest.headers["x-api-key"]).toBe("********");
  });

  it("reports unresolved variables", () => {
    const prepared = prepareOperationRequest("https://api.example.test", {
      operation,
      values: { petId: "{{missingPetId}}" }
    });

    expect(prepared.validationIssues).toContainEqual({
      field: "petId",
      message: "missingPetId is not set for this server."
    });
  });

  it("reports missing required path values and invalid JSON bodies", () => {
    const prepared = prepareOperationRequest("https://api.example.test", {
      operation,
      values: {},
      body: "{",
      contentType: "application/json"
    });

    expect(prepared.validationIssues).toEqual([
      { field: "petId", message: "petId is required." },
      { field: "body", message: "Request body must be valid JSON for the selected content type." }
    ]);
  });
});

function serverVariable(key: string, value: string) {
  return {
    id: key,
    workspaceId: "workspace-1",
    serverInstanceId: "server-1",
    key,
    value,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z"
  };
}
