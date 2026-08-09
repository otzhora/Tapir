import { describe, expect, it } from "vitest";
import { prepareCustomRequest, prepareOperationRequest } from "./requestPreparation.js";
import type { NormalizedOperation } from "./index.js";

const operation: NormalizedOperation = {
  operationId: "updatePet",
  method: "POST",
  path: "/pets/{petId}",
  tags: ["Pets"],
  parameters: [
    { name: "petId", in: "path", required: true },
    { name: "include", in: "query", required: false, style: "form", explode: true, schema: { type: "array", items: { type: "string" } } },
    { name: "filter", in: "query", required: false, style: "form", explode: true, schema: { type: "string" } },
    { name: "x-trace-id", in: "header", required: false },
    { name: "session", in: "cookie", required: false }
  ],
  requestBodyMediaTypes: [{ mediaType: "application/json", schema: { type: "object" } }],
  securityRequirements: [{ apiKey: [] }],
  securitySchemes: [{ key: "apiKey", type: "apiKey", name: "x-api-key", in: "header" }]
};

describe("prepareOperationRequest", () => {
  it("builds a redacted request preview with repeated query values", () => {
    const prepared = prepareOperationRequest("https://api.example.test", {
      operation,
      values: { petId: "pet 1", include: "owner, visits", filter: "active,new", "x-trace-id": "trace-1", session: "abc 123" },
      body: "{\"name\":\"Momo\"}",
      contentType: "application/json",
      apiKeyHeaderName: "x-api-key",
      apiKeyValue: "secret"
    });

    expect(prepared.validationIssues).toEqual([]);
    expect(prepared.request).toMatchObject({
      method: "POST",
      url: "https://api.example.test/pets/pet%201?include=owner&include=visits&filter=active%2Cnew",
      headers: {
        "content-type": "application/json",
        cookie: "session=abc%20123",
        "x-api-key": "secret",
        "x-trace-id": "trace-1"
      },
      body: "{\"name\":\"Momo\"}"
    });
    expect(prepared.redactedRequest.headers["x-api-key"]).toBe("********");
  });

  it("supports OpenAPI array styles without splitting scalar commas", () => {
    const prepared = prepareOperationRequest("https://api.example.test", {
      operation: {
        ...operation,
        method: "GET",
        path: "/pets/{petId}/{coordinates}",
        parameters: [
          { name: "petId", in: "path", required: true },
          { name: "coordinates", in: "path", required: true, style: "label", explode: true, schema: { type: "array" } },
          { name: "status", in: "query", required: false, style: "pipeDelimited", schema: { type: "array" } },
          { name: "flags", in: "cookie", required: false, style: "form", explode: false, schema: { type: "array" } }
        ]
      },
      values: { petId: "a,b", coordinates: "10, 20", status: "new, active", flags: "one, two" }
    });

    expect(prepared.request).toMatchObject({
      url: "https://api.example.test/pets/a%2Cb/.10.20?status=new%7Cactive",
      headers: { cookie: "flags=one,two" }
    });
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

describe("prepareCustomRequest", () => {
  it("writes custom cookie parameters to the Cookie header", () => {
    const prepared = prepareCustomRequest({
      method: "GET",
      url: "https://api.example.test/pets",
      parameters: [{ id: "cookie:session", name: "session", in: "cookie", value: "abc 123", enabled: true, source: "custom" }],
      headers: []
    });

    expect(prepared.request.headers.cookie).toBe("session=abc%20123");
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
