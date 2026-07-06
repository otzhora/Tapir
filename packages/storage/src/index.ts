import Database from "better-sqlite3";
import { runMigrations } from "./migrations.js";
import type {
  ApiDefinition,
  ApiDefinitionRepository,
  ApiDefinitionSource,
  AuthProfileRepository,
  CallHistoryEntry,
  HistoryRepository,
  RequestDraft,
  RequestDraftRepository,
  SecretValue,
  ServerInstance,
  ServerVariable,
  ServerVariableRepository,
  ServerRepository,
  UserAuthProfile,
  Workspace
} from "@tapir/core";

export type SqliteDatabase = Database.Database;

export interface LocalTapirStorage {
  db: SqliteDatabase;
  workspace: Workspace;
  servers: ServerRepository;
  serverVariables: ServerVariableRepository;
  definitions: ApiDefinitionRepository;
  authProfiles: AuthProfileRepository;
  history: HistoryRepository;
  requestDrafts: RequestDraftRepository;
}

export interface LocalTapirStorageOptions {
  nativeBinding?: string;
}

const maxStoredHistoryBodyCharacters = 1_000_000;

export async function openTapirDatabase(filePath: string, options: LocalTapirStorageOptions = {}): Promise<SqliteDatabase> {
  const db = new Database(filePath, { nativeBinding: options.nativeBinding });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  await runMigrations(db);
  return db;
}

export async function createLocalTapirStorage(filePath: string, options: LocalTapirStorageOptions = {}): Promise<LocalTapirStorage> {
  const db = await openTapirDatabase(filePath, options);
  const workspace = ensureDefaultWorkspace(db);
  return {
    db,
    workspace,
    servers: new SqliteServerRepository(db),
    serverVariables: new SqliteServerVariableRepository(db),
    definitions: new SqliteApiDefinitionRepository(db),
    authProfiles: new SqliteAuthProfileRepository(db),
    history: new SqliteHistoryRepository(db),
    requestDrafts: new SqliteRequestDraftRepository(db)
  };
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

  async updateAfterDefinitionRefresh(serverId: string, input: { name: string; specUrl: string; sourceId: string }): Promise<ServerInstance> {
    this.db.prepare(`
      update server_instances
      set name = ?, spec_url = ?, api_definition_source_id = ?, updated_at = ?
      where id = ?
    `).run(input.name, input.specUrl, input.sourceId, new Date().toISOString(), serverId);
    const row = this.db.prepare("select * from server_instances where id = ?").get(serverId) as DbServer | undefined;
    if (!row) throw new Error("Server not found.");
    return mapServer(row);
  }

  async updateDefinitionSource(serverId: string, sourceId: string): Promise<void> {
    this.db.prepare("update server_instances set api_definition_source_id = ?, updated_at = ? where id = ?")
      .run(sourceId, new Date().toISOString(), serverId);
  }
}

export class SqliteServerVariableRepository implements ServerVariableRepository {
  constructor(private db: SqliteDatabase) {}

  async listForServer(serverInstanceId: string): Promise<ServerVariable[]> {
    const rows = this.db.prepare("select * from server_variables where server_instance_id = ? order by key collate nocase")
      .all(serverInstanceId) as DbServerVariable[];
    return rows.map(mapServerVariable);
  }

