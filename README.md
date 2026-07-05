# Tapir

Tapir is a local-first, spec-bound API workspace. The first milestone focuses on:

1. Add a deployed API server by base URL.
2. Discover the live OpenAPI document.
3. Normalize and list operations.
4. Select and call a GET operation.
5. Display the response and persist local history.

Team, cloud, sync, accounts, scripting, Postman import, and collection runner features are intentionally out of scope for now.

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
```

Electron/Vite config bundling can fail inside the Codex filesystem sandbox with `Cannot read directory "../../../../..": Access is denied.` The desktop dev/build launchers are intended to be run with elevated permission in Codex when that sandbox error appears.

To run Tapir with both local test APIs:

```bash
npm run dev:with-test-projects
```

## Test APIs

Two small Swagger-backed API fixtures live under `test-projects/` for testing Tapir discovery and request execution:

- `test-projects/node-swagger-api`: dependency-free Node server on `http://localhost:5051`
- `test-projects/dotnet-swagger-api`: ASP.NET Core server on `http://localhost:5052`

Each fixture has its own README with run commands and useful Swagger/OpenAPI URLs.
