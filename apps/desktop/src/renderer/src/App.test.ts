// @vitest-environment happy-dom
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CallHistoryEntry,
  CallOperationRequest,
  CreateRequestDraftRequest,
  NormalizedOperation,
  PreviewCustomRequestRequest,
  PreviewOperationRequest,
  PreparedOperationRequest,
  RequestDraft,
  ServerWithDefinition,
  Workspace
} from "@tapir/core";
import App from "./App.vue";
import type { TapirBridge } from "../../preload";

describe("desktop renderer app", () => {
  let bridge: MockTapirBridge;

  beforeEach(() => {
    bridge = createMockBridge();
    Object.defineProperty(window, "tapir", {
      configurable: true,
      value: bridge
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Partial<{ tapir: TapirBridge }>).tapir;
    document.body.innerHTML = "";
  });

  it("loads a server, previews an operation, sends it, and restores it from history", async () => {
    const wrapper = mountApp();
    await settle();

    expect(wrapper.text()).toContain("Example API");
    expect(wrapper.text()).toContain("List pets");
    expect(bridge.previewOperation).toHaveBeenCalledWith(expect.objectContaining({
      serverId: "server-1",
      requestDraftId: "draft-list-pets",
      values: { limit: "" }
    }));

    const limitInput = wrapper.find("input[placeholder='limit']");
    await limitInput.setValue("25");
    await settle();

    expect(bridge.updateRequestDraft).toHaveBeenLastCalledWith({
      draft: expect.objectContaining({
        id: "draft-list-pets",
        parametersJson: expect.stringContaining("\"value\":\"25\"")
      })
    });
    expect(bridge.previewOperation).toHaveBeenLastCalledWith(expect.objectContaining({
      values: { limit: "25" }
    }));

    await wrapper.findAll("button").find((button) => button.text().includes("Send"))?.trigger("click");
    await settle();

    expect(bridge.callOperation).toHaveBeenCalledWith(expect.objectContaining({
      requestDraftId: "draft-list-pets",
      values: { limit: "25" }
    }));
    expect(wrapper.text()).toContain("200");
    expect(wrapper.findAll("textarea").some((textarea) => (textarea.element as HTMLTextAreaElement).value.includes("\"pets\""))).toBe(true);
    await wrapper.findAll("button").find((button) => button.text().includes("History"))?.trigger("click");
    await nextTick();
    expect(wrapper.text()).toContain("listPets");
    await wrapper.find("button[title='Restore request']").trigger("click");
    await settle();

    expect(bridge.updateRequestDraft).toHaveBeenLastCalledWith({
      draft: expect.objectContaining({
        id: "draft-list-pets",
        parametersJson: expect.stringContaining("\"value\":\"10\"")
      })
    });
  });

  it("creates and previews a custom request from the UI", async () => {
    const wrapper = mountApp();
    await settle();

    await wrapper.findAll("button").find((button) => button.text().includes("Custom requests"))?.trigger("click");
    await settle();

    expect(bridge.createRequestDraft).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: "custom",
      method: "GET",
      url: "https://api.example.test"
    }));
    expect(wrapper.text()).toContain("Custom request");

    const urlInput = wrapper.find("input[placeholder='https://api.example.com/resource']");
    await urlInput.setValue("https://api.example.test/status");
    await settle();

    expect(bridge.previewCustomRequest).toHaveBeenLastCalledWith(expect.objectContaining({
      method: "GET",
      url: "https://api.example.test/status"
    }));
  });

  it("saves API key auth, keeps operation IPC secret-free, and reloads only configured state", async () => {
    const wrapper = mountApp();
    await settle();
    await wrapper.findAll("button").find((button) => button.text().includes("Headers"))?.trigger("click");
    await settle();

    expect(wrapper.text()).toContain("Required: API key in x-api-key header");
    await wrapper.find("input[type='password']").setValue("renderer-secret");
    await wrapper.findAll("button").find((button) => button.text().includes("Save credential"))?.trigger("click");
    await settle();

    expect(bridge.saveApiKeyHeader).toHaveBeenCalledWith({ serverId: "server-1", headerName: "x-api-key", secretValue: "renderer-secret" });
    expect(wrapper.text()).toContain("Credential configured for x-api-key");
    expect(JSON.stringify(vi.mocked(bridge.previewOperation).mock.calls)).not.toContain("renderer-secret");
    await wrapper.findAll("button").find((button) => button.text().includes("Send"))?.trigger("click");
    await settle();
    expect(JSON.stringify(vi.mocked(bridge.callOperation).mock.calls)).not.toContain("renderer-secret");

    wrapper.unmount();
    const restarted = mountApp();
    await settle();
    await restarted.findAll("button").find((button) => button.text().includes("Headers"))?.trigger("click");
    await settle();
    expect(restarted.text()).toContain("Credential configured for x-api-key");
    expect(JSON.stringify(await bridge.getInitialState())).not.toContain("renderer-secret");
  });

  it("opens server configuration and saves variables outside the sidebar", async () => {
    const wrapper = mountApp();
    await settle();

    await wrapper.find("button[title='Configure server']").trigger("click");
    await settle();

    expect(wrapper.text()).toContain("Server configuration");
    expect(wrapper.text()).toContain("Variables");
    expect(wrapper.find("button[title='Configure server']").exists()).toBe(true);
    expect(wrapper.find("[title='Drag to resize response']").exists()).toBe(false);

    await wrapper.findAll("button").find((button) => button.text().includes("Add variable"))?.trigger("click");
    await wrapper.find("input[placeholder='baseUrl']").setValue("tenant");
    await wrapper.findAll("input[placeholder='https://api.example.com']").at(-1)?.setValue("acme");
    await wrapper.findAll("button").find((button) => button.text().includes("Save variables"))?.trigger("click");
    await settle();

    expect(bridge.saveServerVariables).toHaveBeenCalledWith({
      serverId: "server-1",
      variables: [{ key: "tenant", value: "acme" }]
    });
    expect(wrapper.text()).toContain("Variables saved.");
  });
});

