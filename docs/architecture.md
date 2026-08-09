# Tapir Architecture Notes

Project engineering rules are captured in [Engineering Principles](./engineering-principles.md). In short: no code smells, and full-stack type safety is mandatory.

## Current Product Boundary

Tapir starts as a local-first, spec-bound API workspace. The first runnable loop is:

1. Add Server by base URL.
2. Discover a live OpenAPI JSON document from common paths.
3. Normalize the document into a Tapir operation list.
4. Select an operation.
5. Author path/query/header/cookie values, request bodies, variables, and supported authentication.
6. Send the request from the Electron main process.
7. Store local call history in SQLite.

Browser-generated cURL commands can enter this loop as custom request drafts. The renderer parses and previews the command locally, applies an explicit origin-only destination redirect, and sends only the resulting typed draft through the existing IPC boundary. Requests whose destination does not match a known server remain standalone in the visible Request Sandbox unless the user explicitly creates a server through OpenAPI discovery. Imported browser-only and sensitive headers are omitted unless the user opts in.

The app intentionally does not include accounts, hosted sync, team sharing, Postman import, scripting, collection runners, plugin APIs, or OpenAPI editing.

## Package Boundaries

- `packages/core`: domain types and repository/executor interfaces.
- `packages/openapi`: discovery and normalization.
- `packages/storage`: SQLite schema and repository implementations.
- `apps/desktop`: Electron host, IPC service layer, and Vue renderer.

The renderer talks to the main process through a narrow preload bridge. It does not open SQLite or execute HTTP requests directly.

## Storage and Secrets

SQLite stores local workspace data. API-key, bearer, and Basic authentication are represented as a `UserAuthProfile` plus a separate `SecretValue`, so configured credentials are not embedded into server records, request previews, history, or examples. User-authored request draft fields and history request snapshots are encrypted at rest because custom URLs, headers, parameters, and bodies can also contain credentials.

For the desktop app, sensitive local values are protected with Electron `safeStorage`. Tapir refuses to save new sensitive data when OS-backed encryption is unavailable; existing legacy plaintext values remain readable so they can be migrated without data loss.

## Process Boundary

IPC contracts are shared TypeScript types and are runtime-validated in the Electron main process. OpenAPI calls cross the boundary by server and operation identity only; the main process reloads the canonical stored operation before resolving authentication or preparing a request. Renderer-provided operation definitions are never authoritative.

The packaged renderer is bound to its exact file URL. Unexpected navigation, new windows, subframe IPC, and renderer origins are denied, and the renderer runs with a restrictive Content Security Policy.

## OpenAPI Normalization

The normalizer accepts OpenAPI 3.0 and 3.1 documents and extracts the data needed to list, author, and call operations:

- method
- path
- a stable internal operation identity plus the source operation ID
- summary/description
- tags
- path/query/header/cookie parameters
- request-body media types, examples, and response metadata as schema fragments
- security requirements and schemes
- compatibility diagnostics for unsupported or inconsistent constructs

Local JSON Pointer references are resolved during normalization. Discovery also resolves same-origin HTTP(S) external references before normalization, with per-document and combined size limits, a 15-second fetch timeout, a 16-document limit, a 16-reference depth limit, redirect-origin checks, and circular-reference termination. Cross-origin and non-HTTP(S) references are rejected rather than fetched.

Duplicate source `operationId` values receive deterministic identities derived from the HTTP method and path so draft matching is stable even if document order changes. Swagger 2.0 is rejected with a conversion diagnostic rather than being partially interpreted as OpenAPI 3.

Tapir serializes scalar, array, and object parameters for supported OpenAPI styles, including `deepObject` and query `allowReserved`. Compatibility notices are retained with the normalized definition and shown in server configuration for unsupported security schemes, invalid parameter style/shape combinations, callbacks, webhooks, TRACE operations, unresolved references, and multipart file or encoding behavior.

## Hosted-Later Shape

Repository interfaces and the HTTP executor boundary exist so future hosted/team mode can replace:

- SQLite repositories with HTTP/Postgres-backed repositories.
- Electron main-process HTTP execution with browser/proxy/server execution.
- Local-only secret storage with hosted secret references.

Those implementations are not part of the current milestone.
