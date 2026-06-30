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
}

class MemoryDefinitionRepository implements ApiDefinitionRepository {
  async createSource(input: Omit<ApiDefinitionSource, "createdAt" | "updatedAt">): Promise<ApiDefinitionSource> {
    const now = "2026-07-01T00:00:00.000Z";
    return { ...input, createdAt: now, updatedAt: now };
  }

  async createDefinition(input: ApiDefinition): Promise<ApiDefinition> {
    return input;
  }

  async latestForServer(): Promise<ApiDefinition | null> {
    return null;
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

function unusedHttp(): HttpExecutor {
  return {
    async execute() {
      throw new Error("Not used.");
    }
  };
}
