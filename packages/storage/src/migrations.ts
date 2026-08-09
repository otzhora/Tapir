import type Database from "better-sqlite3";
import { Umzug, type MigrationMeta, type UmzugStorage } from "umzug";

type SqliteDatabase = Database.Database;

interface MigrationContext {
  db: SqliteDatabase;
}

const initialSchema = [
  `create table workspaces (
    id text primary key,
    name text not null,
    created_at text not null,
    updated_at text not null
  )`,
  `create table server_instances (
    id text primary key,
    workspace_id text not null references workspaces(id),
    name text not null,
    base_url text not null,
    spec_url text not null,
    api_definition_source_id text,
    created_at text not null,
    updated_at text not null
  )`,
  `create table api_definition_sources (
    id text primary key,
    workspace_id text not null references workspaces(id),
    server_instance_id text not null references server_instances(id),
    source_url text not null,
    discovery_method text not null,
    last_fetched_at text not null,
    created_at text not null,
    updated_at text not null
  )`,
  `create table api_definitions (
    id text primary key,
    source_id text not null references api_definition_sources(id),
    name text not null,
    version text not null,
    raw_spec_json text not null,
    normalized_json text not null,
    fetched_at text not null
  )`,
  `create table user_auth_profiles (
    id text primary key,
    workspace_id text not null references workspaces(id),
    server_instance_id text references server_instances(id),
    name text not null,
    type text not null,
    config_json text not null,
    secret_ref text not null,
    created_at text not null,
    updated_at text not null
  )`,
  `create table secret_values (
    id text primary key,
    auth_profile_id text not null references user_auth_profiles(id),
    encrypted_or_plain_value text not null,
    created_at text not null,
    updated_at text not null
  )`,
  `create table call_history_entries (
    id text primary key,
    workspace_id text not null references workspaces(id),
    server_instance_id text not null references server_instances(id),
    operation_id text,
    request_snapshot_json text not null,
    response_status integer,
    response_headers_json text,
    response_body text,
    duration_ms integer,
    created_at text not null
  )`
];

export async function runMigrations(db: SqliteDatabase): Promise<void> {
  const migrator = new Umzug<MigrationContext>({
    context: { db },
    logger: undefined,
    migrations: [
      {
        name: "0001_initial_schema",
        up: async ({ context }) => runTransaction(context.db, initialSchema),
        down: async ({ context }) => runTransaction(context.db, [
          "drop table call_history_entries",
          "drop table secret_values",
          "drop table user_auth_profiles",
          "drop table api_definitions",
          "drop table api_definition_sources",
          "drop table server_instances",
          "drop table workspaces"
        ])
      },
      {
        name: "0002_request_drafts",
        up: async ({ context }) => runTransaction(context.db, [
          `create table request_drafts (
            id text primary key,
            workspace_id text not null references workspaces(id),
            server_instance_id text references server_instances(id),
            source_type text not null,
            operation_id text,
            name text not null,
            is_name_manual integer not null,
            method text not null,
            path text not null,
            url text not null,
            parameters_json text not null,
            headers_json text not null,
            body text not null,
            content_type text not null,
            sort_order integer not null,
            created_at text not null,
            updated_at text not null
          )`,
          "create index request_drafts_workspace_idx on request_drafts(workspace_id, server_instance_id, operation_id, source_type, sort_order)"
        ]),
        down: async ({ context }) => runTransaction(context.db, [
          "drop index request_drafts_workspace_idx",
          "drop table request_drafts"
        ])
      },
      {
        name: "0003_history_request_draft_id",
        up: async ({ context }) => runTransaction(context.db, [
          "alter table call_history_entries add column request_draft_id text"
        ]),
        down: async () => undefined
      },
      {
        name: "0004_request_draft_deprecation",
        up: async ({ context }) => runTransaction(context.db, [
          "alter table request_drafts add column deprecated_at text",
          "alter table request_drafts add column deprecation_reason text"
        ]),
        down: async () => undefined
      },
      {
        name: "0005_server_variables",
        up: async ({ context }) => runTransaction(context.db, [
          `create table server_variables (
            id text primary key,
            workspace_id text not null references workspaces(id),
            server_instance_id text not null references server_instances(id),
            key text not null,
            value text not null,
            created_at text not null,
            updated_at text not null,
            unique(server_instance_id, key)
          )`,
          "create index server_variables_server_idx on server_variables(server_instance_id, key)"
        ]),
        down: async ({ context }) => runTransaction(context.db, [
          "drop index server_variables_server_idx",
          "drop table server_variables"
        ])
      },
      {
        name: "0006_workspace_history",
        up: async ({ context }) => runTransaction(context.db, [
          `create table call_history_entries_next (
            id text primary key,
            workspace_id text not null references workspaces(id),
            server_instance_id text references server_instances(id),
            operation_id text,
            request_draft_id text,
            request_snapshot_json text not null,
            request_method text not null,
            request_url text not null,
            draft_name text,
            response_status integer,
            response_headers_json text,
            response_body text,
            duration_ms integer,
            created_at text not null
          )`,
          `insert into call_history_entries_next
            (id, workspace_id, server_instance_id, operation_id, request_draft_id, request_snapshot_json, request_method, request_url, draft_name, response_status, response_headers_json, response_body, duration_ms, created_at)
            select id, workspace_id, server_instance_id, operation_id, request_draft_id, request_snapshot_json,
              case when json_valid(request_snapshot_json) then coalesce(json_extract(request_snapshot_json, '$.method'), 'GET') else 'GET' end,
              case when json_valid(request_snapshot_json) then coalesce(json_extract(request_snapshot_json, '$.url'), '') else '' end,
              (select name from request_drafts where request_drafts.id = call_history_entries.request_draft_id),
              response_status, response_headers_json, response_body, duration_ms, created_at
            from call_history_entries`,
          "drop table call_history_entries",
          "alter table call_history_entries_next rename to call_history_entries",
          "create index call_history_workspace_cursor_idx on call_history_entries(workspace_id, created_at desc, id desc)",
          "create index call_history_server_cursor_idx on call_history_entries(server_instance_id, created_at desc, id desc)",
          "create index call_history_workspace_method_status_idx on call_history_entries(workspace_id, request_method, response_status)"
        ]),
        down: async () => undefined
      }
    ],
    storage: new BetterSqliteUmzugStorage(db)
  });

  await migrator.up();
}

class BetterSqliteUmzugStorage implements UmzugStorage<MigrationContext> {
  constructor(private db: SqliteDatabase) {
    this.db.prepare(`
      create table if not exists schema_migrations (
        name text primary key,
        executed_at text not null
      )
    `).run();
  }

  async logMigration({ name }: MigrationMeta): Promise<void> {
    this.db.prepare("insert into schema_migrations (name, executed_at) values (?, ?)")
      .run(name, new Date().toISOString());
  }

  async unlogMigration({ name }: MigrationMeta): Promise<void> {
    this.db.prepare("delete from schema_migrations where name = ?").run(name);
  }

  async executed(): Promise<string[]> {
    const rows = this.db.prepare("select name from schema_migrations order by name").all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }
}

function runTransaction(db: SqliteDatabase, statements: string[]): void {
  db.transaction(() => {
    for (const statement of statements) {
      db.prepare(statement).run();
    }
  })();
}
