import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallHistoryEntry, HistoryRepository, RequestDraft, RequestDraftRepository } from "@tapir/core";

const safeStorageMock = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`, "utf8")),
  decryptString: vi.fn((value: Buffer) => value.toString("utf8").replace(/^encrypted:/, ""))
}));

vi.mock("electron", () => ({ safeStorage: safeStorageMock }));

import { SafeStorageHistoryRepository, SafeStorageRequestDraftRepository } from "./safeStorageDataRepositories";

describe("safeStorage data repositories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("encrypts sensitive draft fields at rest and decrypts repository results", async () => {
    const inner = new MemoryDraftRepository();
    const repository = new SafeStorageRequestDraftRepository(inner);
    const created = await repository.create(draft);

    expect(created).toMatchObject(draft);
    expect(JSON.stringify(inner.stored)).not.toContain("Bearer secret");
    expect(inner.stored?.headersJson).toMatch(/^safeStorage:v1:/);
    expect((await repository.listForWorkspace("workspace-1"))[0]).toMatchObject(draft);
  });

  it("encrypts history request snapshots while preserving query metadata", async () => {
    const inner = new MemoryHistoryRepository();
    const repository = new SafeStorageHistoryRepository(inner);
    const created = await repository.create(history);

    expect(created.requestSnapshotJson).toContain("Bearer secret");
    expect(inner.stored?.requestSnapshotJson).toMatch(/^safeStorage:v1:/);
    expect(JSON.stringify(inner.stored)).not.toContain("Bearer secret");
    expect((await repository.list({ workspaceId: "workspace-1" })).entries[0]?.requestSnapshotJson).toContain("Bearer secret");
  });
});

class MemoryDraftRepository implements RequestDraftRepository {
  stored: RequestDraft | null = null;
  async create(input: Omit<RequestDraft, "createdAt" | "updatedAt">): Promise<RequestDraft> {
    return this.stored = { ...input, createdAt: "now", updatedAt: "now" };
  }
  async update(input: RequestDraft): Promise<RequestDraft> { return this.stored = input; }
  async delete(): Promise<void> { this.stored = null; }
  async listForWorkspace(): Promise<RequestDraft[]> { return this.stored ? [this.stored] : []; }
}

class MemoryHistoryRepository implements HistoryRepository {
  stored: CallHistoryEntry | null = null;
  async create(input: Omit<CallHistoryEntry, "id" | "createdAt">): Promise<CallHistoryEntry> {
    return this.stored = { ...input, id: "history-1", createdAt: "now" };
  }
  async list() { return { entries: this.stored ? [this.stored] : [], nextCursor: null }; }
  async delete(): Promise<void> { this.stored = null; }
  async clear(): Promise<number> { const count = this.stored ? 1 : 0; this.stored = null; return count; }
}

const draft: Omit<RequestDraft, "createdAt" | "updatedAt"> = {
  id: "draft-1", workspaceId: "workspace-1", serverInstanceId: null, sourceType: "custom", operationId: null,
  deprecatedAt: null, deprecationReason: null, name: "Custom", isNameManual: false, method: "GET", path: "",
  url: "https://example.test?token=secret", parametersJson: "[]",
  headersJson: JSON.stringify([{ id: "header-1", name: "authorization", value: "Bearer secret", enabled: true }]),
  body: "{\"password\":\"secret\"}", contentType: "application/json", sortOrder: 1
};

const history: Omit<CallHistoryEntry, "id" | "createdAt"> = {
  workspaceId: "workspace-1", serverInstanceId: null, operationId: null, requestDraftId: "draft-1",
  requestSnapshotJson: JSON.stringify({ method: "GET", url: "https://example.test", headers: { authorization: "Bearer secret" } }),
  requestMethod: "GET", requestUrl: "https://example.test", draftName: "Custom", responseStatus: 200,
  responseHeadersJson: "{}", responseBody: "ok", durationMs: 1
};