function mountApp(): VueWrapper {
  return mount(App, {
    attachTo: document.body,
    global: {
      stubs: {
        JsonCodeEditor: defineComponent({
          name: "JsonCodeEditor",
          props: {
            modelValue: { type: String, default: "" },
            editable: { type: Boolean, default: true },
            title: { type: String, default: "Editor" }
          },
          emits: ["update:modelValue"],
          setup(props, { emit }) {
            return () => h("textarea", {
              "aria-label": props.title,
              readonly: !props.editable,
              value: props.modelValue,
              onInput: (event: Event) => emit("update:modelValue", (event.target as HTMLTextAreaElement).value)
            });
          }
        })
      }
    }
  });
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function createMockBridge(): MockTapirBridge {
  const state = {
    drafts: [] as RequestDraft[],
    history: [] as CallHistoryEntry[],
    authentication: null as ServerWithDefinition["authentication"]
  };

  const bridge = {
    getInitialState: vi.fn(async () => ({ workspace, servers: [{ ...serverWithDefinition, authentication: state.authentication }] })),
    addServer: vi.fn(),
    refreshServerSchema: vi.fn(),
    saveApiKeyHeader: vi.fn(async (input) => {
      state.authentication = { type: "apiKeyHeader", headerName: input.headerName, configured: true };
      return state.authentication;
    }),
    saveServerVariables: vi.fn(async (input) => ({
      variables: input.variables.map((variable: { id?: string; key: string; value: string }, index: number) => ({
        ...variable,
        id: variable.id ?? `variable-${index + 1}`,
        serverInstanceId: "server-1",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z"
      }))
    })),
    listRequestDrafts: vi.fn(async () => state.drafts),
    createRequestDraft: vi.fn(async (input: CreateRequestDraftRequest) => {
      const draft = input.sourceType === "custom" ? customDraft(input) : openApiDraft(input);
      state.drafts = [...state.drafts, draft];
      return draft;
    }),
    updateRequestDraft: vi.fn(async ({ draft }: { draft: RequestDraft }) => {
      const updated = { ...draft, updatedAt: "2026-07-01T00:00:01.000Z" };
      state.drafts = state.drafts.map((candidate) => candidate.id === updated.id ? updated : candidate);
      return updated;
    }),
    deleteRequestDraft: vi.fn(async (id: string) => {
      state.drafts = state.drafts.filter((draft) => draft.id !== id);
    }),
    previewOperation: vi.fn(async (input: PreviewOperationRequest) => preparedOperation(input)),
    callOperation: vi.fn(async (input: CallOperationRequest) => {
      const response = operationResponse(input);
      state.history = [historyEntry(response.request, input.requestDraftId)];
      return response;
    }),
    listHistory: vi.fn(async () => state.history),
    previewCustomRequest: vi.fn(async (input: PreviewCustomRequestRequest) => ({
      request: { method: input.method, url: input.url, headers: {} },
      redactedRequest: { method: input.method, url: input.url, headers: {} },
      validationIssues: []
    })),
    callCustomRequest: vi.fn()
  } satisfies Partial<TapirBridge>;

  return bridge as MockTapirBridge;
}

function openApiDraft(input?: Partial<CreateRequestDraftRequest>): RequestDraft {
  return {
    id: "draft-list-pets",
    workspaceId: "workspace-1",
    serverInstanceId: "server-1",
    sourceType: "openapi",
    operationId: "listPets",
    deprecatedAt: null,
    deprecationReason: null,
    name: input?.name ?? "List pets",
    isNameManual: false,
    method: "GET",
    path: "/pets",
    url: "",
    parametersJson: JSON.stringify(input?.parameters ?? [{ id: "query:limit", name: "limit", in: "query", value: "", enabled: true, required: false, source: "openapi" }]),
    headersJson: JSON.stringify(input?.headers ?? []),
    body: input?.body ?? "",
    contentType: input?.contentType ?? "application/json",
    sortOrder: input?.sortOrder ?? 1,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z"
  };
}

function customDraft(input: CreateRequestDraftRequest): RequestDraft {
  return {
    id: "draft-custom",
    workspaceId: "workspace-1",
    serverInstanceId: input.serverId,
    sourceType: "custom",
    operationId: null,
    deprecatedAt: null,
    deprecationReason: null,
    name: input.name,
    isNameManual: input.isNameManual ?? false,
    method: input.method,
    path: "",
    url: input.url ?? "",
    parametersJson: JSON.stringify(input.parameters ?? []),
    headersJson: JSON.stringify(input.headers ?? []),
    body: input.body ?? "",
    contentType: input.contentType ?? "application/json",
    sortOrder: input.sortOrder ?? 2,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z"
  };
}

function preparedOperation(input: PreviewOperationRequest): PreparedOperationRequest {
  const url = `https://api.example.test/pets${input.values.limit ? `?limit=${input.values.limit}` : ""}`;
  return {
    request: { method: "GET", url, headers: {} },
    redactedRequest: { method: "GET", url, headers: {} },
    validationIssues: []
  };
}

function operationResponse(input: CallOperationRequest) {
  return {
    request: preparedOperation(input).request,
    response: {
      status: 200,
      headers: { "content-type": "application/json" },
      body: "{\"pets\":[{\"id\":\"pet-1\"}]}",
      durationMs: 31
    }
  };
}

function historyEntry(request: ReturnType<typeof preparedOperation>["request"], requestDraftId = "draft-list-pets"): CallHistoryEntry {
  return {
    id: "history-1",
    workspaceId: "workspace-1",
    serverInstanceId: "server-1",
    operationId: "listPets",
    requestDraftId,
    requestSnapshotJson: JSON.stringify({
      ...request,
      url: "https://api.example.test/pets?limit=10"
    }),
    responseStatus: 200,
    responseHeadersJson: JSON.stringify({ "content-type": "application/json" }),
    responseBody: "{\"pets\":[{\"id\":\"pet-1\"}]}",
    durationMs: 31,
    createdAt: "2026-07-01T00:00:00.000Z"
  };
}

const workspace: Workspace = {
  id: "workspace-1",
  name: "Local Workspace",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z"
};

const listPetsOperation: NormalizedOperation = {
  operationId: "listPets",
  method: "GET",
  path: "/pets",
  summary: "List pets",
  tags: ["Pets"],
  parameters: [{ name: "limit", in: "query", required: false }],
  requestBodyMediaTypes: [],
  securityRequirements: [{ ApiKeyAuth: [] }],
  securitySchemes: [{ key: "ApiKeyAuth", type: "apiKey", name: "x-api-key", in: "header" }]
};

const serverWithDefinition: ServerWithDefinition = {
  server: {
    id: "server-1",
    workspaceId: "workspace-1",
    name: "Example API",
    baseUrl: "https://api.example.test",
    specUrl: "https://api.example.test/openapi.json",
    apiDefinitionSourceId: "source-1",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z"
  },
  definition: {
    name: "Example API",
    version: "1.0.0",
    servers: ["https://api.example.test"],
    operations: [listPetsOperation]
  },
  variables: [],
  authentication: null
};

type MockTapirBridge = TapirBridge & Record<string, ReturnType<typeof vi.fn>>;
