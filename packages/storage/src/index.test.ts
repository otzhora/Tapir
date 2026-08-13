import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createLocalTapirStorage,
  ensureDefaultWorkspace,
  openTapirDatabase,
  SqliteApiDefinitionRepository,
  SqliteAuthProfileRepository,
  SqliteHistoryRepository,
  SqliteRequestDraftRepository,
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
  it("rolls back aggregate writes when a transaction fails", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "tapir-storage-"));
    const storage = await createLocalTapirStorage(join(tempDir, "tapir.sqlite"));
    db = storage.db;
    await expect(storage.transaction.run(async () => {
      await storage.servers.create({
        id: "rolled-back-server",
        workspaceId: storage.workspace.id,
        name: "Temporary",
        baseUrl: "https://example.test",
        specUrl: "https://example.test/openapi.json",
        apiDefinitionSourceId: null
      });
      throw new Error("stop");
    })).rejects.toThrow("stop");
    await expect(storage.servers.list(storage.workspace.id)).resolves.toEqual([]);
  });
  it("runs migrations and records them", async () => {
    const db = await createDatabase();

    const migrations = db.prepare("select name from schema_migrations").all() as Array<{ name: string }>;

    expect(migrations).toEqual([
      { name: "0001_initial_schema" },
      { name: "0002_request_drafts" },
      { name: "0003_history_request_draft_id" },
      { name: "0004_request_draft_deprecation" },
      { name: "0005_server_variables" },
      { name: "0006_workspace_history" }
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
    const requestDrafts = new SqliteRequestDraftRepository(db);

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
      requestMethod: "GET",
      requestUrl: "https://api.example.test/pets",
      draftName: null,
      responseStatus: 200,
      responseHeadersJson: "{}",
      responseBody: "[]",
      durationMs: 42
    });
    await requestDrafts.create({
      id: "draft-1", workspaceId: workspace.id, serverInstanceId: server.id, sourceType: "openapi", operationId: "listPets",
      deprecatedAt: null, deprecationReason: null, name: "List pets", isNameManual: false, method: "GET", path: "/pets", url: "",
      parametersJson: "[]", headersJson: "[]", body: "", contentType: "application/json", sortOrder: 1
    });
    await requestDrafts.create({
      id: "custom-1", workspaceId: workspace.id, serverInstanceId: server.id, sourceType: "custom", operationId: null,
      deprecatedAt: null, deprecationReason: null, name: "Custom check", isNameManual: true, method: "GET", path: "", url: "https://api.example.test/status",
      parametersJson: "[]", headersJson: "[]", body: "", contentType: "application/json", sortOrder: 2
    });

    await expect(servers.list(workspace.id)).resolves.toHaveLength(1);
    await expect(definitions.latestNormalizedForServer(server.id)).resolves.toEqual({
      normalizedJson: JSON.stringify({ name: "Example API", version: "1.0.0", operations: [] })
    });
    await expect(serverVariables.listForServer(server.id)).resolves.toMatchObject([
      { key: "baseUrl", value: "https://api.example.test" }
    ]);
    await expect(authProfiles.listForServer(server.id)).resolves.toMatchObject([{
      profile: { type: "apiKey" }, secret: { encryptedOrPlainValue: "secret" }
    }]);
    await expect(history.list({ workspaceId: workspace.id, serverId: server.id })).resolves.toMatchObject({ entries: [
      { operationId: "listPets", requestMethod: "GET", requestUrl: "https://api.example.test/pets", responseStatus: 200, durationMs: 42 }
    ], nextCursor: null });

    const updated = await servers.updateConfiguration(server.id, {
      name: "Renamed API",
      baseUrl: "https://api.example.test/v2",
      specUrl: "https://api.example.test/v2/openapi.json"
    });
    expect(updated).toMatchObject({ name: "Renamed API", baseUrl: "https://api.example.test/v2", specUrl: "https://api.example.test/v2/openapi.json" });

    await servers.delete(server.id, { detachCustomDrafts: true });
    for (const table of ["server_instances", "server_variables", "api_definition_sources", "api_definitions", "user_auth_profiles", "secret_values", "call_history_entries"]) {
      expect((db.prepare(`select count(*) as count from ${table}`).get() as { count: number }).count, table).toBe(0);
    }
    await expect(requestDrafts.listForWorkspace(workspace.id)).resolves.toMatchObject([{ id: "custom-1", serverInstanceId: null }]);
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

  it("paginates, filters, searches, and deletes workspace history including standalone calls", async () => {
    const database = await createDatabase();
    const workspace = ensureDefaultWorkspace(database);
    const server = await new SqliteServerRepository(database).create({
      id: "server-history", workspaceId: workspace.id, name: "History API", baseUrl: "https://history.example.test",
      specUrl: "https://history.example.test/openapi.json", apiDefinitionSourceId: null
    });
    const drafts = new SqliteRequestDraftRepository(database);
    const draft = await drafts.create({
      id: "draft-health", workspaceId: workspace.id, serverInstanceId: null, sourceType: "custom", operationId: null,
      deprecatedAt: null, deprecationReason: null, name: "Health check", isNameManual: true, method: "GET", path: "", url: "https://standalone.example.test/health",
      parametersJson: "[]", headersJson: "[]", body: "", contentType: "application/json", sortOrder: 1
    });
    const history = new SqliteHistoryRepository(database);
    const entries = [];
    entries.push(await history.create({ ...historyInput(workspace.id, server.id, null, "GET", "https://history.example.test/pets", 200), operationId: "listPets" }));
    entries.push(await history.create({ ...historyInput(workspace.id, null, draft.id, "GET", "https://standalone.example.test/health", 204), draftName: "Health check" }));
    entries.push(await history.create(historyInput(workspace.id, server.id, null, "POST", "https://history.example.test/orders", 201)));
    entries.push(await history.create(historyInput(workspace.id, server.id, null, "GET", "https://history.example.test/failures", 500)));
    entries.forEach((entry, index) => database.prepare("update call_history_entries set created_at = ? where id = ?")
      .run(`2026-07-01T00:00:0${index + 1}.000Z`, entry.id));

    const first = await history.list({ workspaceId: workspace.id, limit: 2 });
    const newest = await history.create(historyInput(workspace.id, server.id, null, "GET", "https://history.example.test/newest", 200));
    database.prepare("update call_history_entries set created_at = ? where id = ?").run("2026-07-01T00:00:05.000Z", newest.id);
    const second = await history.list({ workspaceId: workspace.id, limit: 2, cursor: first.nextCursor ?? undefined });
    expect(first.entries).toHaveLength(2);
    expect(second.entries).toHaveLength(2);
    expect(new Set([...first.entries, ...second.entries].map((entry) => entry.id)).size).toBe(4);
    expect([...first.entries, ...second.entries].map((entry) => entry.id)).not.toContain(newest.id);
    await expect(history.list({ workspaceId: workspace.id, serverId: null })).resolves.toMatchObject({ entries: [{ draftName: "Health check" }] });
    await expect(history.list({ workspaceId: workspace.id, method: "POST", status: 201 })).resolves.toMatchObject({ entries: [{ requestUrl: "https://history.example.test/orders" }] });
    await expect(history.list({ workspaceId: workspace.id, operationId: "listPets" })).resolves.toMatchObject({ entries: [{ id: entries[0]?.id }] });
    await expect(history.list({ workspaceId: workspace.id, requestDraftId: draft.id })).resolves.toMatchObject({ entries: [{ id: entries[1]?.id }] });
    await expect(history.list({ workspaceId: workspace.id, createdAfter: "2026-07-01T00:00:03.500Z", createdBefore: "2026-07-01T00:00:04.500Z" })).resolves.toMatchObject({ entries: [{ id: entries[3]?.id }] });
    await drafts.delete(draft.id);
    await expect(history.list({ workspaceId: workspace.id, search: "Health check" })).resolves.toMatchObject({ entries: [{ id: entries[1]?.id }] });

    await history.delete(workspace.id, entries[0]!.id);
    expect((await history.list({ workspaceId: workspace.id })).entries.map((entry) => entry.id)).not.toContain(entries[0]!.id);
    await expect(history.clear({ workspaceId: workspace.id, serverId: null })).resolves.toBe(1);
    await expect(history.list({ workspaceId: workspace.id, serverId: null })).resolves.toMatchObject({ entries: [] });

    const largeBody = "x".repeat(1_000_010);
    const retained = await history.create({ ...historyInput(workspace.id, server.id, null, "GET", "https://history.example.test/large", 200), responseBody: largeBody });
    expect(retained.responseBody).toHaveLength(1_000_049);
    expect(retained.responseBody?.endsWith("[Tapir truncated this stored history response.]")).toBe(true);
  });
});

async function createDatabase(): Promise<SqliteDatabase> {
  tempDir = await mkdtemp(join(tmpdir(), "tapir-storage-"));
  db = await openTapirDatabase(join(tempDir, "tapir.sqlite"));
  return db;
}

function historyInput(
  workspaceId: string,
  serverInstanceId: string | null,
  requestDraftId: string | null,
  requestMethod: "GET" | "POST",
  requestUrl: string,
  responseStatus: number
) {
  return {
    workspaceId, serverInstanceId, operationId: null, requestDraftId,
    requestSnapshotJson: JSON.stringify({ method: requestMethod, url: requestUrl, headers: {} }),
    requestMethod, requestUrl, draftName: null, responseStatus, responseHeadersJson: "{}", responseBody: "", durationMs: 1
  };
}
