# Tapir Development Plan

This document tracks the next product and engineering phases for Tapir. Update it when a phase starts, its scope changes, or its acceptance criteria are completed.

Status values:

- `Completed`: implemented and verified.
- `In progress`: the current development focus.
- `Planned`: agreed work that has not started.
- `Deferred`: intentionally outside the current sequence.

## Current baseline

Tapir has a working local-first Electron loop for discovering OpenAPI definitions, preparing and sending requests, storing drafts and history, configuring server variables, and securely persisting header API keys.

The baseline verification commands are:

```cmd
scripts\tapir-npm.cmd run typecheck
scripts\tapir-npm.cmd test
scripts\tapir-desktop-build.cmd
```

The desktop build may require running the repository launcher outside the Codex filesystem sandbox, as documented in `AGENTS.md`.

## Phase 1 — Request correctness

Status: `Completed` on 2026-08-09.

Goal: ensure Tapir sends requests that match the normalized OpenAPI operation instead of silently changing parameter meaning.

Completed scope:

- Apply OpenAPI operation-level parameter overrides to matching path-level parameters.
- Preserve parameter schema and serialization metadata through the renderer-to-main request boundary.
- Distinguish scalar values containing commas from schema-defined arrays.
- Support common `form`, `simple`, `label`, `matrix`, `spaceDelimited`, and `pipeDelimited` array serialization behavior.
- Serialize OpenAPI cookie parameters into the `Cookie` header.
- Support cookie parameters in custom requests.
- Restore cookie values from saved history.
- Add coverage in core, OpenAPI, and desktop renderer tests.

Acceptance evidence:

- Typechecking passes.
- 37 tests pass, including fixture authentication smoke tests.
- The production Electron/Vite build passes.
- `git diff --check` passes.

Remaining advanced serialization cases, including object parameters, `deepObject`, and `allowReserved`, belong to Phase 6 rather than expanding this phase indefinitely.

## Phase 2 — Authentication

Status: `Completed` on 2026-08-09.

Goal: support the authentication mechanisms commonly declared by real OpenAPI documents while keeping secret values out of the renderer, previews, history, and logs.

Planned scope:

- Generalize the authentication repository and IPC contracts without exposing secrets to the renderer.
- Support API keys in headers, query parameters, and cookies.
- Support HTTP bearer tokens.
- Support HTTP Basic authentication.
- Respect optional security requirements and OpenAPI alternative requirements.
- Allow credentials to be replaced, disabled, and removed.
- Clearly show supported and unsupported schemes in the request UI.
- Redact credentials from request previews, generated cURL commands, persisted history, and errors.
- Preserve compatibility with existing saved header API-key profiles.

Acceptance criteria:

- Each supported scheme has preparation, injection, and redaction tests.
- Restart tests prove encrypted credentials reload without reaching the renderer.
- Optional authentication works both configured and unconfigured.
- Existing databases migrate without losing header API keys.
- Fixture or integration tests exercise at least API-key and bearer flows.

Completion evidence:

- Scheme-keyed encrypted profiles support multiple credentials per server.
- Header, query, and cookie API keys plus bearer and Basic authentication are injected and redacted.
- Optional, alternative, and combined security requirements have service-level coverage.
- Credentials can be replaced and removed from the request UI.
- Legacy `apiKeyHeader` rows load without rewriting or losing encrypted values.
- Node and .NET fixtures validate both API-key and bearer endpoints.
- Typechecking, 40 tests, fixture smoke tests, and the production build pass.

## Phase 3 — Server lifecycle management

Status: `Completed` on 2026-08-09.

Goal: let users maintain servers without manually deleting the local database.

Planned scope:

- Rename a server.
- Edit its base URL and explicit specification URL.
- Re-discover or refresh after configuration changes.
- Delete a server through a confirmation flow.
- Transactionally clean up definitions, variables, drafts, history, and credentials.
- Define whether detached custom drafts are preserved or deleted, and communicate that choice in the UI.

Acceptance criteria:

- Repository operations are transactional and workspace-scoped.
- Foreign-key behavior and deletion semantics have storage tests.
- Renderer tests cover editing, cancellation, deletion confirmation, and selection fallback.

Completion evidence:

- Server names, base URLs, and explicit OpenAPI document URLs are editable and validated.
- Configured-document refresh and base-URL rediscovery are separate explicit actions.
- Deletion confirmation documents the retention policy: custom drafts are detached and retained; OpenAPI drafts and all other server-owned data are removed.
- SQLite performs draft detachment and dependent-record cleanup in one transaction.
- Storage, service, and renderer tests cover editing, both refresh paths, cancellation, deletion, cleanup, and fallback behavior.
- Typechecking, 41 tests, fixture smoke tests, and the production build pass.

## Phase 4 — Schema-assisted request authoring

