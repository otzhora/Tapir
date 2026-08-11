# Tapir

Tapir is a local-first, spec-bound API workspace. The first milestone focuses on:

1. Add a deployed API server by base URL.
2. Discover the live OpenAPI document.
3. Normalize and list operations.
4. Select and call a GET operation.
5. Display the response and persist local history.

Tapir also supports importing browser-generated cURL commands into custom request tabs. Imports can retain the original destination, replace its origin with a remembered localhost target, or redirect it to an existing Tapir server while preserving the path and query. Unmatched destinations live in the standalone Request Sandbox or can create a server through normal OpenAPI discovery. Browser-only and sensitive headers are excluded by default. Prepared requests can be exported as redacted or explicitly runnable cURL for POSIX shells, PowerShell, and Windows cmd.

Team, cloud, sync, accounts, scripting, Postman import, and collection runner features are intentionally out of scope for now.

The current release scope and alpha limitations are tracked in the [changelog](./CHANGELOG.md).

## Development

```bash
npm install
npm run dev
```

The desktop app is an Electron host around a Vue web app core. Local state is stored in SQLite through repository interfaces so later hosted implementations can replace those adapters.

### Windows / Codex shell notes

Codex is configured to use the real Windows PowerShell executable for this machine:

```cmd
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
```

Avoid switching Codex back to the WindowsApps PowerShell alias at `C:\Users\rogac\AppData\Local\Microsoft\WindowsApps\pwsh.exe`; that alias has been unreliable from Codex. If an already-running thread still fails before commands run with `CreateProcessAsUserW failed: 5`, it likely cached the old shell path. Start a fresh Codex session or pass the real PowerShell path explicitly.

If PowerShell blocks `npm.ps1` or an elevated shell cannot find `node`/`npm`, use the repo launchers instead. They route through `npm.cmd` and repair the Scoop Node path:

```cmd
scripts\tapir-npm.cmd test
scripts\tapir-npm.cmd run typecheck
scripts\tapir-desktop-dev.cmd
scripts\tapir-desktop-build.cmd
scripts\tapir-package-windows.cmd
scripts\tapir-smoke-packaged-windows.cmd
scripts\tapir-release-windows.cmd
```

Electron/Vite config bundling can fail inside the Codex filesystem sandbox with `Cannot read directory "../../../../..": Access is denied.` The desktop dev/build launchers are intended to be run with elevated permission in Codex when that sandbox error appears.

## Windows package

Build the self-contained Windows x64 portable folder and ZIP with:

```cmd
scripts\tapir-package-windows.cmd
```

Then verify the exact packaged executable in a clean temporary profile:

```cmd
scripts\tapir-smoke-packaged-windows.cmd
```

Versioned artifacts are written to `artifacts/Tapir-<version>-win32-x64/` and `artifacts/Tapir-<version>-win32-x64.zip`, alongside a release manifest and SHA-256 checksum. Packaging and smoke-test logs remain under `artifacts/` when a command fails. See [Windows Packaging](./docs/windows-packaging.md) for the verification scope and release prerequisites.

Before publishing an alpha build from a clean worktree, run the full release gate:

```cmd
scripts\tapir-release-windows.cmd
```

To run Tapir with both local test APIs:

```bash
npm run dev:with-test-projects
```

## Test APIs

Two small Swagger-backed API fixtures live under `test-projects/` for testing Tapir discovery, request execution, and live authentication. Both expose header/query/cookie API keys, bearer and Basic auth, plus optional, alternative, and combined security requirements:

- `test-projects/node-swagger-api`: dependency-free Node server on `http://localhost:5051`
- `test-projects/dotnet-swagger-api`: ASP.NET Core server on `http://localhost:5052`

Each fixture has its own README with run commands and useful Swagger/OpenAPI URLs.

Run the full Tapir authentication dogfood path with `scripts\tapir-npm.cmd run dogfood:auth`.
