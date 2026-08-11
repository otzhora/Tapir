# Tapir Alpha Dogfooding

Use this checklist to validate Tapir against real work without turning an exploratory session into an undocumented pass/fail claim. Never commit credentials, authorization headers, cookies, private URLs, or response bodies captured during these sessions.

## Session setup

1. Build and smoke-test the exact alpha candidate with `scripts\tapir-release-windows.cmd`.
2. Confirm `sourceDirty` is `false` in `artifacts/release-summary.json`.
3. Extract the versioned ZIP into a fresh directory and start with a new Tapir profile when validating first-run behavior.
4. Record only the Tapir version, source revision, Windows version, API name, public specification URL, and sanitized observations.

The repeatable public compatibility tranche can be run with:

```cmd
scripts\tapir-npm.cmd run dogfood:public
```

It exercises only documented, read-only public endpoints and writes the sanitized result to `artifacts/dogfood-public-apis.json`. Expected compatibility rejections are distinguished from regressions.

Before exploratory dogfooding, run the real Electron workflow harness:

```cmd
scripts\tapir-desktop-e2e.cmd
```

It launches a production build with an isolated temporary profile and ephemeral copies of both bundled
mock APIs. The pass covers discovery, authentication, request tabs, history, cURL import, server editing,
destructive-action cancellation, and cold-restart persistence. Its sanitized report and screenshots are
written to `artifacts/e2e-electron/`. The Windows release preflight runs this harness automatically.

For a slower full-service persistence pass, run:

```cmd
scripts\tapir-npm.cmd run dogfood:service
```

This imports GitHub's large official definition through `TapirApplicationService`, executes a documented public operation and a standalone non-success request, persists both history entries in SQLite, restarts the storage and service layers, and verifies the definition and history reload. The runner restores `better-sqlite3` to Electron's ABI before exiting.

For the local authentication matrix, run:

```cmd
scripts\tapir-npm.cmd run dogfood:auth
```

This discovers the Node fixture through `TapirApplicationService`, configures header/query/cookie API keys plus bearer and Basic credentials, exercises simple, optional, alternative, and combined security requirements, checks redaction in returned requests and history, restarts SQLite, and verifies credential profiles reload without exposing their values. The normal fixture smoke suite independently checks the same OpenAPI and runtime contract in both the Node and .NET mocks.

## Minimum real-work matrix

Complete at least eight API rows. A single API may cover several characteristics, but the full set must cover each characteristic at least once.

| Characteristic | What to verify |
| --- | --- |
| Public, unauthenticated API | Automatic discovery, grouped operations, GET execution, response rendering, and history restoration |
| Explicit specification URL | Adding a service whose document is not at a common discovery path |
| Header or query API key | Configuration survives restart; previews, history, errors, and exported redacted cURL do not reveal the key |
| Bearer authentication | Authenticated call succeeds; replacing and removing the token behave predictably |
| Path, query, header, and cookie parameters | Examples/defaults are useful and serialized URLs/headers match the specification |
| JSON and form request bodies | Required fields, regeneration protection, media-type switching, and server acceptance |
| External references or OpenAPI 3.1 | Resolution completes within safety limits and unsupported constructs produce actionable diagnostics |
| Browser-generated cURL | Import, destination choice, sensitive-header handling, execution, and shell-specific export |
| Multi-server workspace | Switching, collapsing groups, editing, refreshing, deleting, and tab behavior remain understandable |
| Failure behavior | Invalid spec, offline host, timeout, non-JSON response, HTTP error, and restart recovery are legible |

## Core workflow for each API

1. Add the server using the base URL first; use an explicit specification URL only when necessary.
2. Read compatibility diagnostics before sending a request.
3. Open representative operations from different tags and inspect generated values.
4. Preview the request, send it, and compare the actual destination and serialization with the API documentation.
5. Restore the call from workspace history and send it again.
6. Restart Tapir and confirm server configuration, drafts, variables, history, and configured-auth state reload correctly.
7. Refresh the specification and note whether changed operations preserve or invalidate drafts clearly.
8. Exercise one deliberate failure and assess whether the message suggests the next action.

## Sanitized finding template

```text
Tapir version / revision:
Windows version:
API and public spec URL:
Workflow:
Expected:
Observed:
Reproduction steps:
Compatibility diagnostics shown:
Frequency: always / intermittent / once
Severity: blocker / high friction / minor
Sensitive data removed: yes
```

## Alpha exit decision

The alpha is ready to expand only when there are no known data-loss, secret-exposure, request-correctness, startup, or packaging blockers. Repeated usability problems in the add-server → author → send → inspect → restore loop should be fixed before accepting broader feature work. Minor API-specific compatibility gaps may remain when Tapir reports them accurately and gives the user a practical next step.