Status: `Completed` on 2026-08-09.

Goal: shorten the path from discovering an operation to sending a valid representative request.

Planned scope:

- Populate parameter examples and defaults.
- Extract request-body examples from OpenAPI media types.
- Generate a conservative editable JSON example from object schemas.
- Indicate required body fields and surface useful validation messages.
- Add media-type-aware editors for URL-encoded forms and multipart requests.
- Avoid overwriting bodies the user has already edited.

Acceptance criteria:

- Generated examples are deterministic and covered by unit tests.
- Recursive and circular schemas terminate safely.
- Switching media types preserves or explicitly confirms destructive body changes.
- Multipart requests execute correctly from the Electron main process.

Completion evidence:

- Parameter and body examples/defaults are normalized and used when new OpenAPI drafts are created.
- Deterministic, depth-bounded schema generation covers objects, arrays, composition, enums, formats, and circular schemas.
- Required body fields are shown in the UI and validated before execution.
- Media-type changes preserve edited bodies; explicit regeneration requires confirmation before replacement.
- JSON-object editors back URL-encoded and multipart form preparation, with multipart converted to `FormData` in the main process.
- Desktop builds now compile workspace runtime dependencies first, preventing stale `dist` exports.
- Typechecking, 47 tests, fixture smoke tests, and the production build pass.

## Phase 5 — History at workspace scale

Status: `Planned`.

Goal: make history useful beyond the current fixed list of 50 server calls.

Planned scope:

- Add cursor-based or keyset pagination.
- Support workspace-level history, including standalone custom requests.
- Filter by server, method, status, operation, and time.
- Search request URLs and draft names.
- Delete individual entries and clear a filtered history set with confirmation.
- Define and enforce response-body retention limits.

Acceptance criteria:

- Pagination is stable when new calls arrive.
- Queries use appropriate SQLite indexes and have repository tests.
- Standalone custom calls can be restored from history.
- Destructive history actions require explicit confirmation.

## Phase 6 — OpenAPI compatibility and diagnostics

Status: `Planned`.

Goal: handle a broader range of real specifications and explain unsupported input precisely.

Planned scope:

- Complete object parameter serialization, including `deepObject` and `allowReserved` behavior.
- Add external `$ref` fetching with size, timeout, origin, cycle, and depth limits.
- Improve OpenAPI 3.1 schema handling.
- Detect duplicate operation IDs and produce stable internal identities.
- Either support Swagger 2.0 or reject it with a clear diagnostic.
- Report partially unsupported security schemes, parameter styles, and media types.
- Update `docs/architecture.md` so its `$ref` description matches the implementation.

Acceptance criteria:

- Compatibility fixtures cover supported OpenAPI versions and edge cases.
- External references cannot bypass discovery limits or fetch unsafe schemes.
- Unsupported constructs result in actionable diagnostics rather than silent omission.

## Phase 7 — Packaged application verification

Status: `Planned`.

Goal: verify the application users install, not only the Electron/Vite compilation output.

Planned scope:

- Produce a Windows distributable through a documented packaging command.
- Launch the packaged application in a clean test profile.
- Verify database creation and migrations.
- Discover a fixture API and execute a request.
- Verify native `better-sqlite3` loading under the packaged Electron ABI.
- Document artifact locations and release prerequisites.

Acceptance criteria:

- A repeatable packaged-app smoke test passes locally.
- Packaging failures preserve useful logs.
- The installed app does not depend on repository-local files or development servers.

## Phase 8 — Renderer request-workspace refactor

Status: `Planned`.

Goal: reduce coupling before authentication, body editing, and history features make the request workspace harder to change safely.

This phase may be pulled forward when another phase would otherwise make `useOperationRequest.ts` substantially larger.

Planned scope:

- Separate draft lifecycle and persistence from request preparation and execution.
- Isolate history restoration and response state.
- Keep IPC payload construction in small typed functions.
- Preserve current autosave ordering and stale-preview protections.
- Prefer behavior-preserving extraction over a broad UI rewrite.

Acceptance criteria:

- Existing renderer behavior tests remain unchanged or become more focused.
- Extracted modules have direct unit tests.
- No new process-boundary types are defined only inside the renderer.

## Progress log

### 2026-08-09

- Created this tracked plan.
- Recorded Phase 1 as completed.
- Committed Phase 1 as `dc7b8aa` (`Fix OpenAPI parameter serialization`).
- Completed Phase 2 authentication; commit recorded after verification.
- Committed Phase 2 as `08bf45f` (`Expand OpenAPI authentication support`).
- Completed Phase 3 server lifecycle management; commit recorded after verification.
- Committed Phase 3 as `b8871b8` (`Add server lifecycle management`).
- Completed Phase 4 schema-assisted request authoring; commit recorded after verification.
