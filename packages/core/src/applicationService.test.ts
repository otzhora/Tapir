import { describe, expect, it } from "vitest";
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
    const historyEntries: Parameters<HistoryRepository["create"]>[0][] = [];
    const executed: PreparedRequest[] = [];
    const dependencies = {
      workspace, servers, serverVariables: unusedServerVariables(), definitions: new MemoryDefinitionRepository(), authProfiles,
      history: {
        async create(input: Parameters<HistoryRepository["create"]>[0]) { historyEntries.push(input); return { ...input, id: "history-1", createdAt: "2026-07-01T00:00:00.000Z" }; },
        async listForServer() { return []; }
      },
      requestDrafts: unusedRequestDrafts(), discovery: fixedDiscovery(), normalizer: fixedNormalizer(),
      http: { async execute(request: PreparedRequest) { executed.push(request); return { status: 200, headers: {}, body: "ok", durationMs: 1 }; } }
    };
    const service = new TapirApplicationService(dependencies);
    const operation = {
      operationId: "secured", method: "GET" as const, path: "/secured", tags: [], parameters: [], requestBodyMediaTypes: [],
      securityRequirements: [{ ApiKeyAuth: [] }], securitySchemes: [{ key: "ApiKeyAuth", type: "apiKey", name: "x-api-key", in: "header" as const }]
    };

    await expect(service.saveApiKeyHeader({ serverId: "server-1", headerName: "x-api-key", secretValue: "top-secret" })).resolves.toEqual({ type: "apiKeyHeader", headerName: "x-api-key", configured: true });
    const preview = await service.previewOperation({ serverId: "server-1", operation, values: {} });
    expect(preview.request.headers["x-api-key"]).toBe("********");
    expect(preview.redactedRequest.headers["x-api-key"]).toBe("********");
    expect(JSON.stringify(preview)).not.toContain("top-secret");

    const result = await service.callOperation({ serverId: "server-1", operation, values: {} });
    expect(executed[0]?.headers["x-api-key"]).toBe("top-secret");
    expect(result.request.headers["x-api-key"]).toBe("********");
    expect(historyEntries[0]?.requestSnapshotJson).toContain("********");
    expect(historyEntries[0]?.requestSnapshotJson).not.toContain("top-secret");

    const restarted = new TapirApplicationService(dependencies);
    const initial = await restarted.getInitialState();
    expect(initial.servers[0]?.authentication).toEqual({ type: "apiKeyHeader", headerName: "x-api-key", configured: true });
    expect(JSON.stringify(initial)).not.toContain("top-secret");
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

    await expect(service.listHistory("other-server")).rejects.toThrow("Server not found.");
    await expect(service.deleteRequestDraft("other-draft")).rejects.toThrow("Request draft not found.");
    await expect(service.updateRequestDraft({
      draft: {
        id: "other-draft",
        workspaceId: workspace.id,
        serverInstanceId: null,
        sourceType: "custom",
        operationId: null,
        deprecatedAt: null,
        deprecationReason: null,
        name: "Tampered",
        isNameManual: true,
        method: "GET",
        path: "",
        url: "https://api.example.test",
        parametersJson: "[]",
        headersJson: "[]",
        body: "",
        contentType: "application/json",
        sortOrder: 1,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z"
      }
    })).rejects.toThrow("Request draft not found.");
  });
});

class MemoryAuthProfileRepository implements AuthProfileRepository {
  private stored: { profile: UserAuthProfile; secret: SecretValue } | null = null;
  async upsertApiKeyHeader(input: { workspaceId: string; serverInstanceId: string; name: string; headerName: string; secretValue: string }) {
    const now = "2026-07-01T00:00:00.000Z";
    this.stored = {
      profile: { id: "auth-1", workspaceId: input.workspaceId, serverInstanceId: input.serverInstanceId, name: input.name, type: "apiKeyHeader", configJson: JSON.stringify({ headerName: input.headerName }), secretRef: "secret-1", createdAt: now, updatedAt: now },
      secret: { id: "secret-1", authProfileId: "auth-1", encryptedOrPlainValue: input.secretValue, createdAt: now, updatedAt: now }
    };
    return this.stored.profile;
  }
  async getForServer(serverInstanceId: string) { return this.stored?.profile.serverInstanceId === serverInstanceId ? this.stored : null; }
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

  async latestForServer(serverId: string): Promise<ApiDefinition | null> {
    const sourceIds = new Set(this.sources.filter((source) => source.serverInstanceId === serverId).map((source) => source.id));
    return this.definitions.filter((definition) => sourceIds.has(definition.sourceId)).at(-1) ?? null;
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
  return {
    async discover() {
      return {
        specUrl: "https://localhost:5052/openapi.json",
        discoveryMethod: "/openapi.json",
        document: { openapi: "3.0.3", info: { title: "Example API", version: "1.0.0" }, paths: {} }
      };
    }
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
    async upsertApiKeyHeader() {
      throw new Error("Not used.");
    },
    async getForServer() {
      return null;
    }
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
    async listForServer() {
      throw new Error("Not used.");
    }
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
