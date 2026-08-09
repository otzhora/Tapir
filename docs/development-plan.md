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

Status: `Completed` on 2026-08-09.

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

Completion evidence:

- Workspace history uses keyset pagination ordered by creation time and ID, and repository coverage proves newly arriving calls do not shift later pages.
- Indexed SQLite queries filter by server or standalone status, method, response status, operation ID, and time range, and search retained request URLs and draft names.
- Standalone and cross-server calls restore their request and response state, creating a detached custom draft when the original draft no longer exists.
- Individual deletion and filtered clearing are workspace-scoped and both require confirmation in the renderer.
- Stored response bodies are capped at 1,000,000 characters with an explicit truncation marker.
- Typechecking, 51 tests, fixture smoke tests, `git diff --check`, and the production build pass.

## Phase 6 — OpenAPI compatibility and diagnostics

Status: `Completed` on 2026-08-09.

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

Completion evidence:

- Scalar, array, and JSON-object parameters serialize across supported path, query, header, and cookie styles, including nested `deepObject` values and query `allowReserved`; history restoration recreates editable object JSON.
- Discovery resolves local and same-origin external references with HTTP(S)-only enforcement, redirect-origin checks, 15-second timeouts, 2 MB per-reference and 10 MB aggregate size limits, 16-document and 16-reference-depth limits, cache reuse, and circular-reference termination.
- OpenAPI 3.0 and 3.1 compatibility fixtures pass; JSON Schema `const`, `examples`, type arrays, tuple `prefixItems`, `$ref` siblings, and composed required fields feed request authoring.
- Duplicate source operation IDs receive deterministic method-and-path identities independent of document order.
- Swagger 2.0 and unknown versions fail with conversion/support guidance.
- Normalized diagnostics identify unresolved references, unsupported security, parameter, callback, webhook, TRACE, multipart file, and media-encoding constructs, and the renderer shows them in server configuration.
- Architecture documentation now matches reference resolution and compatibility behavior.
- Typechecking, 65 tests, fixture smoke tests, `git diff --check`, and the production build pass.

## Phase 7 — Packaged application verification

Status: `Completed` on 2026-08-09.

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

Completion evidence:

- `scripts\tapir-package-windows.cmd` produces a self-contained portable Windows x64 directory and ZIP without adding a packaging dependency.
- Packaging rebuilds and independently loads `better-sqlite3` for Electron ABI 146 before copying the native binding into the artifact.
- Packaging and smoke commands initialize persistent artifact logs before work begins, so compilation, native rebuild, assembly, launch, and verification failures retain diagnostics.
- `scripts\tapir-smoke-packaged-windows.cmd` extracts the ZIP to a temporary location, launches that packaged `Tapir.exe` with a clean temporary profile, and loads the bundled production renderer and preload bridge.
- The packaged main process creates and migrates SQLite, discovers the Node fixture, executes `getHealth` with status 200, and reads back one history entry.
- The structured smoke report proves Electron resources and the native binding resolve from the temporary ZIP extraction rather than repository paths; no development server is used.
- Artifact locations, prerequisites, verification scope, and remaining signing/installer work are documented in `docs/windows-packaging.md`.

## Phase 8 — Renderer request-workspace refactor

Status: `Completed` on 2026-08-09.

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

Completion evidence:

- `useOperationRequest.ts` is reduced from 582 to 382 lines and remains the stable App-facing orchestrator.
- `useRequestDraftPersistence.ts` owns loading, optimistic state, deletion, per-draft save queues, stale-response protection, and recovery after failed saves.
- `useRequestExecution.ts` owns request/response state, sending, previewing, typed bridge calls, inactive-draft guards, and per-draft preview generations that discard stale completions.
- `useRequestHistoryRestoration.ts` owns standalone and OpenAPI restoration plus response reconstruction, including empty-body responses.
- `requestDraftModel.ts` contains small typed builders for draft creation and operation/custom IPC payloads, along with defensive saved-field parsers.
- Direct unit tests cover IPC payload fidelity, malformed persisted arrays, autosave ordering, failed-save recovery, stale save responses, stale preview responses, and history response reconstruction.
- The existing App behavior tests continue to pass without changing the composable's public API; all boundary payload types continue to come from `@tapir/core` or the preload bridge.
- Typechecking, 72 tests, fixture smoke tests, a fresh production Windows package build, the extracted-ZIP packaged-app smoke test, and `git diff --check` pass.

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
- Committed Phase 4 as `717b7b7` (`Generate schema-assisted request examples`).
- Completed Phase 5 workspace-scale history; commit recorded after verification.
- Committed Phase 5 as `66b5551` (`Scale workspace request history`).
- Completed Phase 6 OpenAPI compatibility and diagnostics; commit recorded after verification.
- Committed Phase 6 as `7cfc33b` (`Broaden OpenAPI compatibility`).
- Completed Phase 7 packaged application verification; commit recorded after verification.
- Committed Phase 7 as `c53e5fc` (`Verify packaged Windows application`).
- Completed Phase 8 renderer request-workspace refactor; commit recorded after verification.
