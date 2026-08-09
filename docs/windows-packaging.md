# Windows Packaging

Tapir currently ships as a portable Windows x64 folder and ZIP. It does not yet produce a signed installer.

## Prerequisites

- Windows x64.
- The repository dependencies installed with `npm install`.
- The native build prerequisites required by `@electron/rebuild` and `better-sqlite3`.
- The repository launchers' Node/npm environment described in `AGENTS.md` and the README.
- `tar.exe`, included with supported Windows installations, for ZIP creation.

Code signing, an application icon, installer metadata, and release-channel publication remain release-management work outside this packaging verification phase.

## Build

Run:

```cmd
scripts\tapir-package-windows.cmd
```

The command:

1. Builds the workspace packages and production Electron main, preload, and renderer bundles.
2. Rebuilds `better-sqlite3` for the installed Electron ABI and verifies that Electron can load it.
3. Copies the Electron runtime, application bundles, and required native module into a self-contained portable directory.
4. Renames the runtime executable to `Tapir.exe`.
5. Creates a ZIP distributable.

Outputs:

- `artifacts/Tapir-win32-x64/Tapir.exe`
- `artifacts/Tapir-win32-x64.zip`
- `artifacts/package-windows.log`

The packaging log is initialized before compilation and retained if any build, native rebuild, assembly, or compression step fails.

## Packaged smoke test

Run after packaging:

```cmd
scripts\tapir-smoke-packaged-windows.cmd
```

The smoke test extracts `artifacts/Tapir-win32-x64.zip` into a temporary directory and launches that packaged `Tapir.exe`, not the repository Electron binary or the assembly folder, with a clean temporary user-data directory. A hidden production window loads the packaged renderer and preload bridge. The packaged main process then:

1. Creates the SQLite database and runs migrations.
2. Loads `better-sqlite3` from the artifact using Electron's ABI.
3. Discovers the local Node fixture's OpenAPI document.
4. Executes its unauthenticated `getHealth` operation.
5. Verifies the 200 response and persisted history entry.
6. Writes a structured report before exiting.

The runner checks that the resources and native binding paths resolve inside the temporary extracted artifact, proving the ZIP is readable and the application does not load repository-local runtime files or a development server. Temporary extraction and profile data are removed after the run; detailed output is retained in `artifacts/smoke-packaged-windows.log`.
