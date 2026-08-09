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
    expect(wrapper.text()).toContain("List pets");
    await wrapper.find("[title='Restore request']").trigger("click");
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

  it("closes request tabs from their right-click menu", async () => {
    const wrapper = mountApp();
    await settle();

    const newTab = () => wrapper.find("button[title='New request tab']");
    await newTab().trigger("click");
    await settle();
    await newTab().trigger("click");
    await settle();
    expect(wrapper.findAll(".request-tab")).toHaveLength(3);

    await wrapper.findAll(".request-tab")[1]!.trigger("contextmenu", { clientX: 40, clientY: 60 });
    await nextTick();
    let menu = document.body.querySelector<HTMLElement>("[aria-label='Request tab actions']")!;
    expect(menu.textContent).toContain("Close tab");
    expect(menu.textContent).toContain("Close other tabs");
    expect(menu.textContent).toContain("Close all tabs");
    (Array.from(menu.querySelectorAll("button")).find((button) => button.textContent === "Close other tabs") as HTMLButtonElement).click();
    await settle();

    expect(wrapper.findAll(".request-tab")).toHaveLength(1);
    expect(bridge.deleteRequestDraft).toHaveBeenCalledTimes(2);

    await newTab().trigger("click");
    await settle();
    await newTab().trigger("click");
    await settle();
    await wrapper.findAll(".request-tab")[1]!.trigger("contextmenu", { clientX: 40, clientY: 60 });
    await nextTick();
    menu = document.body.querySelector<HTMLElement>("[aria-label='Request tab actions']")!;
    (Array.from(menu.querySelectorAll("button")).find((button) => button.textContent === "Close tab") as HTMLButtonElement).click();
    await settle();

    expect(wrapper.findAll(".request-tab")).toHaveLength(2);

    await wrapper.find(".request-tab").trigger("contextmenu", { clientX: 40, clientY: 60 });
    await nextTick();
    menu = document.body.querySelector<HTMLElement>("[aria-label='Request tab actions']")!;
    (Array.from(menu.querySelectorAll("button")).find((button) => button.textContent === "Close all tabs") as HTMLButtonElement).click();
    await settle();

    expect(wrapper.findAll(".request-tab")).toHaveLength(0);
    expect(bridge.deleteRequestDraft).toHaveBeenCalledTimes(5);
  });

  it("imports an unmatched browser cURL request into the Request Sandbox", async () => {
    const wrapper = mountApp();
    await settle();

    await wrapper.findAll("button").find((button) => button.text().includes("Import cURL"))?.trigger("click");
    await nextTick();
    await wrapper.find("textarea[aria-label='Browser cURL']").setValue("curl 'https://dev.example.test/api/orders?expand=items' -H 'content-type: application/json' -H 'authorization: Bearer secret' --data-raw '{\"name\":\"Momo\"}'");
    await nextTick();

    expect(wrapper.text()).toContain("http://localhost:5051/api/orders?expand=items");
    expect(wrapper.text()).toContain("1 detected");
    await wrapper.findAll("button").find((button) => button.text().includes("Import request"))?.trigger("click");
    await settle();

    expect(bridge.createRequestDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      serverId: null,
      sourceType: "custom",
      name: "POST /api/orders",
      method: "POST",
      url: "http://localhost:5051/api/orders?expand=items",
      headers: [expect.objectContaining({ name: "content-type", value: "application/json" })],
      body: "{\"name\":\"Momo\"}",
      contentType: "application/json"
    }));
    expect(JSON.stringify(vi.mocked(bridge.createRequestDraft).mock.calls.at(-1))).not.toContain("Bearer secret");
    expect(wrapper.text()).toContain("Request Sandbox");
    expect(wrapper.text()).toContain("POST /api/orders");
  });

  it("recommends an existing server independently from keeping the original URL", async () => {
    const wrapper = mountApp();
    await settle();

    await wrapper.findAll("button").find((button) => button.text().includes("Import cURL"))?.trigger("click");
    await nextTick();
    await wrapper.find("textarea[aria-label='Browser cURL']").setValue("curl 'https://api.example.test/undocumented/status'");
    await wrapper.findAll("button").find((button) => button.text() === "Keep original URL")?.trigger("click");
    await nextTick();

    expect(wrapper.text()).toContain("Recommended match");
    await wrapper.findAll("button").find((button) => button.text().includes("Import request"))?.trigger("click");
    await settle();
    expect(bridge.createRequestDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      serverId: "server-1",
      sourceType: "custom",
      url: "https://api.example.test/undocumented/status"
    }));
  });

  it("can create a Tapir server for an unmatched original cURL destination", async () => {
    vi.mocked(bridge.addServer).mockResolvedValue({
      server: { ...serverWithDefinition.server, id: "server-2", name: "Dev API", baseUrl: "https://dev.example.test", specUrl: "https://dev.example.test/openapi.json" },
      normalized: { ...serverWithDefinition.definition!, name: "Dev API", servers: ["https://dev.example.test"] }
    });
    const wrapper = mountApp();
    await settle();

    await wrapper.findAll("button").find((button) => button.text().includes("Import cURL"))?.trigger("click");
    await nextTick();
    await wrapper.find("textarea[aria-label='Browser cURL']").setValue("curl 'https://dev.example.test/api/orders'");
    await wrapper.findAll("button").find((button) => button.text() === "Keep original URL")?.trigger("click");
    await nextTick();
    const createAssociation = wrapper.findAll("label").find((label) => label.text().includes("Create server from destination"));
    await createAssociation?.find("input").setValue(true);
    await wrapper.findAll("button").find((button) => button.text().includes("Import request"))?.trigger("click");
    await settle();

    expect(bridge.addServer).toHaveBeenCalledWith("https://dev.example.test");
    expect(bridge.createRequestDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      serverId: "server-2",
      sourceType: "custom",
      url: "https://dev.example.test/api/orders"
    }));
    expect(wrapper.text()).toContain("Dev API");
  });

  it("keeps the importer open when server discovery for an original destination fails", async () => {
    vi.mocked(bridge.addServer).mockRejectedValue(new Error("No OpenAPI definition found at this destination."));
    const wrapper = mountApp();
    await settle();

    await wrapper.findAll("button").find((button) => button.text().includes("Import cURL"))?.trigger("click");
    await nextTick();
    await wrapper.find("textarea[aria-label='Browser cURL']").setValue("curl 'https://unknown.example.test/status'");
    await wrapper.findAll("button").find((button) => button.text() === "Keep original URL")?.trigger("click");
    await nextTick();
    const createAssociation = wrapper.findAll("label").find((label) => label.text().includes("Create server from destination"));
    await createAssociation?.find("input").setValue(true);
    await wrapper.findAll("button").find((button) => button.text().includes("Import request"))?.trigger("click");
    await settle();

    expect(wrapper.text()).toContain("Import cURL");
    expect(wrapper.text()).toContain("No OpenAPI definition found at this destination.");
    expect(bridge.createRequestDraft).not.toHaveBeenCalledWith(expect.objectContaining({ url: "https://unknown.example.test/status" }));
  });

  it("filters and confirms deletion of workspace history", async () => {
    const wrapper = mountApp();
    await settle();
    await wrapper.findAll("button").find((button) => button.text().includes("Send"))?.trigger("click");
    await settle();
    await wrapper.findAll("button").find((button) => button.text().includes("History"))?.trigger("click");
    await wrapper.find("input[placeholder='Search URL or draft']").setValue("pets");
    await wrapper.find("input[placeholder='Operation ID']").setValue("listPets");
    await wrapper.findAll("button").find((button) => button.text().includes("Apply"))?.trigger("click");
    await settle();
    expect(bridge.listHistory).toHaveBeenLastCalledWith(expect.objectContaining({ workspaceId: "workspace-1", search: "pets", operationId: "listPets", limit: 50 }));

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await wrapper.find("button[title='Delete history entry']").trigger("click");
    expect(bridge.deleteHistoryEntry).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await wrapper.find("button[title='Delete history entry']").trigger("click");
    await settle();
    expect(bridge.deleteHistoryEntry).toHaveBeenCalledWith("workspace-1", "history-1");
  });

  it("restores standalone history and confirms clearing the filtered set", async () => {
    const standalone = historyEntry({ method: "PATCH", url: "https://standalone.example.test/jobs/1", headers: { "x-trace": "safe" }, body: "{\"state\":\"ready\"}" }, null);
    standalone.serverInstanceId = null;
    standalone.operationId = null;
    standalone.requestMethod = "PATCH";
    standalone.requestUrl = "https://standalone.example.test/jobs/1";
    standalone.draftName = "Standalone job";
    standalone.requestSnapshotJson = JSON.stringify({ method: "PATCH", url: standalone.requestUrl, headers: { "x-trace": "safe" }, body: "{\"state\":\"ready\"}" });
    vi.mocked(bridge.listHistory).mockResolvedValue({ entries: [standalone], nextCursor: null });

    const wrapper = mountApp();
    await settle();
    await wrapper.findAll("button").find((button) => button.text().includes("History"))?.trigger("click");
    await wrapper.find("[title='Restore request']").trigger("click");
    await settle();

    expect(bridge.createRequestDraft).toHaveBeenCalledWith(expect.objectContaining({
      serverId: null,
      sourceType: "custom",
      url: "https://standalone.example.test/jobs/1"
    }));
    expect(wrapper.text()).toContain("Request Sandbox");
    expect((wrapper.find("input[placeholder='https://api.example.com/resource']").element as HTMLInputElement).value).toBe("https://standalone.example.test/jobs/1");

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await wrapper.findAll("button").find((button) => button.text().includes("Clear"))?.trigger("click");
    expect(bridge.clearHistory).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await wrapper.findAll("button").find((button) => button.text().includes("Clear"))?.trigger("click");
    await settle();
    expect(bridge.clearHistory).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
  });

  it("saves API key auth, keeps operation IPC secret-free, and reloads only configured state", async () => {
    const wrapper = mountApp();
    await settle();
    await wrapper.findAll("button").find((button) => button.text().includes("Headers"))?.trigger("click");
    await settle();

    expect(wrapper.text()).toContain("Required authentication declared by this operation");
    await wrapper.find("input[type='password']").setValue("renderer-secret");
    await wrapper.findAll("button").find((button) => button.text() === "Save")?.trigger("click");
    await settle();

    expect(bridge.saveAuthentication).toHaveBeenCalledWith(expect.objectContaining({ serverId: "server-1", schemeKey: "ApiKeyAuth", type: "apiKey", parameterName: "x-api-key", location: "header", secretValue: "renderer-secret" }));
    expect(wrapper.text()).toContain("Credential configured");
    expect(JSON.stringify(vi.mocked(bridge.previewOperation).mock.calls)).not.toContain("renderer-secret");
    await wrapper.findAll("button").find((button) => button.text().includes("Send"))?.trigger("click");
    await settle();
    expect(JSON.stringify(vi.mocked(bridge.callOperation).mock.calls)).not.toContain("renderer-secret");

    wrapper.unmount();
    const restarted = mountApp();
    await settle();
    await restarted.findAll("button").find((button) => button.text().includes("Headers"))?.trigger("click");
    await settle();
    expect(restarted.text()).toContain("Credential configured");
    expect(JSON.stringify(await bridge.getInitialState())).not.toContain("renderer-secret");
  });

  it("edits and deletes a server while saving variables outside the sidebar", async () => {
    const wrapper = mountApp();
    await settle();

    await wrapper.find("button[title='Configure server']").trigger("click");
    await settle();

    expect(wrapper.text()).toContain("Server configuration");
    expect(wrapper.text()).toContain("Variables");
    expect(wrapper.text()).toContain("OpenAPI compatibility notices (1)");
    expect(wrapper.text()).toContain("unsupported-webhooks");
    expect(wrapper.find("button[title='Configure server']").exists()).toBe(true);
    expect(wrapper.find("[title='Drag to resize response']").exists()).toBe(false);

    await wrapper.find("input[placeholder='Example API']").setValue("Renamed API");
    await wrapper.findAll("input[placeholder='https://api.example.com']").at(-1)?.setValue("https://renamed.example.test");
    await wrapper.find("input[placeholder='https://api.example.com/openapi.json']").setValue("https://renamed.example.test/schema.json");
    await wrapper.findAll("button").find((button) => button.text().includes("Save configuration"))?.trigger("click");
    await settle();
    expect(bridge.updateServerConfiguration).toHaveBeenCalledWith({
      serverId: "server-1", name: "Renamed API", baseUrl: "https://renamed.example.test", specUrl: "https://renamed.example.test/schema.json"
    });

    await wrapper.findAll("button").find((button) => button.text().includes("Variables"))?.trigger("click");
    await settle();

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

    await wrapper.findAll("button").find((button) => button.text() === "General")?.trigger("click");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await wrapper.findAll("button").find((button) => button.text() === "Delete")?.trigger("click");
    expect(bridge.deleteServer).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await wrapper.findAll("button").find((button) => button.text() === "Delete")?.trigger("click");
    await settle();
    expect(bridge.deleteServer).toHaveBeenCalledWith("server-1");
  });

  it("starts OpenAPI drafts from examples and preserves edited bodies across media types", async () => {
    const wrapper = mountApp();
    await settle();
    await wrapper.findAll("button").find((button) => button.text().includes("Create pet"))?.trigger("click");
    await settle();

    expect(bridge.createRequestDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      operationId: "createPet",
      parameters: [expect.objectContaining({ name: "notify", value: "true" })],
      body: JSON.stringify({ name: "Momo", age: 0 }, null, 2)
    }));

    await wrapper.findAll("button").find((button) => button.text().includes("Body"))?.trigger("click");
    await wrapper.find("textarea[aria-label='Structured request body']").setValue(JSON.stringify({ name: "User edit" }));
    await settle();
    const contentTypeSelect = wrapper.findAll("select").find((select) => select.find("option[value='application/x-www-form-urlencoded']").exists());
    await contentTypeSelect?.setValue("application/x-www-form-urlencoded");
    await settle();
    expect(bridge.updateRequestDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      draft: expect.objectContaining({ body: JSON.stringify({ name: "User edit" }), contentType: "application/x-www-form-urlencoded" })
    }));
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
    authentication: [] as ServerWithDefinition["authentication"]
  };

  const bridge = {
    getInitialState: vi.fn(async () => ({ workspace, servers: [{ ...serverWithDefinition, authentication: state.authentication }] })),
    addServer: vi.fn(),
    refreshServerSchema: vi.fn(),
    rediscoverServerSchema: vi.fn(),
    updateServerConfiguration: vi.fn(async (input) => ({ ...serverWithDefinition.server, ...input })),
    deleteServer: vi.fn(async () => ({ detachedDrafts: [] })),
    saveAuthentication: vi.fn(async (input) => {
      const configuration = { schemeKey: input.schemeKey, type: input.type, parameterName: input.parameterName, location: input.location, username: input.username, configured: true as const };
      state.authentication = [...state.authentication.filter((item) => item.schemeKey !== input.schemeKey), configuration];
      return configuration;
    }),
    deleteAuthentication: vi.fn(async (input) => {
      state.authentication = state.authentication.filter((item) => item.schemeKey !== input.schemeKey);
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
      if (state.drafts.some((candidate) => candidate.id === draft.id)) {
        draft.id = `${draft.id}-${state.drafts.length + 1}`;
      }
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
    listHistory: vi.fn(async () => ({ entries: state.history, nextCursor: null })),
    deleteHistoryEntry: vi.fn(async (_workspaceId, id) => { state.history = state.history.filter((entry) => entry.id !== id); }),
    clearHistory: vi.fn(async () => { const deletedCount = state.history.length; state.history = []; return { deletedCount }; }),
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
    operationId: input?.operationId ?? "listPets",
    deprecatedAt: null,
    deprecationReason: null,
    name: input?.name ?? "List pets",
    isNameManual: false,
    method: input?.method ?? "GET",
    path: input?.path ?? "/pets",
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

function historyEntry(request: ReturnType<typeof preparedOperation>["request"], requestDraftId: string | null = "draft-list-pets"): CallHistoryEntry {
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
    requestMethod: request.method as CallHistoryEntry["requestMethod"],
    requestUrl: "https://api.example.test/pets?limit=10",
    draftName: "List pets",
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

const createPetOperation: NormalizedOperation = {
  operationId: "createPet",
  method: "POST",
  path: "/pets",
  summary: "Create pet",
  tags: ["Pets"],
  parameters: [{ name: "notify", in: "query", required: false, example: true, schema: { type: "boolean" } }],
  requestBodyMediaTypes: [
    { mediaType: "application/json", required: true, schema: { type: "object", required: ["name"], properties: { name: { type: "string", example: "Momo" }, age: { type: "integer" } } } },
    { mediaType: "application/x-www-form-urlencoded", required: true, schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } } }
  ],
  securityRequirements: [],
  securitySchemes: []
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
    operations: [listPetsOperation, createPetOperation],
    diagnostics: [{ severity: "warning", code: "unsupported-webhooks", message: "OpenAPI webhooks are not shown.", path: "#/webhooks" }]
  },
  variables: [],
  authentication: []
};

type MockTapirBridge = TapirBridge & Record<string, ReturnType<typeof vi.fn>>;