  async replaceForServer(input: {
    workspaceId: string;
    serverInstanceId: string;
    variables: Array<{ id?: string; key: string; value: string }>;
  }): Promise<ServerVariable[]> {
    const now = new Date().toISOString();
    const variables = input.variables
      .map((variable) => ({ ...variable, key: variable.key.trim() }))
      .filter((variable) => variable.key);
    const duplicate = findDuplicateKey(variables.map((variable) => variable.key));
    if (duplicate) throw new Error(`Variable ${duplicate} is already defined for this server.`);

    this.db.transaction(() => {
      this.db.prepare("delete from server_variables where server_instance_id = ?").run(input.serverInstanceId);
      const insert = this.db.prepare(`
        insert into server_variables (id, workspace_id, server_instance_id, key, value, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const variable of variables) {
        insert.run(
          variable.id || crypto.randomUUID(),
          input.workspaceId,
          input.serverInstanceId,
          variable.key,
          variable.value,
          now,
          now
        );
      }
    })();

    return this.listForServer(input.serverInstanceId);
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
    const entry: CallHistoryEntry = {
      ...input,
      responseBody: truncateHistoryBody(input.responseBody),
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    this.db.prepare(`
      insert into call_history_entries
      (id, workspace_id, server_instance_id, operation_id, request_draft_id, request_snapshot_json, response_status, response_headers_json, response_body, duration_ms, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(entry.id, entry.workspaceId, entry.serverInstanceId, entry.operationId, entry.requestDraftId, entry.requestSnapshotJson, entry.responseStatus, entry.responseHeadersJson, entry.responseBody, entry.durationMs, entry.createdAt);
    return entry;
  }

  async listForServer(serverInstanceId: string): Promise<CallHistoryEntry[]> {
    const rows = this.db.prepare("select * from call_history_entries where server_instance_id = ? order by created_at desc limit 50")
      .all(serverInstanceId) as DbHistory[];
    return rows.map(mapHistory);
  }
}

export class SqliteRequestDraftRepository implements RequestDraftRepository {
  constructor(private db: SqliteDatabase) {}

  async create(input: Omit<RequestDraft, "createdAt" | "updatedAt">): Promise<RequestDraft> {
    const now = new Date().toISOString();
    const draft: RequestDraft = { ...input, createdAt: now, updatedAt: now };
    this.db.prepare(`
      insert into request_drafts
      (id, workspace_id, server_instance_id, source_type, operation_id, deprecated_at, deprecation_reason, name, is_name_manual, method, path, url, parameters_json, headers_json, body, content_type, sort_order, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      draft.id,
      draft.workspaceId,
      draft.serverInstanceId,
      draft.sourceType,
      draft.operationId,
      draft.deprecatedAt,
      draft.deprecationReason,
      draft.name,
      draft.isNameManual ? 1 : 0,
      draft.method,
      draft.path,
      draft.url,
      draft.parametersJson,
      draft.headersJson,
      draft.body,
      draft.contentType,
      draft.sortOrder,
      draft.createdAt,
      draft.updatedAt
    );
    return draft;
  }

  async update(input: RequestDraft): Promise<RequestDraft> {
    const draft: RequestDraft = { ...input, updatedAt: new Date().toISOString() };
    this.db.prepare(`
      update request_drafts
      set server_instance_id = ?,
          source_type = ?,
          operation_id = ?,
          deprecated_at = ?,
          deprecation_reason = ?,
          name = ?,
          is_name_manual = ?,
          method = ?,
          path = ?,
          url = ?,
          parameters_json = ?,
          headers_json = ?,
          body = ?,
          content_type = ?,
          sort_order = ?,
          updated_at = ?
      where id = ?
    `).run(
      draft.serverInstanceId,
      draft.sourceType,
      draft.operationId,
      draft.deprecatedAt,
      draft.deprecationReason,
      draft.name,
      draft.isNameManual ? 1 : 0,
      draft.method,
      draft.path,
      draft.url,
      draft.parametersJson,
      draft.headersJson,
      draft.body,
      draft.contentType,
      draft.sortOrder,
      draft.updatedAt,
      draft.id
    );
    return draft;
  }

  async delete(id: string): Promise<void> {
    this.db.prepare("delete from request_drafts where id = ?").run(id);
  }

  async listForWorkspace(workspaceId: string): Promise<RequestDraft[]> {
    const rows = this.db.prepare("select * from request_drafts where workspace_id = ? order by sort_order asc, created_at asc")
      .all(workspaceId) as DbRequestDraft[];
    return rows.map(mapRequestDraft);
  }
}

type DbWorkspace = { id: string; name: string; created_at: string; updated_at: string };
type DbServer = { id: string; workspace_id: string; name: string; base_url: string; spec_url: string; api_definition_source_id: string | null; created_at: string; updated_at: string };
type DbServerVariable = { id: string; workspace_id: string; server_instance_id: string; key: string; value: string; created_at: string; updated_at: string };
type DbDefinition = { id: string; source_id: string; name: string; version: string; raw_spec_json: string; normalized_json: string; fetched_at: string };
type DbAuthProfile = { id: string; workspace_id: string; server_instance_id: string | null; name: string; type: "apiKeyHeader"; config_json: string; secret_ref: string; created_at: string; updated_at: string };
type DbSecret = { id: string; auth_profile_id: string; encrypted_or_plain_value: string; created_at: string; updated_at: string };
type DbHistory = { id: string; workspace_id: string; server_instance_id: string; operation_id: string | null; request_draft_id: string | null; request_snapshot_json: string; response_status: number | null; response_headers_json: string | null; response_body: string | null; duration_ms: number | null; created_at: string };
type DbRequestDraft = {
  id: string;
  workspace_id: string;
  server_instance_id: string | null;
  source_type: "openapi" | "custom";
  operation_id: string | null;
  deprecated_at: string | null;
  deprecation_reason: string | null;
  name: string;
  is_name_manual: number;
  method: RequestDraft["method"];
  path: string;
  url: string;
  parameters_json: string;
  headers_json: string;
  body: string;
  content_type: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function mapWorkspace(row: DbWorkspace): Workspace {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapServer(row: DbServer): ServerInstance {
  return { id: row.id, workspaceId: row.workspace_id, name: row.name, baseUrl: row.base_url, specUrl: row.spec_url, apiDefinitionSourceId: row.api_definition_source_id, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapServerVariable(row: DbServerVariable): ServerVariable {
  return { id: row.id, workspaceId: row.workspace_id, serverInstanceId: row.server_instance_id, key: row.key, value: row.value, createdAt: row.created_at, updatedAt: row.updated_at };
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
  return { id: row.id, workspaceId: row.workspace_id, serverInstanceId: row.server_instance_id, operationId: row.operation_id, requestDraftId: row.request_draft_id, requestSnapshotJson: row.request_snapshot_json, responseStatus: row.response_status, responseHeadersJson: row.response_headers_json, responseBody: row.response_body, durationMs: row.duration_ms, createdAt: row.created_at };
}

function mapRequestDraft(row: DbRequestDraft): RequestDraft {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    serverInstanceId: row.server_instance_id,
    sourceType: row.source_type,
    operationId: row.operation_id,
    deprecatedAt: row.deprecated_at,
    deprecationReason: row.deprecation_reason,
    name: row.name,
    isNameManual: Boolean(row.is_name_manual),
    method: row.method,
    path: row.path,
    url: row.url,
    parametersJson: row.parameters_json,
    headersJson: row.headers_json,
    body: row.body,
    contentType: row.content_type,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function findDuplicateKey(keys: string[]): string | null {
  const seen = new Set<string>();
  for (const key of keys) {
    const normalized = key.toLowerCase();
    if (seen.has(normalized)) return key;
    seen.add(normalized);
  }
  return null;
}

function truncateHistoryBody(value: string | null): string | null {
  if (value === null || value.length <= maxStoredHistoryBodyCharacters) return value;
  return `${value.slice(0, maxStoredHistoryBodyCharacters)}\n\n[Tapir truncated this stored history response.]`;
}
