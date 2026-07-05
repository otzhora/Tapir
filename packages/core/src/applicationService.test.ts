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
  ServerInstance,
  ServerRepository,
  Workspace
} from "./index.js";

describe("TapirApplicationService", () => {
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
});

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
