import { describe, expect, it } from "vitest";
import type { CallHistoryEntry } from "@tapir/core";
import { historyResponse } from "./useRequestHistoryRestoration";

describe("request history restoration", () => {
  it("reconstructs response state without leaking storage JSON concerns into the workspace", () => {
    expect(historyResponse(entry)).toEqual({
      request: { method: "GET", url: "https://example.test/pets", headers: {} },
      response: { status: 200, headers: { "content-type": "application/json" }, body: "[]", durationMs: 12 }
    });
    expect(historyResponse({ ...entry, responseStatus: 204, responseBody: "" })?.response).toMatchObject({ status: 204, body: "" });
    expect(historyResponse({ ...entry, responseStatus: null, responseBody: null })).toBeNull();
  });
});

const entry: CallHistoryEntry = {
  id: "history-1",
  workspaceId: "workspace-1",
  serverInstanceId: "server-1",
  operationId: "listPets",
  requestDraftId: "draft-1",
  requestSnapshotJson: JSON.stringify({ method: "GET", url: "https://example.test/pets", headers: {} }),
  requestMethod: "GET",
  requestUrl: "https://example.test/pets",
  draftName: "List pets",
  responseStatus: 200,
  responseHeadersJson: JSON.stringify({ "content-type": "application/json" }),
  responseBody: "[]",
  durationMs: 12,
  createdAt: "2026-07-01T00:00:00.000Z"
};
