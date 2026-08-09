import { ref, type Ref } from "vue";
import type { RequestDraft, Workspace } from "@tapir/core";
import type { TapirBridge } from "../../../preload";
import { editableDraftFieldsMatch } from "../requestDraftModel";

interface UseRequestDraftPersistenceInput {
  workspace: Ref<Workspace | null>;
  getBridge: () => TapirBridge | null;
  onDraftPersisted: (draft: RequestDraft) => void;
  onDraftDeleted: (draftId: string) => void;
}

export function useRequestDraftPersistence(input: UseRequestDraftPersistenceInput) {
  const drafts = ref<RequestDraft[]>([]);
  const saveChains: Record<string, Promise<void> | undefined> = {};

  async function loadDrafts(): Promise<void> {
    const bridge = input.getBridge();
    if (!bridge || !input.workspace.value) return;
    drafts.value = await bridge.listRequestDrafts(input.workspace.value.id);
  }

  function addDraft(draft: RequestDraft): void {
    drafts.value = [...drafts.value, draft];
  }

  async function deleteDraft(draftId: string): Promise<void> {
    const bridge = input.getBridge();
    if (!bridge) return;
    await bridge.deleteRequestDraft(draftId);
    drafts.value = drafts.value.filter((draft) => draft.id !== draftId);
    input.onDraftDeleted(draftId);
  }

  async function saveDraft(next: RequestDraft): Promise<void> {
    const bridge = input.getBridge();
    if (!bridge) return;
    drafts.value = drafts.value.map((draft) => draft.id === next.id ? next : draft);

    const precedingSave = (saveChains[next.id] ?? Promise.resolve()).catch(() => undefined);
    const save = precedingSave.then(async () => {
      const latest = drafts.value.find((draft) => draft.id === next.id) ?? next;
      const saved = await bridge.updateRequestDraft({ draft: latest });
      const current = drafts.value.find((draft) => draft.id === saved.id);
      if (current && editableDraftFieldsMatch(current, latest)) {
        drafts.value = drafts.value.map((draft) => draft.id === saved.id ? saved : draft);
        input.onDraftPersisted(saved);
      } else {
        input.onDraftPersisted(current ?? latest);
      }
    });
    const tracked = save.finally(() => {
      if (saveChains[next.id] === tracked) delete saveChains[next.id];
    });
    saveChains[next.id] = tracked;
    await tracked;
  }

  return { addDraft, deleteDraft, drafts, loadDrafts, saveDraft };
}
