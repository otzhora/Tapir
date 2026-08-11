# Windows Packaging

Tapir currently produces a versioned portable Windows x64 folder and ZIP. It does not yet produce a signed installer.

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

- `artifacts/Tapir-<version>-win32-x64/Tapir.exe`
- `artifacts/Tapir-<version>-win32-x64.zip`
- `artifacts/release-manifest.json`
- `artifacts/SHA256SUMS.txt`
- `artifacts/package-windows.log`

The version comes from the root `package.json` and is also embedded in the packaged application. The manifest records the platform, architecture, archive name, SHA-256 checksum, source revision, dirty-worktree state, and build time. The packaging log is initialized before compilation and retained if any build, native rebuild, assembly, or compression step fails.

## Packaged smoke test

Run after packaging:

```cmd
scripts\tapir-smoke-packaged-windows.cmd
```

The smoke test reads `artifacts/release-manifest.json`, verifies the ZIP checksum, extracts the declared archive into a temporary directory, and launches that packaged `Tapir.exe`, not the repository Electron binary or the assembly folder, with a clean temporary user-data directory. A hidden production window loads the packaged renderer and preload bridge. The packaged main process then:

1. Creates the SQLite database and runs migrations.
2. Loads `better-sqlite3` from the artifact using Electron's ABI.
3. Discovers the local Node fixture's OpenAPI document.
4. Executes its unauthenticated `getHealth` operation.
5. Verifies the 200 response and persisted history entry.
6. Reports its embedded version so the runner can compare it with the release manifest.
7. Writes a structured report before exiting.

The runner checks that the resources and native binding paths resolve inside the temporary extracted artifact, proving the ZIP is readable and the application does not load repository-local runtime files or a development server. Temporary extraction and profile data are removed after the run; detailed output is retained in `artifacts/smoke-packaged-windows.log`.

## Release preflight

From a clean worktree, run:

```cmd
scripts\tapir-release-windows.cmd
```

This single gate runs typechecking, all tests and fixture authentication checks, packaging, checksum verification, the packaged-application smoke test, and `git diff --check`. It writes `artifacts/release-summary.json` and `artifacts/release-windows.log`.

For local verification while developing the release workflow, `scripts\tapir-release-windows.cmd --allow-dirty` permits uncommitted changes. The resulting manifest is marked with `sourceDirty: true` and must not be published.

## Alpha publication checklist

Before sharing an artifact:

1. Update the root package version and user-facing release notes.
2. Commit all intended changes and run the release preflight from the clean commit.
3. Confirm `sourceDirty` is `false` in both release JSON files.
4. Upload the versioned ZIP, `release-manifest.json`, and `SHA256SUMS.txt` together.
5. State clearly that the portable alpha is unsigned and may trigger Windows reputation warnings.
6. Keep the matching source revision available for diagnosis.

Code signing, an application icon, installer metadata, and release-channel publication remain required before a broad public release.
