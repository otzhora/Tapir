import type {
  CallHistoryEntry,
  HistoryFilter,
  HistoryPage,
  HistoryQuery,
  HistoryRepository,
  RequestDraft,
  RequestDraftRepository
} from "@tapir/core";
import { protectLocalValue, unprotectLocalValue } from "./safeStorageCodec";

export class SafeStorageRequestDraftRepository implements RequestDraftRepository {
  constructor(private inner: RequestDraftRepository) {}

  async create(input: Omit<RequestDraft, "createdAt" | "updatedAt">): Promise<RequestDraft> {
    return decryptDraft(await this.inner.create(encryptDraft(input)));
  }

  async update(input: RequestDraft): Promise<RequestDraft> {
    return decryptDraft(await this.inner.update(encryptDraft(input)));
  }

  async delete(id: string): Promise<void> {
    await this.inner.delete(id);
  }

  async listForWorkspace(workspaceId: string): Promise<RequestDraft[]> {
    return (await this.inner.listForWorkspace(workspaceId)).map(decryptDraft);
  }
}

export class SafeStorageHistoryRepository implements HistoryRepository {
  constructor(private inner: HistoryRepository) {}

  async create(input: Omit<CallHistoryEntry, "id" | "createdAt">): Promise<CallHistoryEntry> {
    return decryptHistory(await this.inner.create({
      ...input,
      requestSnapshotJson: protectLocalValue(input.requestSnapshotJson)
    }));
  }

  async list(input: HistoryQuery): Promise<HistoryPage> {
    const page = await this.inner.list(input);
    return { ...page, entries: page.entries.map(decryptHistory) };
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    await this.inner.delete(workspaceId, id);
  }

  async clear(input: HistoryFilter): Promise<number> {
    return this.inner.clear(input);
  }
}

function encryptDraft<Draft extends Omit<RequestDraft, "createdAt" | "updatedAt"> | RequestDraft>(draft: Draft): Draft {
  return {
    ...draft,
    url: protectLocalValue(draft.url),
    parametersJson: protectLocalValue(draft.parametersJson),
    headersJson: protectLocalValue(draft.headersJson),
    body: protectLocalValue(draft.body)
  };
}

function decryptDraft(draft: RequestDraft): RequestDraft {
  return {
    ...draft,
    url: unprotectLocalValue(draft.url),
    parametersJson: unprotectLocalValue(draft.parametersJson),
    headersJson: unprotectLocalValue(draft.headersJson),
    body: unprotectLocalValue(draft.body)
  };
}

function decryptHistory(entry: CallHistoryEntry): CallHistoryEntry {
  return { ...entry, requestSnapshotJson: unprotectLocalValue(entry.requestSnapshotJson) };
}
