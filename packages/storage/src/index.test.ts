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
      { name: "0003_history_request_draft_id" }
    ]);
  });

  it("round-trips server, definition, auth, and history records", async () => {
    const db = await createDatabase();
    const workspace = ensureDefaultWorkspace(db);
    const servers = new SqliteServerRepository(db);
    const definitions = new SqliteApiDefinitionRepository(db);
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
    await authProfiles.upsertApiKeyHeader({
      workspaceId: workspace.id,
      serverInstanceId: server.id,
      name: "x-api-key",
      headerName: "x-api-key",
      secretValue: "secret"
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
    await expect(authProfiles.getForServer(server.id)).resolves.toMatchObject({
      profile: { configJson: JSON.stringify({ headerName: "x-api-key" }) },
      secret: { encryptedOrPlainValue: "secret" }
    });
    await expect(history.listForServer(server.id)).resolves.toMatchObject([
      { operationId: "listPets", responseStatus: 200, durationMs: 42 }
    ]);
  });
});

async function createDatabase(): Promise<SqliteDatabase> {
  tempDir = await mkdtemp(join(tmpdir(), "tapir-storage-"));
  db = await openTapirDatabase(join(tempDir, "tapir.sqlite"));
  return db;
}
