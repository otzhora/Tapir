import { describe, expect, it, vi } from "vitest";
import { TapirApplicationService } from "./application.js";
import type {
  ApiDefinition,
  ApiDefinitionRepository,
  ApiDefinitionSource,
  AuthProfileRepository,
  HistoryRepository,
  HttpExecutor,
  OpenApiDiscoveryService,
  OpenApiNormalizer,
  NormalizedOperation,
  RequestDraft,
  RequestDraftRepository,
  PreparedRequest,
  SecretValue,
  ServerInstance,
  ServerRepository,
  ServerVariableRepository,
  Workspace,
  UserAuthProfile
} from "./index.js";

describe("TapirApplicationService", () => {
  it("saves, resolves, injects, redacts, and reloads server API key authentication", async () => {
    const workspace = testWorkspace();
    const servers = new MemoryServerRepository();
    await servers.create({ id: "server-1", workspaceId: workspace.id, name: "Example API", baseUrl: "https://api.example.test", specUrl: "https://api.example.test/openapi.json", apiDefinitionSourceId: null });
    const authProfiles = new MemoryAuthProfileRepository();
    const definitions = new MemoryDefinitionRepository();
    const historyEntries: Parameters<HistoryRepository["create"]>[0][] = [];
    const executed: PreparedRequest[] = [];
    const dependencies = {
      workspace, servers, serverVariables: unusedServerVariables(), definitions, authProfiles,
      history: {
        async create(input: Parameters<HistoryRepository["create"]>[0]) { historyEntries.push(input); return { ...input, id: "history-1", createdAt: "2026-07-01T00:00:00.000Z" }; },
        async list() { return { entries: [], nextCursor: null }; },
        async delete() {},
        async clear() { return 0; }
      },
      requestDrafts: unusedRequestDrafts(), discovery: fixedDiscovery(), normalizer: fixedNormalizer(),
      http: { async execute(request: PreparedRequest) { executed.push(request); return { status: 200, headers: {}, body: "ok", durationMs: 1 }; } }
    };
    let service = new TapirApplicationService(dependencies);
    const operation = {
      operationId: "secured", method: "GET" as const, path: "/secured", tags: [], parameters: [], requestBodyMediaTypes: [],
      securityRequirements: [{ ApiKeyAuth: [] }], securitySchemes: [{ key: "ApiKeyAuth", type: "apiKey", name: "x-api-key", in: "header" as const }]
    };
    await definitions.setOperations("server-1", [operation]);

    await expect(service.previewOperation({ serverId: "server-1", operationId: "forged", values: {} }))
      .rejects.toThrow("OpenAPI operation not found.");

    await expect(service.saveAuthentication({ serverId: "server-1", schemeKey: "ApiKeyAuth", type: "apiKey", parameterName: "x-api-key", location: "header", secretValue: "top-secret" })).resolves.toEqual({ schemeKey: "ApiKeyAuth", type: "apiKey", parameterName: "x-api-key", location: "header", configured: true });
    const preview = await service.previewOperation({ serverId: "server-1", operationId: operation.operationId, values: {} });
    expect(preview.request.headers["x-api-key"]).toBe("********");
    expect(preview.redactedRequest.headers["x-api-key"]).toBe("********");
    expect(JSON.stringify(preview)).not.toContain("top-secret");

    const result = await service.callOperation({ serverId: "server-1", operationId: operation.operationId, values: {} });
    expect(executed[0]?.headers["x-api-key"]).toBe("top-secret");
    expect(result.request.headers["x-api-key"]).toBe("********");
    expect(historyEntries[0]?.requestSnapshotJson).toContain("********");
    expect(historyEntries[0]?.requestSnapshotJson).not.toContain("top-secret");

    const restarted = new TapirApplicationService(dependencies);
    const initial = await restarted.getInitialState();
    expect(initial.servers[0]?.authentication).toEqual([{ schemeKey: "ApiKeyAuth", type: "apiKey", parameterName: "x-api-key", location: "header", configured: true }]);
    expect(JSON.stringify(initial)).not.toContain("top-secret");

    const bearerOperation: NormalizedOperation = {
      operationId: "optionalBearer", method: "GET" as const, path: "/optional", tags: [], parameters: [], requestBodyMediaTypes: [],
      securityRequirements: [{}, { BearerAuth: [] }], securitySchemes: [{ key: "BearerAuth", type: "http", scheme: "bearer" }]
    };
    await definitions.setOperations("server-1", [operation, bearerOperation]);
    service = new TapirApplicationService(dependencies);
    await expect(service.previewOperation({ serverId: "server-1", operationId: bearerOperation.operationId, values: {} })).resolves.toMatchObject({
      request: { headers: {} }
    });
    await service.saveAuthentication({ serverId: "server-1", schemeKey: "BearerAuth", type: "bearer", secretValue: "bearer-secret" });
    const bearerPreview = await service.previewOperation({ serverId: "server-1", operationId: bearerOperation.operationId, values: {} });
    expect(bearerPreview.request.headers.authorization).toBe("Bearer ********");
    await service.callOperation({ serverId: "server-1", operationId: bearerOperation.operationId, values: {} });
    expect(executed.at(-1)?.headers.authorization).toBe("Bearer bearer-secret");

    const basicOperation: NormalizedOperation = {
      operationId: "combined", method: "GET" as const, path: "/combined", tags: [], parameters: [], requestBodyMediaTypes: [],
      securityRequirements: [{ ApiKeyAuth: [], BasicAuth: [] }],
      securitySchemes: [
        { key: "ApiKeyAuth", type: "apiKey", name: "x-api-key", in: "header" as const },
        { key: "BasicAuth", type: "http", scheme: "basic" }
      ]
    };
    await definitions.setOperations("server-1", [operation, bearerOperation, basicOperation]);
    service = new TapirApplicationService(dependencies);
    await service.saveAuthentication({ serverId: "server-1", schemeKey: "BasicAuth", type: "basic", username: "momo", secretValue: "basic-secret" });
    await service.callOperation({ serverId: "server-1", operationId: basicOperation.operationId, values: {} });
    expect(executed.at(-1)?.headers).toMatchObject({
      "x-api-key": "top-secret",
      authorization: `Basic ${Buffer.from("momo:basic-secret").toString("base64")}`
    });

    await service.deleteAuthentication({ serverId: "server-1", schemeKey: "BearerAuth" });
    expect((await service.getInitialState()).servers[0]?.authentication).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ schemeKey: "BearerAuth" })
    ]));
  });
  it("returns a narrow JSON-safe add-server response", async () => {
    const workspace: Workspace = {
      id: "workspace-1",
      name: "Local Workspace",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    };
    const servers = new MemoryServerRepository();
    const service = new TapirApplicationService({
      workspace,
      servers,
      serverVariables: unusedServerVariables(),
      definitions: new MemoryDefinitionRepository(),
      authProfiles: unusedAuthProfiles(),
      history: unusedHistory(),
      requestDrafts: unusedRequestDrafts(),
      discovery: fixedDiscovery(),
      normalizer: fixedNormalizer(),
      http: unusedHttp()
    });

    const result = await service.addServer({ baseUrl: "localhost:5052" });

    expect(result).toEqual({
      server: {
        id: expect.any(String),
        workspaceId: "workspace-1",
        name: "Example API",
        baseUrl: "https://localhost:5052",
        specUrl: "https://localhost:5052/openapi.json",
        apiDefinitionSourceId: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      },
      normalized: {
        name: "Example API",
        version: "1.0.0",
        servers: [],
        operations: []
      }
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect("definition" in result).toBe(false);
    expect("source" in result).toBe(false);
  });

  it("uses an explicit OpenAPI document URL when adding a server", async () => {
    const workspace = testWorkspace();
    const discovery = fixedDiscovery();
    const fetchDocument = vi.spyOn(discovery, "fetch");
    const discover = vi.spyOn(discovery, "discover");
    const service = new TapirApplicationService({
      workspace,
      servers: new MemoryServerRepository(),
      serverVariables: unusedServerVariables(),
      definitions: new MemoryDefinitionRepository(),
      authProfiles: unusedAuthProfiles(),
      history: unusedHistory(),
      requestDrafts: unusedRequestDrafts(),
      discovery,
      normalizer: fixedNormalizer(),
      http: unusedHttp()
    });

    await service.addServer({
      baseUrl: "https://api.example.test/v3",
      specUrl: "https://docs.example.test/openapi.json"
    });

    expect(fetchDocument).toHaveBeenCalledWith("https://docs.example.test/openapi.json");
    expect(discover).not.toHaveBeenCalled();
  });

  it("refreshes schemas and moves changed operation drafts to custom deprecated requests", async () => {
    const workspace: Workspace = {
      id: "workspace-1",
      name: "Local Workspace",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    };
    const servers = new MemoryServerRepository();
    const definitions = new MemoryDefinitionRepository();
    const requestDrafts = new MemoryRequestDraftRepository();
    const server = await servers.create({
      id: "server-1",
      workspaceId: workspace.id,
      name: "Example API",
      baseUrl: "https://api.example.test",
      specUrl: "https://api.example.test/openapi.json",
      apiDefinitionSourceId: "source-1"
    });
    await definitions.createSource({
      id: "source-1",
      workspaceId: workspace.id,
      serverInstanceId: server.id,
      sourceUrl: server.specUrl,
      discoveryMethod: "/openapi.json",
      lastFetchedAt: "2026-07-01T00:00:00.000Z"
    });
    await definitions.createDefinition({
      id: "definition-1",
      sourceId: "source-1",
      name: "Example API",
      version: "1.0.0",
      rawSpecJson: "{}",
      normalizedJson: JSON.stringify({
        name: "Example API",
        version: "1.0.0",
        servers: [],
        operations: [{ operationId: "getPet", method: "GET", path: "/pets/{petId}", tags: [], parameters: [{ name: "petId", in: "path", required: true }], requestBodyMediaTypes: [], securityRequirements: [], securitySchemes: [] }]
      }),
      fetchedAt: "2026-07-01T00:00:00.000Z"
    });
    await requestDrafts.create({
      id: "draft-1",
      workspaceId: workspace.id,
      serverInstanceId: server.id,
      sourceType: "openapi",
      operationId: "getPet",
      deprecatedAt: null,
      deprecationReason: null,
      name: "Get pet",
      isNameManual: false,
      method: "GET",
      path: "/pets/{petId}",
      url: "",
      parametersJson: JSON.stringify([{ id: "path:petId", name: "petId", in: "path", value: "pet 1", enabled: true, required: true, source: "openapi" }]),
      headersJson: "[]",
      body: "",
      contentType: "application/json",
      sortOrder: 1
    });
    const service = new TapirApplicationService({
      workspace,
      servers,
      serverVariables: unusedServerVariables(),
      definitions,
      authProfiles: unusedAuthProfiles(),
      history: unusedHistory(),
      requestDrafts,
      discovery: fixedDiscovery(),
      normalizer: {
        normalize() {
          return {
            name: "Example API",
            version: "1.1.0",
            servers: [],
            operations: [{ operationId: "getPet", method: "GET", path: "/animals/{petId}", tags: [], parameters: [{ name: "petId", in: "path", required: true }], requestBodyMediaTypes: [], securityRequirements: [], securitySchemes: [] }]
          };
        }
      },
      http: unusedHttp()
    });

    const result = await service.refreshServerSchema({ serverId: "server-1" });

    expect(result.deprecatedDrafts).toHaveLength(1);
    expect(result.deprecatedDrafts[0]).toMatchObject({
      id: "draft-1",
      sourceType: "custom",
      operationId: null,
      deprecatedAt: expect.any(String),
      deprecationReason: expect.stringContaining("schema changed"),
      name: "Get pet (deprecated)",
      url: "https://api.example.test/pets/pet%201"
    });
  });

  it("persists and manages standalone custom-request history at workspace scope", async () => {
    const workspace = testWorkspace();
    const entries: Array<Parameters<HistoryRepository["create"]>[0] & { id: string; createdAt: string }> = [];
    const history: HistoryRepository = {
      async create(input) {
        const entry = { ...input, id: `history-${entries.length + 1}`, createdAt: "2026-07-01T00:00:00.000Z" };
        entries.push(entry);
        return entry;
      },
      async list() { return { entries, nextCursor: null }; },
      async delete(workspaceId, id) {
        const index = entries.findIndex((entry) => entry.workspaceId === workspaceId && entry.id === id);
        if (index >= 0) entries.splice(index, 1);
      },
      async clear(input) {
        const before = entries.length;
        for (let index = entries.length - 1; index >= 0; index -= 1) if (entries[index]?.workspaceId === input.workspaceId) entries.splice(index, 1);
        return before - entries.length;
      }
    };
    const service = new TapirApplicationService({
      workspace, history, servers: new MemoryServerRepository(), definitions: new MemoryDefinitionRepository(), requestDrafts: unusedRequestDrafts(),
      serverVariables: unusedServerVariables(), authProfiles: unusedAuthProfiles(), discovery: fixedDiscovery(), normalizer: fixedNormalizer(),
      http: { async execute() { return { status: 204, headers: { "set-cookie": "session=response-secret" }, body: "", durationMs: 2 }; } }
    });

    await service.callCustomRequest({
      serverId: null,
      method: "GET",
      url: "https://standalone.example.test/health?opaque=secret",
      parameters: [],
      headers: [{ id: "auth", name: "authorization", value: "Bearer request-secret", enabled: true }]
    });
    expect(entries[0]).toMatchObject({ serverInstanceId: null, requestMethod: "GET", requestUrl: "https://standalone.example.test/health?opaque=********", responseStatus: 204 });
    expect(entries[0]?.requestSnapshotJson).not.toContain("request-secret");
    expect(entries[0]?.responseHeadersJson).not.toContain("response-secret");
    await expect(service.listHistory({ workspaceId: workspace.id, serverId: null })).resolves.toMatchObject({ entries: [{ id: "history-1" }] });
    await service.deleteHistoryEntry(workspace.id, "history-1");
    expect(entries).toEqual([]);
  });

  it("updates, refreshes, rediscovers, and deletes servers while retaining detached custom drafts", async () => {
    const workspace = testWorkspace();
    const servers = new MemoryServerRepository();
    const definitions = new MemoryDefinitionRepository();
    const requestDrafts = new MemoryRequestDraftRepository();
    await servers.create({ id: "server-1", workspaceId: workspace.id, name: "Old API", baseUrl: "https://old.example.test", specUrl: "https://old.example.test/openapi.json", apiDefinitionSourceId: null });
    await requestDrafts.create({
      id: "custom-1", workspaceId: workspace.id, serverInstanceId: "server-1", sourceType: "custom", operationId: null,
      deprecatedAt: null, deprecationReason: null, name: "Custom check", isNameManual: true, method: "GET", path: "", url: "https://old.example.test/status",
      parametersJson: "[]", headersJson: "[]", body: "", contentType: "application/json", sortOrder: 1
    });
    const fetched: string[] = [];
    const discovered: string[] = [];
    const discoveryResult = { specUrl: "https://new.example.test/schema/openapi.json", discoveryMethod: "configured-url", document: {} };
    const service = new TapirApplicationService({
      workspace, servers, definitions, requestDrafts, serverVariables: unusedServerVariables(), authProfiles: unusedAuthProfiles(), history: unusedHistory(), http: unusedHttp(),
      discovery: {
        async fetch(url) { fetched.push(url); return { ...discoveryResult, specUrl: url }; },
        async discover(url) { discovered.push(url); return discoveryResult; }
      },
      normalizer: fixedNormalizer()
    });

    const updated = await service.updateServerConfiguration({
      serverId: "server-1", name: "New API", baseUrl: "new.example.test/v2", specUrl: "https://new.example.test/schema/openapi.json"
    });
    expect(updated).toMatchObject({ name: "New API", baseUrl: "https://new.example.test/v2", specUrl: "https://new.example.test/schema/openapi.json" });
    await service.refreshServerSchema({ serverId: "server-1" });
    await service.rediscoverServerSchema({ serverId: "server-1" });
    expect(fetched).toEqual(["https://new.example.test/schema/openapi.json"]);
    expect(discovered).toEqual(["https://new.example.test/v2"]);

    const deletion = await service.deleteServer("server-1");
    expect(deletion.detachedDrafts).toMatchObject([{ id: "custom-1", serverInstanceId: null }]);
    await expect(servers.list(workspace.id)).resolves.toEqual([]);
  });

  it("rejects history and draft changes outside the active workspace", async () => {
    const workspace: Workspace = {
      id: "workspace-1",
      name: "Local Workspace",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    };
    const servers = new MemoryServerRepository();
    const requestDrafts = new MemoryRequestDraftRepository();
    const service = new TapirApplicationService({
      workspace,
      servers,
      serverVariables: unusedServerVariables(),
      definitions: new MemoryDefinitionRepository(),
      authProfiles: unusedAuthProfiles(),
      history: unusedHistory(),
      requestDrafts,
      discovery: fixedDiscovery(),
      normalizer: fixedNormalizer(),
      http: unusedHttp()
    });
    await servers.create({
      id: "other-server",
      workspaceId: "workspace-2",
      name: "Other API",
      baseUrl: "https://other.example.test",
      specUrl: "https://other.example.test/openapi.json",
      apiDefinitionSourceId: null
    });
    await requestDrafts.create({
      id: "other-draft",
      workspaceId: "workspace-2",
      serverInstanceId: "other-server",
      sourceType: "custom",
      operationId: null,
      deprecatedAt: null,
      deprecationReason: null,
      name: "Other draft",
      isNameManual: false,
      method: "GET",
      path: "",
      url: "https://other.example.test",
      parametersJson: "[]",
      headersJson: "[]",
      body: "",
      contentType: "application/json",
      sortOrder: 1
    });

    await expect(service.listHistory({ workspaceId: workspace.id, serverId: "other-server" })).rejects.toThrow("Server not found.");
    await expect(service.deleteRequestDraft("other-draft")).rejects.toThrow("Request draft not found.");
    await expect(service.updateRequestDraft({
      draft: {
        id: "other-draft",
        name: "Tampered",
        isNameManual: true,
        method: "GET",
        path: "",
        url: "https://api.example.test",
        parametersJson: "[]",
        headersJson: "[]",
        body: "",
        contentType: "application/json",
        sortOrder: 1
      }
    })).rejects.toThrow("Request draft not found.");
  });
});

