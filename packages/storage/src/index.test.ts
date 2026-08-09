import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureDefaultWorkspace,
  openTapirDatabase,
  SqliteApiDefinitionRepository,
  SqliteAuthProfileRepository,
  SqliteHistoryRepository,
  SqliteServerVariableRepository,
  SqliteServerRepository,
  type SqliteDatabase
} from "./index";

let tempDir: string | null = null;
let db: SqliteDatabase | null = null;

afterEach(async () => {
  db?.close();
  db = null;
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("SQLite storage", () => {
  it("runs migrations and records them", async () => {
    const db = await createDatabase();

    const migrations = db.prepare("select name from schema_migrations").all() as Array<{ name: string }>;

    expect(migrations).toEqual([
      { name: "0001_initial_schema" },
      { name: "0002_request_drafts" },
      { name: "0003_history_request_draft_id" },
      { name: "0004_request_draft_deprecation" },
      { name: "0005_server_variables" }
    ]);
  });

  it("round-trips server, definition, auth, and history records", async () => {
    const db = await createDatabase();
    const workspace = ensureDefaultWorkspace(db);
    const servers = new SqliteServerRepository(db);
    const definitions = new SqliteApiDefinitionRepository(db);
    const serverVariables = new SqliteServerVariableRepository(db);
    const authProfiles = new SqliteAuthProfileRepository(db);
    const history = new SqliteHistoryRepository(db);

    const server = await servers.create({
      id: "server-1",
      workspaceId: workspace.id,
      name: "Example API",
      baseUrl: "https://api.example.test",
      specUrl: "https://api.example.test/swagger/v1/swagger.json",
      apiDefinitionSourceId: null
    });
    const source = await definitions.createSource({
      id: "source-1",
      workspaceId: workspace.id,
      serverInstanceId: server.id,
      sourceUrl: server.specUrl,
      discoveryMethod: "/swagger/v1/swagger.json",
      lastFetchedAt: "2026-06-29T00:00:00.000Z"
    });
    await servers.updateDefinitionSource(server.id, source.id);
    await definitions.createDefinition({
      id: "definition-1",
      sourceId: source.id,
      name: "Example API",
      version: "1.0.0",
      rawSpecJson: "{}",
      normalizedJson: JSON.stringify({ name: "Example API", version: "1.0.0", operations: [] }),
      fetchedAt: "2026-06-29T00:00:00.000Z"
    });
    await authProfiles.upsert({
      workspaceId: workspace.id,
      serverInstanceId: server.id,
      schemeKey: "ApiKeyAuth",
      type: "apiKey",
      name: "x-api-key",
      parameterName: "x-api-key",
      location: "header",
      secretValue: "secret"
    });
    await serverVariables.replaceForServer({
      workspaceId: workspace.id,
      serverInstanceId: server.id,
      variables: [{ key: "baseUrl", value: "https://api.example.test" }]
    });
    await history.create({
      workspaceId: workspace.id,
      serverInstanceId: server.id,
      operationId: "listPets",
      requestDraftId: null,
      requestSnapshotJson: "{}",
      responseStatus: 200,
      responseHeadersJson: "{}",
      responseBody: "[]",
      durationMs: 42
    });

    await expect(servers.list(workspace.id)).resolves.toHaveLength(1);
    await expect(definitions.latestForServer(server.id)).resolves.toMatchObject({ name: "Example API" });
    await expect(serverVariables.listForServer(server.id)).resolves.toMatchObject([
      { key: "baseUrl", value: "https://api.example.test" }
    ]);
    await expect(authProfiles.listForServer(server.id)).resolves.toMatchObject([{
      profile: { type: "apiKey" }, secret: { encryptedOrPlainValue: "secret" }
    }]);
    await expect(history.listForServer(server.id)).resolves.toMatchObject([
      { operationId: "listPets", responseStatus: 200, durationMs: 42 }
    ]);
  });

  it("rejects duplicate variable keys for a server", async () => {
    const db = await createDatabase();
    const workspace = ensureDefaultWorkspace(db);
    const servers = new SqliteServerRepository(db);
    const serverVariables = new SqliteServerVariableRepository(db);
    const server = await servers.create({
      id: "server-1",
      workspaceId: workspace.id,
      name: "Example API",
      baseUrl: "https://api.example.test",
      specUrl: "https://api.example.test/openapi.json",
      apiDefinitionSourceId: null
    });

    await expect(serverVariables.replaceForServer({
      workspaceId: workspace.id,
      serverInstanceId: server.id,
      variables: [
        { key: "token", value: "first" },
        { key: "TOKEN", value: "second" }
      ]
    })).rejects.toThrow("Variable TOKEN is already defined for this server.");
  });

  it("loads legacy header API-key profiles without rewriting or losing their secrets", async () => {
    const database = await createDatabase();
    const workspace = ensureDefaultWorkspace(database);
    const server = await new SqliteServerRepository(database).create({
      id: "server-legacy",
      workspaceId: workspace.id,
      name: "Legacy API",
      baseUrl: "https://legacy.example.test",
      specUrl: "https://legacy.example.test/openapi.json",
      apiDefinitionSourceId: null
    });
    const now = "2026-07-01T00:00:00.000Z";
    database.prepare(`
      insert into user_auth_profiles (id, workspace_id, server_instance_id, name, type, config_json, secret_ref, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("legacy-profile", workspace.id, server.id, "x-api-key", "apiKeyHeader", JSON.stringify({ headerName: "x-api-key" }), "legacy-secret", now, now);
    database.prepare(`
      insert into secret_values (id, auth_profile_id, encrypted_or_plain_value, created_at, updated_at)
      values (?, ?, ?, ?, ?)
    `).run("legacy-secret", "legacy-profile", "safeStorage:v1:legacy-value", now, now);

    await expect(new SqliteAuthProfileRepository(database).listForServer(server.id)).resolves.toMatchObject([{
      profile: { type: "apiKeyHeader", configJson: JSON.stringify({ headerName: "x-api-key" }) },
      secret: { encryptedOrPlainValue: "safeStorage:v1:legacy-value" }
    }]);
  });
});

async function createDatabase(): Promise<SqliteDatabase> {
  tempDir = await mkdtemp(join(tmpdir(), "tapir-storage-"));
  db = await openTapirDatabase(join(tempDir, "tapir.sqlite"));
  return db;
}
