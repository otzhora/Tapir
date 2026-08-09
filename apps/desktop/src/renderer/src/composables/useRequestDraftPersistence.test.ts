import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { RequestDraft, Workspace } from "@tapir/core";
import type { TapirBridge } from "../../../preload";
import { useRequestDraftPersistence } from "./useRequestDraftPersistence";

describe("useRequestDraftPersistence", () => {
  it("serializes saves per draft and never lets a stale response replace newer edits", async () => {
    const first = deferred<RequestDraft>();
    const second = deferred<RequestDraft>();
    const updateRequestDraft = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const persisted: RequestDraft[] = [];
    const persistence = useRequestDraftPersistence({
      workspace: ref(workspace),
      getBridge: () => ({ updateRequestDraft } as unknown as TapirBridge),
      onDraftPersisted: (value) => persisted.push(value),
      onDraftDeleted: vi.fn()
    });
    persistence.addDraft(draft);

    const firstSave = persistence.saveDraft({ ...draft, name: "First edit" });
    await vi.waitFor(() => expect(updateRequestDraft).toHaveBeenCalledTimes(1));
    const secondSave = persistence.saveDraft({ ...draft, name: "Second edit" });
    expect(updateRequestDraft).toHaveBeenNthCalledWith(1, { draft: expect.objectContaining({ name: "First edit" }) });

    first.resolve({ ...draft, name: "First edit", updatedAt: "2026-07-01T00:00:01.000Z" });
    await vi.waitFor(() => expect(updateRequestDraft).toHaveBeenCalledTimes(2));
    expect(persistence.drafts.value[0]?.name).toBe("Second edit");
    expect(updateRequestDraft).toHaveBeenNthCalledWith(2, { draft: expect.objectContaining({ name: "Second edit" }) });

    second.resolve({ ...draft, name: "Second edit", updatedAt: "2026-07-01T00:00:02.000Z" });
    await Promise.all([firstSave, secondSave]);
    expect(persistence.drafts.value[0]).toMatchObject({ name: "Second edit", updatedAt: "2026-07-01T00:00:02.000Z" });
    expect(persisted.map((value) => value.name)).toEqual(["Second edit"]);
  });

  it("continues the save queue after a failed persistence attempt", async () => {
    const updateRequestDraft = vi.fn()
      .mockRejectedValueOnce(new Error("disk busy"))
      .mockResolvedValueOnce({ ...draft, name: "Recovered" });
    const persistence = useRequestDraftPersistence({
      workspace: ref(workspace),
      getBridge: () => ({ updateRequestDraft } as unknown as TapirBridge),
      onDraftPersisted: vi.fn(),
      onDraftDeleted: vi.fn()
    });
    persistence.addDraft(draft);

    await expect(persistence.saveDraft({ ...draft, name: "Failed" })).rejects.toThrow("disk busy");
    await expect(persistence.saveDraft({ ...draft, name: "Recovered" })).resolves.toBeUndefined();
    expect(updateRequestDraft).toHaveBeenCalledTimes(2);
    expect(persistence.drafts.value[0]?.name).toBe("Recovered");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

const workspace: Workspace = {
  id: "workspace-1",
  name: "Workspace",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z"
};

const draft: RequestDraft = {
  id: "draft-1",
  workspaceId: workspace.id,
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
