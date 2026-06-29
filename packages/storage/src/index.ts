import Database from "better-sqlite3";
import { runMigrations } from "./migrations";
import type {
  ApiDefinition,
  ApiDefinitionRepository,
  ApiDefinitionSource,
  AuthProfileRepository,
  CallHistoryEntry,
  HistoryRepository,
  SecretValue,
  ServerInstance,
  ServerRepository,
  UserAuthProfile,
  Workspace
} from "@tapir/core";

export type SqliteDatabase = Database.Database;

export async function openTapirDatabase(filePath: string): Promise<SqliteDatabase> {
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  await runMigrations(db);
  return db;
}

export function ensureDefaultWorkspace(db: SqliteDatabase): Workspace {
  const existing = db.prepare("select * from workspaces order by created_at limit 1").get() as DbWorkspace | undefined;
  if (existing) return mapWorkspace(existing);

  const now = new Date().toISOString();
  const workspace: Workspace = { id: crypto.randomUUID(), name: "Local Workspace", createdAt: now, updatedAt: now };
  db.prepare("insert into workspaces (id, name, created_at, updated_at) values (?, ?, ?, ?)")
    .run(workspace.id, workspace.name, workspace.createdAt, workspace.updatedAt);
  return workspace;
}

export class SqliteServerRepository implements ServerRepository {
  constructor(private db: SqliteDatabase) {}

