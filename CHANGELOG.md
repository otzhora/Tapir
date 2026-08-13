# Changelog

## 0.0.1 — 2026-08-14

Tapir's first dated release is a local-first Windows API workspace focused on OpenAPI-bound request work.

### Included

- OpenAPI 3.0 and 3.1 discovery, normalization, compatibility diagnostics, and bounded same-origin external-reference resolution.
- Schema-assisted request authoring for parameters, JSON, URL-encoded forms, and multipart bodies.
- Header, query, and cookie API keys plus bearer and Basic authentication, with OS-backed secret storage and redaction.
- Custom request tabs with browser-generated cURL import and redacted or runnable cURL export.
- Compact per-request history with status, timing, and restoration into the current or a new request tab.
- Server editing, refresh, rediscovery, deletion, variables, collapsible operation groups, and request-tab controls.
- Windows x64 install wizard and portable packaging with source provenance, SHA-256 checksums, and clean-profile smoke verification.
- A Windows tray icon with Open, update-check, and explicit Quit actions; closing the main window keeps Tapir available in the tray.
- In-app update checks, downloads, progress, and restart-to-install backed by GitHub Releases.
- Path-aware OpenAPI discovery plus an optional explicit specification URL during server creation.
- Compatibility with large production definitions including GitHub and Stripe without eagerly expanding recursive response graphs.

### Release limitations

- The Windows installer is unsigned and may trigger a Windows reputation warning.
- Accounts, hosted sync, teams, Postman import, scripting, and collection runners are not included.
- Multipart file fields and some advanced OpenAPI constructs are reported as unsupported rather than executed partially.

See [Alpha Dogfooding](./docs/alpha-dogfooding.md) for the real-work validation matrix and finding template.
