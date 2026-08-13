import { describe, expect, it } from "vitest";
import { parseTapirIpcRequest } from "./ipcValidation.js";

describe("IPC request validation", () => {
  it("accepts an optional explicit OpenAPI document URL when adding a server", () => {
    expect(parseTapirIpcRequest("tapir:addServer", {
      baseUrl: "https://api.example.test/v3",
      specUrl: "https://docs.example.test/openapi.json"
    })).toEqual({
      baseUrl: "https://api.example.test/v3",
      specUrl: "https://docs.example.test/openapi.json"
    });
  });

  it("accepts the narrow canonical operation request", () => {
    expect(parseTapirIpcRequest("tapir:callOperation", {
      serverId: "server-1",
      operationId: "listPets",
      values: { limit: "10" }
    })).toEqual({ serverId: "server-1", operationId: "listPets", values: { limit: "10" }, requestDraftId: undefined, body: undefined, contentType: undefined });
  });

  it("accepts a request-draft history filter", () => {
    expect(parseTapirIpcRequest("tapir:listHistory", {
      workspaceId: "workspace-1",
      requestDraftId: "draft-1",
      limit: 10
    })).toEqual({
      workspaceId: "workspace-1",
      requestDraftId: "draft-1",
      limit: 10,
      cursor: undefined,
      serverId: undefined,
      method: undefined,
      status: undefined,
      operationId: undefined,
      search: undefined,
      createdAfter: undefined,
      createdBefore: undefined
    });
  });

  it("rejects renderer-supplied operation objects and malformed nested values", () => {
    expect(() => parseTapirIpcRequest("tapir:callOperation", {
      serverId: "server-1",
      operation: { operationId: "forged", path: "https://attacker.test" },
      values: {}
    })).toThrow("operationId");
    expect(() => parseTapirIpcRequest("tapir:callCustomRequest", {
      serverId: null,
      method: "TRACE",
      url: "https://example.test",
      parameters: [],
      headers: []
    })).toThrow("method");
  });
});