class MemoryAuthProfileRepository implements AuthProfileRepository {
  private stored: Array<{ profile: UserAuthProfile; secret: SecretValue }> = [];
  async upsert(input: Parameters<AuthProfileRepository["upsert"]>[0]) {
    const now = "2026-07-01T00:00:00.000Z";
    const stored = {
      profile: { id: `auth-${input.schemeKey}`, workspaceId: input.workspaceId, serverInstanceId: input.serverInstanceId, name: input.name, type: input.type, configJson: JSON.stringify({ schemeKey: input.schemeKey, parameterName: input.parameterName, location: input.location, username: input.username }), secretRef: `secret-${input.schemeKey}`, createdAt: now, updatedAt: now },
      secret: { id: "secret-1", authProfileId: "auth-1", encryptedOrPlainValue: input.secretValue, createdAt: now, updatedAt: now }
    };
    this.stored = [...this.stored.filter((item) => item.profile.name !== input.schemeKey), stored];
    return stored.profile;
  }
  async listForServer(serverInstanceId: string) { return this.stored.filter((item) => item.profile.serverInstanceId === serverInstanceId); }
  async delete(serverInstanceId: string, schemeKey: string) {
    this.stored = this.stored.filter((item) => item.profile.serverInstanceId !== serverInstanceId || item.profile.name !== schemeKey);
  }
}

