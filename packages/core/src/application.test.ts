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
  it("rejects operation paths that attempt to replace the configured origin", () => {
    const prepared = prepareOperationRequest("https://api.example.test", {
      operation: { ...operation, path: "https://attacker.example/collect" },
      values: {}
    });
    expect(prepared.validationIssues).toContainEqual(expect.objectContaining({ field: "url", message: expect.stringContaining("cannot change") }));
    expect(prepared.request.url).toBe("https://api.example.test/");
  });
  it("builds a redacted request preview with repeated query values", () => {
    const prepared = prepareOperationRequest("https://api.example.test", {
      operation,
      values: { petId: "pet 1", include: "owner, visits", filter: "active,new", "x-trace-id": "trace-1", session: "abc 123" },
      body: "{\"name\":\"Momo\"}",
      contentType: "application/json",
      authentications: [{ type: "apiKey", name: "x-api-key", in: "header", value: "secret" }]
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

  it("serializes object parameters, deep objects, and reserved query values", () => {
    const prepared = prepareOperationRequest("https://api.example.test", {
      operation: {
        ...operation,
        method: "GET",
        path: "/reports/{coordinates}",
        parameters: [
          { name: "coordinates", in: "path", required: true, style: "matrix", explode: true, schema: { type: "object" } },
          { name: "filter", in: "query", required: false, style: "deepObject", explode: true, schema: { type: "object" } },
          { name: "target", in: "query", required: false, style: "form", allowReserved: true, schema: { type: "string" } },
          { name: "x-options", in: "header", required: false, style: "simple", explode: true, schema: { type: "object" } },
          { name: "preferences", in: "cookie", required: false, style: "form", explode: false, schema: { type: "object" } }
        ]
      },
      values: {
        coordinates: JSON.stringify({ latitude: 10, longitude: 20 }),
        filter: JSON.stringify({ status: "active", owner: { id: 7 }, tags: ["a", "b"] }),
        target: "https://other.example.test/a?view=full",
        "x-options": JSON.stringify({ trace: true, region: "eu" }),
        preferences: JSON.stringify({ theme: "dark", density: "compact" })
      }
    });

    expect(prepared.validationIssues).toEqual([]);
    expect(prepared.request.url).toBe("https://api.example.test/reports/;latitude=10;longitude=20?filter%5Bstatus%5D=active&filter%5Bowner%5D%5Bid%5D=7&filter%5Btags%5D%5B%5D=a&filter%5Btags%5D%5B%5D=b&target=https://other.example.test/a?view=full");
    expect(prepared.request.headers).toMatchObject({
      "x-options": "trace=true,region=eu",
      cookie: "preferences=theme,dark,density,compact"
    });
  });

  it("reports malformed object parameter input", () => {
    const prepared = prepareOperationRequest("https://api.example.test", {
      operation: { ...operation, method: "GET", path: "/pets", parameters: [{ name: "filter", in: "query", required: false, style: "deepObject", schema: { type: ["object", "null"] } }] },
      values: { filter: "not-json" }
    });

    expect(prepared.validationIssues).toContainEqual({ field: "filter", message: "filter must be a JSON object." });
  });

  it("injects and redacts query, cookie, bearer, and Basic credentials", () => {
    const common = { ...operation, method: "GET" as const, path: "/secured", parameters: [] };
    const apiKeys = prepareOperationRequest("https://api.example.test", {
      operation: common,
      values: {},
      authentications: [
        { type: "apiKey", name: "access_token", in: "query", value: "query-secret" },
        { type: "apiKey", name: "session", in: "cookie", value: "cookie-secret" }
      ]
    });
    expect(apiKeys.request).toMatchObject({
      url: "https://api.example.test/secured?access_token=query-secret",
      headers: { cookie: "session=cookie-secret" }
    });
    expect(apiKeys.redactedRequest).toMatchObject({
      url: "https://api.example.test/secured?access_token=********",
      headers: { cookie: "session=********" }
    });

    const bearer = prepareOperationRequest("https://api.example.test", {
      operation: common,
      values: {},
      authentications: [{ type: "bearer", value: "bearer-secret" }]
    });
    expect(bearer.request.headers.authorization).toBe("Bearer bearer-secret");
    expect(bearer.redactedRequest.headers.authorization).toBe("Bearer ********");

    const basic = prepareOperationRequest("https://api.example.test", {
      operation: common,
      values: {},
      authentications: [{ type: "basic", username: "momo", password: "basic-secret" }]
    });
    expect(basic.request.headers.authorization).toBe(`Basic ${Buffer.from("momo:basic-secret").toString("base64")}`);
    expect(basic.redactedRequest.headers.authorization).toBe("Basic ********");
  });

  it("resolves Postman-style server variables outside request bodies", () => {
    const prepared = prepareOperationRequest("https://{{host}}", {
      operation,
      values: { petId: "{{petId}}", include: "owner, {{include}}", "x-trace-id": "{{traceId}}" },
      body: "{\"name\":\"{{petName}}\"}",
      contentType: "application/json",
      authentications: [{ type: "apiKey", name: "{{apiKeyHeader}}", in: "header", value: "{{apiKey}}" }],
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

  it("validates required body fields and prepares URL-encoded and multipart forms", () => {
    const formOperation: NormalizedOperation = {
      ...operation,
      requestBodyMediaTypes: [{
        mediaType: "application/x-www-form-urlencoded",
        required: true,
        schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, tags: { type: "array" } } }
      }]
    };
    const encoded = prepareOperationRequest("https://api.example.test", {
      operation: formOperation,
      values: { petId: "1" },
      contentType: "application/x-www-form-urlencoded",
      body: JSON.stringify({ name: "Momo", tags: ["quiet", "friendly"] })
    });
    expect(encoded.request).toMatchObject({
      body: "name=Momo&tags=quiet&tags=friendly",
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });

    const multipart = prepareOperationRequest("https://api.example.test", {
      operation: { ...formOperation, requestBodyMediaTypes: [{ ...formOperation.requestBodyMediaTypes[0]!, mediaType: "multipart/form-data" }] },
      values: { petId: "1" },
      contentType: "multipart/form-data",
      body: JSON.stringify({ name: "Momo" })
    });
    expect(multipart.request).toMatchObject({ body: JSON.stringify({ name: "Momo" }), bodyEncoding: "multipart-json" });
    expect(multipart.request.headers).not.toHaveProperty("content-type");

    const missing = prepareOperationRequest("https://api.example.test", {
      operation: { ...formOperation, requestBodyMediaTypes: [{ ...formOperation.requestBodyMediaTypes[0]!, mediaType: "application/json" }] },
      values: { petId: "1" },
      body: "{}"
    });
    expect(missing.validationIssues).toContainEqual({ field: "body", message: "Missing required body field: name." });
  });
});

describe("prepareCustomRequest", () => {
  it("rejects non-HTTP custom request schemes", () => {
    const prepared = prepareCustomRequest({ method: "GET", url: "file:///C:/secret.txt", parameters: [], headers: [] });
    expect(prepared.validationIssues).toContainEqual(expect.objectContaining({ field: "url", message: expect.stringContaining("HTTP or HTTPS") }));
  });
  it("writes custom cookie parameters to the Cookie header", () => {
    const prepared = prepareCustomRequest({
      method: "GET",
      url: "https://api.example.test/pets",
      parameters: [{ id: "cookie:session", name: "session", in: "cookie", value: "abc 123", enabled: true, source: "custom" }],
      headers: []
    });

    expect(prepared.request.headers.cookie).toBe("session=abc%20123");
  });
  it("preserves commas in scalar custom query values", () => {
    const prepared = prepareCustomRequest({
      method: "GET",
      url: "https://api.example.test/pets",
      parameters: [{ id: "query:filter", name: "filter", in: "query", value: "active,new", enabled: true, source: "custom" }],
      headers: []
    });

    expect(prepared.request.url).toBe("https://api.example.test/pets?filter=active%2Cnew");
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
