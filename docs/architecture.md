# Tapir Architecture Notes

Project engineering rules are captured in [Engineering Principles](./engineering-principles.md). In short: no code smells, and full-stack type safety is mandatory.

## Current Product Boundary

Tapir starts as a local-first, spec-bound API workspace. The first runnable loop is:

1. Add Server by base URL.
2. Discover a live OpenAPI JSON document from common paths.
3. Normalize the document into a Tapir operation list.
4. Select an operation.
5. Add path/query/header values and optional API key header auth.
6. Send the request from the Electron main process.
7. Store local call history in SQLite.

The app intentionally does not include accounts, hosted sync, team sharing, Postman import, scripting, collection runners, plugin APIs, or OpenAPI editing.

## Package Boundaries

- `packages/core`: domain types and repository/executor interfaces.
- `packages/openapi`: discovery and normalization.
- `packages/storage`: SQLite schema and repository implementations.
- `apps/desktop`: Electron host, IPC service layer, and Vue renderer.

The renderer talks to the main process through a narrow preload bridge. It does not open SQLite or execute HTTP requests directly.

## Storage and Secrets

SQLite stores local workspace data. API key header auth is represented as a `UserAuthProfile` plus a separate `SecretValue`, so secrets are not embedded into server records or examples.

For the MVP, `SecretValue.encryptedOrPlainValue` stores plaintext locally. This is a deliberate temporary compromise. Before broader use, desktop storage should move to OS-backed secure storage or encrypted values while preserving the same repository interface.

## OpenAPI Normalization

The first normalizer extracts enough OpenAPI data to list and call operations:

- method
- path
- operation id
- summary/description
- tags
- path/query/header/cookie parameters
- request body and response metadata as raw schema fragments

The normalizer does not yet resolve `$ref`, infer auth UI from security schemes, or generate request bodies from schemas.

## Hosted-Later Shape

Repository interfaces and the HTTP executor boundary exist so future hosted/team mode can replace:

- SQLite repositories with HTTP/Postgres-backed repositories.
- Electron main-process HTTP execution with browser/proxy/server execution.
- Local-only secret storage with hosted secret references.

Those implementations are not part of the current milestone.