function testWorkspace(): Workspace {
  return { id: "workspace-1", name: "Local Workspace", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" };
}

class MemoryServerRepository implements ServerRepository {
  private servers: ServerInstance[] = [];

  async create(input: Omit<ServerInstance, "createdAt" | "updatedAt">): Promise<ServerInstance> {
    const now = "2026-07-01T00:00:00.000Z";
    const server = { ...input, createdAt: now, updatedAt: now };
    this.servers.push(server);
    return server;
  }

  async list(workspaceId: string): Promise<ServerInstance[]> {
    return this.servers.filter((server) => server.workspaceId === workspaceId);
  }

  async updateDefinitionSource(serverId: string, sourceId: string): Promise<void> {
    this.servers = this.servers.map((server) => server.id === serverId ? { ...server, apiDefinitionSourceId: sourceId } : server);
  }

  async updateAfterDefinitionRefresh(serverId: string, input: { name: string; specUrl: string; sourceId: string }): Promise<ServerInstance> {
    const existing = this.servers.find((server) => server.id === serverId);
    if (!existing) throw new Error("Server not found.");
    const updated = { ...existing, name: input.name, specUrl: input.specUrl, apiDefinitionSourceId: input.sourceId, updatedAt: "2026-07-01T00:00:00.000Z" };
    this.servers = this.servers.map((server) => server.id === serverId ? updated : server);
    return updated;
  }

  async updateConfiguration(serverId: string, input: { name: string; baseUrl: string; specUrl: string }): Promise<ServerInstance> {
    const existing = this.servers.find((server) => server.id === serverId);
    if (!existing) throw new Error("Server not found.");
    const updated = { ...existing, ...input, updatedAt: "2026-07-01T00:00:00.000Z" };
    this.servers = this.servers.map((server) => server.id === serverId ? updated : server);
    return updated;
  }

  async delete(serverId: string, _options: { detachCustomDrafts: boolean }): Promise<void> {
    this.servers = this.servers.filter((server) => server.id !== serverId);
  }
}

class MemoryDefinitionRepository implements ApiDefinitionRepository {
  private sources: ApiDefinitionSource[] = [];
  private definitions: ApiDefinition[] = [];

  async createSource(input: Omit<ApiDefinitionSource, "createdAt" | "updatedAt">): Promise<ApiDefinitionSource> {
    const now = "2026-07-01T00:00:00.000Z";
    const source = { ...input, createdAt: now, updatedAt: now };
    this.sources.push(source);
    return source;
  }

  async createDefinition(input: ApiDefinition): Promise<ApiDefinition> {
    this.definitions.push(input);
    return input;
  }

  async latestNormalizedForServer(serverId: string): Promise<{ normalizedJson: string } | null> {
    const sourceIds = new Set(this.sources.filter((source) => source.serverInstanceId === serverId).map((source) => source.id));
    const definition = this.definitions.filter((candidate) => sourceIds.has(candidate.sourceId)).at(-1);
    return definition ? { normalizedJson: definition.normalizedJson } : null;
  }

  async setOperations(serverId: string, operations: NormalizedOperation[]): Promise<void> {
    const sourceId = `source-${serverId}-${this.sources.length}`;
    await this.createSource({
      id: sourceId,
      workspaceId: "workspace-1",
      serverInstanceId: serverId,
      sourceUrl: "https://api.example.test/openapi.json",
      discoveryMethod: "test",
      lastFetchedAt: new Date().toISOString()
    });
    await this.createDefinition({
      id: `definition-${this.definitions.length}`,
      sourceId,
      name: "Example API",
      version: "1.0.0",
      rawSpecJson: "{}",
      normalizedJson: JSON.stringify({ name: "Example API", version: "1.0.0", servers: [], operations }),
      fetchedAt: new Date().toISOString()
    });
  }
}

class MemoryRequestDraftRepository implements RequestDraftRepository {
  private drafts: RequestDraft[] = [];

  async create(input: Omit<RequestDraft, "createdAt" | "updatedAt">): Promise<RequestDraft> {
    const draft = { ...input, createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" };
    this.drafts.push(draft);
    return draft;
  }

  async update(input: RequestDraft): Promise<RequestDraft> {
    const updated = { ...input, updatedAt: "2026-07-01T00:00:00.000Z" };
    this.drafts = this.drafts.map((draft) => draft.id === updated.id ? updated : draft);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.drafts = this.drafts.filter((draft) => draft.id !== id);
  }

  async listForWorkspace(workspaceId: string): Promise<RequestDraft[]> {
    return this.drafts.filter((draft) => draft.workspaceId === workspaceId);
  }
}

function fixedDiscovery(): OpenApiDiscoveryService {
  const result = {
        specUrl: "https://localhost:5052/openapi.json",
        discoveryMethod: "/openapi.json",
        document: { openapi: "3.0.3", info: { title: "Example API", version: "1.0.0" }, paths: {} }
      };
  return {
    async discover() { return result; },
    async fetch() { return result; }
  };
}

function fixedNormalizer(): OpenApiNormalizer {
  return {
    normalize() {
      return { name: "Example API", version: "1.0.0", servers: [], operations: [] };
    }
  };
}

function unusedAuthProfiles(): AuthProfileRepository {
  return {
    async upsert() {
      throw new Error("Not used.");
    },
    async listForServer() { return []; },
    async delete() {}
  };
}

function unusedServerVariables(): ServerVariableRepository {
  return {
    async listForServer() {
      return [];
    },
    async replaceForServer() {
      throw new Error("Not used.");
    }
  };
}

function unusedHistory(): HistoryRepository {
  return {
    async create() {
      throw new Error("Not used.");
    },
    async list() { throw new Error("Not used."); },
    async delete() { throw new Error("Not used."); },
    async clear() { throw new Error("Not used."); }
  };
}

function unusedRequestDrafts(): RequestDraftRepository {
  return {
    async create() {
      throw new Error("Not used.");
    },
    async update() {
      throw new Error("Not used.");
    },
    async delete() {
      throw new Error("Not used.");
    },
    async listForWorkspace() {
      throw new Error("Not used.");
    }
  };
}

function unusedHttp(): HttpExecutor {
  return {
    async execute() {
      throw new Error("Not used.");
    }
  };
}
