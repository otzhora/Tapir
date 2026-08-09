import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { PreparedOperationRequest, RequestDraft } from "@tapir/core";
import type { TapirBridge } from "../../../preload";
import { useRequestExecution } from "./useRequestExecution";

describe("useRequestExecution", () => {
  it("ignores stale preview completions for the same draft", async () => {
    const first = deferred<PreparedOperationRequest>();
    const second = deferred<PreparedOperationRequest>();
    const previewCustomRequest = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const activeDraft = ref<RequestDraft | null>(draft);
    const execution = useRequestExecution({
      activeDraft: computed(() => activeDraft.value),
      selectedOperation: computed(() => null),
      selectedServer: computed(() => null),
      collapsedPanels: { operations: false, response: true },
      getBridge: () => ({ previewCustomRequest } as unknown as TapirBridge),
      reloadHistory: vi.fn(),
      setErrorMessage: vi.fn()
    });

    const older = execution.refreshPreview({ ...draft, url: "https://example.test/older" });
    const newer = execution.refreshPreview({ ...draft, url: "https://example.test/newer" });
    second.resolve(preview("https://example.test/newer"));
    await newer;
    first.resolve(preview("https://example.test/older"));
    await older;

    expect(execution.requestPreview.value?.request.url).toBe("https://example.test/newer");
    expect(execution.isPreviewing.value).toBe(false);
  });
});

function preview(url: string): PreparedOperationRequest {
  return {
    request: { method: "GET", url, headers: {} },
    redactedRequest: { method: "GET", url, headers: {} },
    validationIssues: []
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

const draft: RequestDraft = {
  id: "draft-1",
  workspaceId: "workspace-1",
  serverInstanceId: null,
  sourceType: "custom",
  operationId: null,
  deprecatedAt: null,
  deprecationReason: null,
  name: "Custom request",
  isNameManual: false,
  method: "GET",
  path: "",
  url: "https://example.test",
  parametersJson: "[]",
  headersJson: "[]",
  body: "",
  contentType: "application/json",
  sortOrder: 1,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z"
};