  async create(input: Omit<ServerInstance, "createdAt" | "updatedAt">): Promise<ServerInstance> {
    const now = new Date().toISOString();
    const server: ServerInstance = { ...input, createdAt: now, updatedAt: now };
    this.db.prepare(`
      insert into server_instances (id, workspace_id, name, base_url, spec_url, api_definition_source_id, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(server.id, server.workspaceId, server.name, server.baseUrl, server.specUrl, server.apiDefinitionSourceId, server.createdAt, server.updatedAt);
    return server;
  }

  async list(workspaceId: string): Promise<ServerInstance[]> {
    const rows = this.db.prepare("select * from server_instances where workspace_id = ? order by created_at desc").all(workspaceId) as DbServer[];
    return rows.map(mapServer);
  }

  async updateDefinitionSource(serverId: string, sourceId: string): Promise<void> {
    this.db.prepare("update server_instances set api_definition_source_id = ?, updated_at = ? where id = ?")
      .run(sourceId, new Date().toISOString(), serverId);
  }
}

export class SqliteApiDefinitionRepository implements ApiDefinitionRepository {
  constructor(private db: SqliteDatabase) {}

  async createSource(input: Omit<ApiDefinitionSource, "createdAt" | "updatedAt">): Promise<ApiDefinitionSource> {
    const now = new Date().toISOString();
    const source: ApiDefinitionSource = { ...input, createdAt: now, updatedAt: now };
    this.db.prepare(`
      insert into api_definition_sources (id, workspace_id, server_instance_id, source_url, discovery_method, last_fetched_at, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(source.id, source.workspaceId, source.serverInstanceId, source.sourceUrl, source.discoveryMethod, source.lastFetchedAt, source.createdAt, source.updatedAt);
    return source;
  }

  async createDefinition(input: ApiDefinition): Promise<ApiDefinition> {
    this.db.prepare(`
      insert into api_definitions (id, source_id, name, version, raw_spec_json, normalized_json, fetched_at)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(input.id, input.sourceId, input.name, input.version, input.rawSpecJson, input.normalizedJson, input.fetchedAt);
    return input;
  }

  async latestForServer(serverId: string): Promise<ApiDefinition | null> {
    const row = this.db.prepare(`
      select d.* from api_definitions d
      join api_definition_sources s on s.id = d.source_id
      where s.server_instance_id = ?
      order by d.fetched_at desc
      limit 1
    `).get(serverId) as DbDefinition | undefined;
    return row ? mapDefinition(row) : null;
  }
}

export class SqliteAuthProfileRepository implements AuthProfileRepository {
  constructor(private db: SqliteDatabase) {}

  async upsertApiKeyHeader(input: {
    workspaceId: string;
    serverInstanceId: string;
    name: string;
    headerName: string;
    secretValue: string;
  }): Promise<UserAuthProfile> {
    const existing = this.db.prepare("select * from user_auth_profiles where server_instance_id = ? and type = 'apiKeyHeader' limit 1")
      .get(input.serverInstanceId) as DbAuthProfile | undefined;
    const now = new Date().toISOString();

    if (existing) {
      this.db.prepare("update user_auth_profiles set name = ?, config_json = ?, updated_at = ? where id = ?")
        .run(input.name, JSON.stringify({ headerName: input.headerName }), now, existing.id);
      this.db.prepare("update secret_values set encrypted_or_plain_value = ?, updated_at = ? where auth_profile_id = ?")
        .run(input.secretValue, now, existing.id);
      const updated = this.db.prepare("select * from user_auth_profiles where id = ?").get(existing.id) as DbAuthProfile;
      return mapAuthProfile(updated);
    }

    const profile: UserAuthProfile = {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      serverInstanceId: input.serverInstanceId,
      name: input.name,
      type: "apiKeyHeader",
      configJson: JSON.stringify({ headerName: input.headerName }),
      secretRef: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.db.prepare(`
      insert into user_auth_profiles (id, workspace_id, server_instance_id, name, type, config_json, secret_ref, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(profile.id, profile.workspaceId, profile.serverInstanceId, profile.name, profile.type, profile.configJson, profile.secretRef, profile.createdAt, profile.updatedAt);
    this.db.prepare(`
      insert into secret_values (id, auth_profile_id, encrypted_or_plain_value, created_at, updated_at)
      values (?, ?, ?, ?, ?)
    `).run(profile.secretRef, profile.id, input.secretValue, now, now);
    return profile;
  }

  async getForServer(serverInstanceId: string): Promise<{ profile: UserAuthProfile; secret: SecretValue } | null> {
    const profileRow = this.db.prepare("select * from user_auth_profiles where server_instance_id = ? order by updated_at desc limit 1")
      .get(serverInstanceId) as DbAuthProfile | undefined;
    if (!profileRow) return null;
    const secretRow = this.db.prepare("select * from secret_values where auth_profile_id = ? limit 1")
      .get(profileRow.id) as DbSecret | undefined;
    if (!secretRow) return null;
    return { profile: mapAuthProfile(profileRow), secret: mapSecret(secretRow) };
  }
}

export class SqliteHistoryRepository implements HistoryRepository {
  constructor(private db: SqliteDatabase) {}

  async create(input: Omit<CallHistoryEntry, "id" | "createdAt">): Promise<CallHistoryEntry> {
    const entry: CallHistoryEntry = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.db.prepare(`
      insert into call_history_entries
      (id, workspace_id, server_instance_id, operation_id, request_snapshot_json, response_status, response_headers_json, response_body, duration_ms, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(entry.id, entry.workspaceId, entry.serverInstanceId, entry.operationId, entry.requestSnapshotJson, entry.responseStatus, entry.responseHeadersJson, entry.responseBody, entry.durationMs, entry.createdAt);
    return entry;
  }

  async listForServer(serverInstanceId: string): Promise<CallHistoryEntry[]> {
    const rows = this.db.prepare("select * from call_history_entries where server_instance_id = ? order by created_at desc limit 50")
      .all(serverInstanceId) as DbHistory[];
    return rows.map(mapHistory);
  }
}

type DbWorkspace = { id: string; name: string; created_at: string; updated_at: string };
type DbServer = { id: string; workspace_id: string; name: string; base_url: string; spec_url: string; api_definition_source_id: string | null; created_at: string; updated_at: string };
type DbDefinition = { id: string; source_id: string; name: string; version: string; raw_spec_json: string; normalized_json: string; fetched_at: string };
type DbAuthProfile = { id: string; workspace_id: string; server_instance_id: string | null; name: string; type: "apiKeyHeader"; config_json: string; secret_ref: string; created_at: string; updated_at: string };
type DbSecret = { id: string; auth_profile_id: string; encrypted_or_plain_value: string; created_at: string; updated_at: string };
type DbHistory = { id: string; workspace_id: string; server_instance_id: string; operation_id: string | null; request_snapshot_json: string; response_status: number | null; response_headers_json: string | null; response_body: string | null; duration_ms: number | null; created_at: string };

function mapWorkspace(row: DbWorkspace): Workspace {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapServer(row: DbServer): ServerInstance {
  return { id: row.id, workspaceId: row.workspace_id, name: row.name, baseUrl: row.base_url, specUrl: row.spec_url, apiDefinitionSourceId: row.api_definition_source_id, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapDefinition(row: DbDefinition): ApiDefinition {
  return { id: row.id, sourceId: row.source_id, name: row.name, version: row.version, rawSpecJson: row.raw_spec_json, normalizedJson: row.normalized_json, fetchedAt: row.fetched_at };
}

function mapAuthProfile(row: DbAuthProfile): UserAuthProfile {
  return { id: row.id, workspaceId: row.workspace_id, serverInstanceId: row.server_instance_id, name: row.name, type: row.type, configJson: row.config_json, secretRef: row.secret_ref, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapSecret(row: DbSecret): SecretValue {
  return { id: row.id, authProfileId: row.auth_profile_id, encryptedOrPlainValue: row.encrypted_or_plain_value, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapHistory(row: DbHistory): CallHistoryEntry {
  return { id: row.id, workspaceId: row.workspace_id, serverInstanceId: row.server_instance_id, operationId: row.operation_id, requestSnapshotJson: row.request_snapshot_json, responseStatus: row.response_status, responseHeadersJson: row.response_headers_json, responseBody: row.response_body, durationMs: row.duration_ms, createdAt: row.created_at };
}
