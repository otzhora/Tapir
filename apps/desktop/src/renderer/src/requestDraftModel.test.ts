import { describe, expect, it } from "vitest";
import type { NormalizedOperation, RequestDraft } from "@tapir/core";
import { customDraftRequest, customRequestPayload, openApiDraftRequest, operationRequestPayload, parseDraftHeaders, parseDraftParameters } from "./requestDraftModel";

describe("request draft model", () => {
  it("builds deterministic OpenAPI and custom draft creation payloads", () => {
    const openApi = openApiDraftRequest("server-1", operation, 42);
    expect(openApi).toMatchObject({
      serverId: "server-1",
      operationId: "listPets",
      name: "List pets",
      body: JSON.stringify({ name: "Momo" }, null, 2),
      sortOrder: 42
    });
    expect(openApi.parameters).toContainEqual(expect.objectContaining({ id: "query:limit", value: "25" }));
    expect(customDraftRequest(null, "https://standalone.example.test", 43)).toMatchObject({
      serverId: null,
      sourceType: "custom",
      method: "GET",
      url: "https://standalone.example.test",
      sortOrder: 43
    });
  });

  it("constructs typed operation IPC payloads from enabled draft fields", () => {
    const payload = operationRequestPayload(draft(), "server-1", operation);
    expect(payload).toMatchObject({
      serverId: "server-1",
      requestDraftId: "draft-1",
      values: { limit: "50" },
      operation: { operationId: "listPets" }
    });
    expect(payload.operation.parameters).toHaveLength(1);
    expect(payload.operation.parameters[0]).toMatchObject({ name: "limit", style: "form", schema: { type: "integer", default: 25 } });
  });

  it("constructs custom IPC payloads and parses malformed saved arrays safely", () => {
    const value = draft({ sourceType: "custom", operationId: null, serverInstanceId: null, url: "https://standalone.example.test" });
    const payload = customRequestPayload(value);
    expect(payload).toMatchObject({
      serverId: null,
      url: "https://standalone.example.test",
      headers: [expect.objectContaining({ name: "x-trace" })]
    });
    expect(payload.parameters).toContainEqual(expect.objectContaining({ name: "limit" }));
    expect(parseDraftParameters({ ...value, parametersJson: "{" })).toEqual([]);
    expect(parseDraftHeaders({ ...value, headersJson: "{}" })).toEqual([]);
  });
});

const operation: NormalizedOperation = {
  operationId: "listPets",
  method: "POST",
  path: "/pets",
  summary: "List pets",
  tags: ["Pets"],
  parameters: [
    { name: "limit", in: "query", required: false, style: "form", schema: { type: "integer", default: 25 } },
    { name: "disabled", in: "query", required: false, schema: { type: "string" } }
  ],
  requestBodyMediaTypes: [{ mediaType: "application/json", schema: { type: "object", properties: { name: { type: "string", example: "Momo" } } } }],
  securityRequirements: [],
  securitySchemes: []
};

function draft(changes: Partial<RequestDraft> = {}): RequestDraft {
  return {
    id: "draft-1",
    workspaceId: "workspace-1",
    serverInstanceId: "server-1",
    sourceType: "openapi",
    operationId: "listPets",
    deprecatedAt: null,
    deprecationReason: null,
    name: "List pets",
    isNameManual: false,
    method: "POST",
    path: "/pets",
    url: "",
    parametersJson: JSON.stringify([
      { id: "query:limit", name: "limit", in: "query", value: "50", enabled: true, source: "openapi" },
      { id: "query:disabled", name: "disabled", in: "query", value: "no", enabled: false, source: "openapi" }
    ]),
    headersJson: JSON.stringify([{ id: "header-1", name: "x-trace", value: "trace-1", enabled: true }]),
    body: "{}",
    contentType: "application/json",
    sortOrder: 1,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...changes
  };
}
